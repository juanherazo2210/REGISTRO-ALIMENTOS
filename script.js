(function(){
'use strict';
var $=function(s){return document.querySelector(s)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var pad=function(n){return String(n).padStart(2,'0')};
var ymd=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
var fmtMin=function(m){return pad(Math.floor(m/60))+':'+pad(m%60)};
var toMin=function(t){var p=String(t).split(':');return (+p[0])*60+(+p[1])};
var clone=function(o){return JSON.parse(JSON.stringify(o))};
var num=function(v){return (typeof v==='number'&&isFinite(v))?v:null};
var pct=function(x){return x.toFixed(1).replace('.',',')+'%'};
var DAYS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var COURSES=['Transición','1°','2°','3°','4°','5°','6°','7°','8°','9°','10°','11°'];
var LS='comedor-escolar-v1';

var S={days:{},slots:null,slotsSaved:false,reader:null,tab:'hoy',selDow:1,edit:false,demoOn:true,
  db:null,dbChecked:false,canWrite:true,courseDirty:false,wasteDirty:false,readerDirty:false};
var ctx={map:{},demo:false};

/* ---------- guardado local (cuando no hay base de datos compartida) ---------- */
function loadLocal(){
  try{
    var r=JSON.parse(localStorage.getItem(LS)||'null');
    if(r){S.days=r.days||{};S.slots=r.slots||null;S.slotsSaved=!!r.slotsSaved;S.reader=r.reader||null}
  }catch(e){}
}
function persistLocal(){
  if(S.db)return;
  try{localStorage.setItem(LS,JSON.stringify({days:S.days,slots:S.slots,slotsSaved:S.slotsSaved,reader:S.reader}))}catch(e){}
}

/* ---------- horario ---------- */
function defaultSlots(){
  return COURSES.map(function(c,i){var s=11*60+30+i*15;return {id:'d'+i,course:c,start:fmtMin(s),end:fmtMin(s+15),days:[1,2,3,4,5]}});
}
function getSlots(){return S.slots||defaultSlots()}
function slotsFor(dow){
  return getSlots().filter(function(s){return s.days.indexOf(dow)>=0}).sort(function(a,b){return toMin(a.start)-toMin(b.start)});
}
function weekDate(dow){
  var d=new Date(),cur=d.getDay()===0?7:d.getDay();
  d.setDate(d.getDate()+(dow-cur));return d;
}
/* Estado de un turno: 'past' (ya pasó), 'now' (en turno), 'next' (pendiente) o 'future'.
   La marca manual (day.passed[id] = true/false) manda sobre la hora. */
function slotStatus(slot,dateStr){
  var n=new Date(),today=ymd(n);
  if(dateStr>today)return 'future';
  var dd=S.days[dateStr],man=(dd&&dd.passed)?dd.passed[slot.id]:undefined;
  if(man===true)return 'past';
  if(dateStr<today)return man===false?'next':'past';
  var m=n.getHours()*60+n.getMinutes();
  if(m>=toMin(slot.start)&&m<toMin(slot.end))return 'now';
  if(man===false)return 'next';
  return m>=toMin(slot.end)?'past':'next';
}
function nowInfo(){
  var n=new Date(),m=n.getHours()*60+n.getMinutes(),dow=n.getDay(),list=slotsFor(dow),t=ymd(n);
  return {m:m,dow:dow,list:list,
    cur:list.find(function(s){return slotStatus(s,t)==='now'}),
    next:list.find(function(s){return slotStatus(s,t)==='next'})};
}
function currentCourse(){var i=nowInfo();return i.cur?i.cur.course:null}

/* ---------- datos derivados ---------- */
function stat(k){
  var d=S.days[k],ents=Object.keys(d.entries||{}).map(function(id){var e=d.entries[id];return Object.assign({id:id},e)}).filter(function(e){return !e.x});
  var by={};ents.forEach(function(e){by[e.c]=(by[e.c]||0)+1});
  return {served:ents.length,byCourse:by,prepared:num(d.prepared),wasted:num(d.wasted),menu:d.menu||'',ents:ents};
}
function demoMap(){
  var out={},seed=7,rnd=function(){seed=(seed*9301+49297)%233280;return seed/233280};
  var slots=slotsFor(1).length?slotsFor(1):getSlots(),n=0,d=new Date();
  while(n<10){
    d.setDate(d.getDate()-1);
    if(d.getDay()===0||d.getDay()===6)continue;
    var by={},served=0;
    slots.forEach(function(s){var c=Math.round(28+rnd()*12);by[s.course]=c;served+=c});
    var prepared=served+Math.round(15+rnd()*25),wasted=Math.round(prepared*(0.05+rnd()*0.09));
    out[ymd(d)]={served:served,byCourse:by,prepared:prepared,wasted:wasted,menu:'',ents:[]};n++;
  }
  var t=ymd(new Date()),tb={},ts=0;
  slotsFor(new Date().getDay()).forEach(function(s,i){
    var st=slotStatus(s,t);
    if(st==='past'){tb[s.course]=26+((i*7)%14);}else if(st==='now'){tb[s.course]=8+(i%9);}
  });
  Object.keys(tb).forEach(function(k){ts+=tb[k]});
  if(ts>0)out[t]={served:ts,byCourse:tb,prepared:null,wasted:null,menu:'',ents:[]};
  return out;
}
function hasData(){
  return Object.keys(S.days).some(function(k){var d=S.days[k];return Object.keys(d.entries||{}).length>0||num(d.prepared)!=null||num(d.wasted)!=null});
}
function buildCtx(){
  var keys=Object.keys(S.days),map={};
  keys.forEach(function(k){map[k]=stat(k)});
  if(hasData()||!S.demoOn){ctx={map:map,demo:false};}
  else{ctx={map:demoMap(),demo:true};}
}
function avgServed(today){
  var ks=Object.keys(ctx.map).filter(function(k){return ctx.map[k].served>0});
  var use=ks.filter(function(k){return k!==today});
  if(!use.length)use=ks;
  if(!use.length)return null;
  var sum=use.reduce(function(a,k){return a+ctx.map[k].served},0);
  return {avg:sum/use.length,n:use.length};
}
function wasteAgg(){
  var P=0,W=0,n=0;
  Object.keys(ctx.map).forEach(function(k){var s=ctx.map[k];if(s.prepared>0&&s.wasted!=null){P+=s.prepared;W+=s.wasted;n++}});
  return n?{pct:W/P*100,n:n}:null;
}

/* ---------- escritura ---------- */
function toast(msg){var t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(function(){t.hidden=true},3200)}
function fail(e){toast(e&&e.code==='quota_exceeded'?'La base de datos está llena. Avisa a quien administra la página.':'No se pudo guardar. Revisa la conexión o tus permisos.')}
function needWrite(){if(!S.canWrite){toast('Tu acceso es solo de lectura.');return false}return true}
async function patchDay(date,patch){
  if(!S.db){persistLocal();return true}
  var ref=S.db.doc('days/'+date);
  try{await ref.update(patch);return true}
  catch(e){
    if(e&&e.code==='invalid_argument'){
      try{await ref.set(Object.assign({date:date},patch));return true}catch(e2){fail(e2);return false}
    }
    fail(e);return false;
  }
}
function localDay(date){
  if(!S.days[date])S.days[date]={date:date,entries:{}};
  if(!S.days[date].entries)S.days[date].entries={};
  return S.days[date];
}
async function register(name,course,via){
  if(!needWrite())return false;
  name=String(name||'').trim();
  if(!name){toast('Escribe el nombre o el código del estudiante.');return false}
  var id='e'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  var entry={n:name,c:course||'Sin curso',t:new Date().toISOString(),via:via};
  var date=ymd(new Date()),day=localDay(date);
  day.entries[id]=entry;renderAll();
  var o={};o[id]=entry;
  var ok=await patchDay(date,{entries:o});
  if(!ok){delete S.days[date].entries[id];renderAll();return false}
  toast('Registrado: '+name+' · '+entry.c);
  return true;
}

async function setPassed(date,id,val){
  if(!needWrite())return;
  var d=localDay(date);if(!d.passed)d.passed={};
  var prev=d.passed[id];d.passed[id]=val;renderAll();
  var o={};o[id]=val;
  var ok=await patchDay(date,{passed:o});
  if(!ok){
    if(prev===undefined)delete S.days[date].passed[id];else S.days[date].passed[id]=prev;
    renderAll();
  }
}

/* ---------- render ---------- */
function hhmm(iso){var d=new Date(iso);return pad(d.getHours())+':'+pad(d.getMinutes())}
function renderHead(){
  var n=new Date();
  var dl=n.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  $('#dateLine').textContent=dl.charAt(0).toUpperCase()+dl.slice(1);
  $('#clock').textContent=pad(n.getHours())+':'+pad(n.getMinutes());
  var i=nowInfo(),h;
  if(!i.list.length)h='<span class="pill past">Sin turnos</span><span>Hoy no hay almuerzos programados.</span>';
  else if(i.cur)h='<span class="pill now">En turno</span><span><strong>'+esc(i.cur.course)+'</strong> hasta las <span class="mono">'+i.cur.end+'</span>'+(i.next?' · sigue '+esc(i.next.course):'')+'</span><button class="link" type="button" data-slot="'+esc(i.cur.id)+'">Ya pasó</button>';
  else if(i.next&&toMin(i.next.start)<i.m)h='<span class="pill next">Pendiente</span><span><strong>'+esc(i.next.course)+'</strong> aún no ha pasado</span><button class="link" type="button" data-slot="'+esc(i.next.id)+'">Ya pasó</button>';
  else if(i.next)h='<span class="pill next">Próximo</span><span><strong>'+esc(i.next.course)+'</strong> a las <span class="mono">'+i.next.start+'</span></span>';
  else h='<span class="pill past">Terminó</span><span>Ya pasaron todos los turnos de hoy.</span>';
  $('#nowLine').innerHTML=h;
}
function renderBanners(){
  var h='';
  if(ctx.demo)h+='<div class="banner"><p>Estás viendo datos de ejemplo para que veas cómo queda. Desaparecen cuando registres el primer dato.</p><button class="link" id="hideDemo" type="button">Ocultar ejemplo</button></div>';
  else if(!hasData()&&!S.demoOn)h+='<div class="banner"><p>Todavía no hay registros.</p><button class="link" id="showDemo" type="button">Ver ejemplo</button></div>';
  if(S.dbChecked&&!S.db)h+='<div class="banner"><p>Modo local: los datos se guardan solo en este navegador y no se comparten con otros equipos.</p></div>';
  if(!S.canWrite)h+='<div class="banner bad"><p>Tu acceso es solo de lectura. Pide acceso de colaborador para registrar.</p></div>';
  $('#banners').innerHTML=h;
}
function renderStats(){
  var today=ymd(new Date()),t=ctx.map[today],served=t?t.served:0;
  var a=avgServed(today),w=wasteAgg();
  $('#stats').innerHTML=
    '<div class="tile t-orange"><div class="k">Almuerzos hoy</div><div><div class="v">'+served+'</div><div class="s">hasta las '+hhmm(new Date().toISOString())+'</div></div></div>'+
    '<div class="tile t-purple"><div class="k">Promedio por día</div><div><div class="v">'+(a?Math.round(a.avg):'—')+'</div><div class="s">'+(a?a.n+(a.n===1?' día':' días'):'sin datos')+'</div></div></div>'+
    '<div class="tile t-lime"><div class="k">Comida botada</div><div><div class="v">'+(w?pct(w.pct):'—')+'</div><div class="s">'+(w?'de lo preparado':'sin datos')+'</div></div></div>';
}
function fillCourseSelect(){
  var sel=$('#course'),cs=[],seen={};
  getSlots().forEach(function(s){if(!seen[s.course]){seen[s.course]=1;cs.push(s.course)}});
  cs.push('Otro');
  var key=cs.join('|'),cur=sel.value;
  if(sel.dataset.key!==key){
    sel.innerHTML=cs.map(function(c){return '<option>'+esc(c)+'</option>'}).join('');
    sel.dataset.key=key;
    if(cs.indexOf(cur)>=0)sel.value=cur;
  }
  if(!S.courseDirty){var w=currentCourse();sel.value=(w&&cs.indexOf(w)>=0)?w:cs[0]}
}
function renderRecent(){
  var d=S.days[ymd(new Date())],box=$('#recent'),names={};
  Object.keys(S.days).forEach(function(k){var e=S.days[k].entries||{};Object.keys(e).forEach(function(id){if(e[id].n&&e[id].via!=='tarjeta')names[e[id].n]=1})});
  $('#names').innerHTML=Object.keys(names).slice(0,400).map(function(n){return '<option value="'+esc(n)+'">'}).join('');
  var ents=d?Object.keys(d.entries||{}).map(function(id){return Object.assign({id:id},d.entries[id])}).filter(function(e){return !e.x}).sort(function(a,b){return a.t<b.t?1:-1}).slice(0,8):[];
  if(!ents.length){box.innerHTML='<li><p class="empty">Los últimos registros de hoy aparecerán aquí.</p></li>';return}
  box.innerHTML=ents.map(function(e){
    return '<li><span class="mono t">'+hhmm(e.t)+'</span><span class="n">'+esc(e.n)+'</span><span class="c">'+esc(e.c)+'</span>'+
      (e.via==='tarjeta'?'<span class="pill tag">Tarjeta</span>':'')+
      '<button class="link" type="button" data-void="'+esc(e.id)+'">Anular</button></li>';
  }).join('');
}
function fillWasteForm(force){
  if(S.wasteDirty&&!force)return;
  var d=S.days[$('#wDate').value]||{};
  $('#wMenu').value=d.menu||'';
  $('#wPrep').value=d.prepared!=null?d.prepared:'';
  $('#wWaste').value=d.wasted!=null?d.wasted:'';
}
function chartSVG(items){
  var W=360,H=210,L=34,R=8,T=16,B=26,iw=W-L-R,ih=H-T-B;
  var top=Math.max.apply(null,items.map(function(i){return i.pct}));
  var max=Math.max(10,Math.ceil(top/5)*5);
  var y=function(v){return T+ih-(v/max)*ih};
  var bw=iw/items.length,bar=Math.min(24,bw*0.62);
  var wa=wasteAgg(),avg=wa?wa.pct:null;
  var s='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Porcentaje de comida botada por día">';
  [0,max/2,max].forEach(function(v){
    s+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text x="'+(L-6)+'" y="'+(y(v)+3)+'" text-anchor="end">'+Math.round(v)+'%</text>';
  });
  items.forEach(function(it,i){
    var cx=L+bw*i+bw/2,h=(it.pct/max)*ih;
    s+='<rect class="bar'+(avg!=null&&it.pct>avg*1.25?' hot':'')+'" x="'+(cx-bar/2)+'" y="'+(T+ih-h)+'" width="'+bar+'" height="'+Math.max(h,1)+'" rx="5"/>'+
       '<text class="val" x="'+cx+'" y="'+(T+ih-h-4)+'" text-anchor="middle">'+Math.round(it.pct)+'</text>'+
       '<text x="'+cx+'" y="'+(H-8)+'" text-anchor="middle">'+it.label+'</text>';
  });
  if(avg!=null)s+='<line class="avg" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(avg)+'" y2="'+y(avg)+'"/>';
  return s+'</svg>';
}
function renderWaste(){
  fillWasteForm(false);
  var date=$('#wDate').value,s=ctx.map[date],res=$('#wasteResult');
  if(s&&s.prepared>0&&s.wasted!=null){
    var p=s.wasted/s.prepared*100;
    res.innerHTML='<span class="big">'+pct(p)+'</span><span class="hint">botado ese día · '+s.wasted+' de '+s.prepared+' raciones'+(s.served?' · '+s.served+' almuerzos servidos':'')+'</span>';
  }else res.innerHTML='<span class="hint">Escribe las raciones preparadas y las botadas para ver el porcentaje.</span>';

  var ks=Object.keys(ctx.map).filter(function(k){var x=ctx.map[k];return x.prepared>0&&x.wasted!=null}).sort();
  var items=ks.slice(-10).map(function(k){var x=ctx.map[k];return {label:k.slice(8),pct:x.wasted/x.prepared*100}});
  var wa=wasteAgg();
  $('#wasteLegend').innerHTML=items.length?'<span>% botado del día</span><span class="l2">Más de 1,25 veces el promedio</span>'+(wa?'<span class="l3">Promedio '+pct(wa.pct)+'</span>':''):'';
  $('#wasteChart').innerHTML=items.length?chartSVG(items):'<p class="empty">La gráfica aparece cuando hay al menos un día con raciones preparadas y botadas.</p>';

  var all=Object.keys(ctx.map).filter(function(k){var x=ctx.map[k];return x.served>0||x.prepared!=null||x.wasted!=null}).sort().reverse().slice(0,15);
  if(!all.length){$('#wasteTable').innerHTML='<p class="empty">Sin días registrados.</p>';return}
  $('#wasteTable').innerHTML='<table><thead><tr><th>Día</th><th>Servidos</th><th>Preparadas</th><th>Botadas</th><th>% botado</th></tr></thead><tbody>'+
    all.map(function(k){
      var x=ctx.map[k],d=new Date(k+'T12:00:00');
      var p=(x.prepared>0&&x.wasted!=null)?pct(x.wasted/x.prepared*100):'—';
      return '<tr><td>'+DAYS[d.getDay()]+' '+k.slice(8)+'/'+k.slice(5,7)+'</td><td>'+x.served+'</td><td>'+(x.prepared!=null?x.prepared:'—')+'</td><td>'+(x.wasted!=null?x.wasted:'—')+'</td><td>'+p+'</td></tr>';
    }).join('')+'</tbody></table>';
}
function renderSchedule(){
  var today=ymd(new Date()),dowNow=new Date().getDay();
  $('#dayChips').innerHTML=[1,2,3,4,5].map(function(dw){
    var d=weekDate(dw);
    return '<button class="chip" type="button" data-dow="'+dw+'" aria-pressed="'+(S.selDow===dw)+'"><span>'+DAYS[dw]+'</span><small>'+pad(d.getDate())+'</small><span class="dot'+(dw===dowNow?'':' off')+'"></span></button>';
  }).join('');
  var date=ymd(weekDate(S.selDow)),dd=weekDate(S.selDow);
  var tl=dd.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});
  $('#schedTitle').textContent=tl.charAt(0).toUpperCase()+tl.slice(1);
  $('#editToggle').textContent=S.edit?'Terminar edición':'Editar horario';
  $('#addCard').hidden=!S.edit;
  var list=slotsFor(S.selDow),st=ctx.map[date];
  var past=list.filter(function(s){return slotStatus(s,date)==='past'}).length;
  var sum='';
  if(!S.slotsSaved)sum='Horario de ejemplo (12 cursos, 15 minutos cada uno). Edítalo o guárdalo tal cual. ';
  if(S.edit)sum+='Cambia el curso o las horas directamente. Los cambios valen para todos los días de ese turno. ';
  else if(list.length){
    if(date>today)sum+=list.length+' cursos programados.';
    else sum+=past+' de '+list.length+' cursos ya pasaron. Toca el círculo para tachar o destachar un curso.';
  }
  if(!list.length)sum+='No hay turnos este día.';
  $('#schedSummary').innerHTML=esc(sum)+(!S.slotsSaved?' <button class="link" type="button" id="saveDefault">Guardar este horario</button>':'');
  var ae=document.activeElement;
  if(S.edit&&ae&&ae.tagName==='INPUT'&&ae.closest('#slots'))return;
  $('#slots').innerHTML=list.length?list.map(function(s){
    if(S.edit){
      return '<div class="slot edit" data-id="'+esc(s.id)+'"><input class="e-course" value="'+esc(s.course)+'" aria-label="Curso" data-w>'+
        '<input class="e-start" type="time" value="'+esc(s.start)+'" aria-label="Entra" data-w><input class="e-end" type="time" value="'+esc(s.end)+'" aria-label="Sale" data-w>'+
        '<button class="link" type="button" data-del="'+esc(s.id)+'">Quitar de este día</button></div>';
    }
    var status=slotStatus(s,date),label=status==='past'?'Ya pasó':status==='now'?'En turno':'Pendiente';
    var cnt=(status==='past'||status==='now')?((st&&st.byCourse[s.course])||0):'—';
    var isPast=status==='past';
    return '<div class="slot '+(status==='now'?'now':isPast?'past':'')+'">'+
      '<button class="tick" type="button" data-tick="'+esc(s.id)+'" aria-pressed="'+isPast+'" aria-label="'+(isPast?'Destachar ':'Tachar ')+esc(s.course)+'"'+(status==='future'?' disabled':'')+'>'+(isPast?'✓':'')+'</button>'+
      '<span class="mono time">'+s.start+' – '+s.end+'</span><span class="course">'+esc(s.course)+'</span>'+
      '<span class="cnt" title="Almuerzos registrados">'+cnt+'</span><span class="pill '+(isPast?'past':status==='now'?'now':'next')+'">'+label+'</span></div>';
  }).join(''):'<p class="empty">No hay turnos. Agrégalos con Editar horario.</p>';
}
function renderReader(){
  var r=S.reader;
  $('#readerPill').textContent='Lector sin conectar';
  $('#readerSaved').textContent=(r&&r.savedAt)?'Guardado '+new Date(r.savedAt).toLocaleDateString('es-CO',{day:'numeric',month:'short'}):'';
  if(S.readerDirty||!r)return;
  $('#rType').value=r.type||'';$('#rMode').value=r.mode||'';$('#rFormat').value=r.format||'';$('#rUrl').value=r.url||'';$('#rNotes').value=r.notes||'';
}
function applyAccess(){
  document.querySelectorAll('[data-w]').forEach(function(e){e.disabled=!S.canWrite});
}
function renderAll(){
  buildCtx();renderHead();renderBanners();renderStats();fillCourseSelect();renderRecent();renderWaste();renderSchedule();renderReader();applyAccess();
}

/* ---------- eventos ---------- */
function setTab(t){
  S.tab=t;
  document.querySelectorAll('.tab').forEach(function(b){b.setAttribute('aria-selected',String(b.dataset.tab===t))});
  document.querySelectorAll('.panel').forEach(function(p){p.hidden=(p.id!=='tab-'+t)});
}
document.querySelectorAll('.tab').forEach(function(b){b.addEventListener('click',function(){setTab(b.dataset.tab)})});
$('#goReader').addEventListener('click',function(){setTab('tarjetas');window.scrollTo(0,0)});
$('#course').addEventListener('change',function(){S.courseDirty=true});

$('#regForm').addEventListener('submit',async function(e){
  e.preventDefault();
  var ok=await register($('#who').value,$('#course').value,'manual');
  if(ok){$('#who').value='';$('#who').focus()}
});
$('#recent').addEventListener('click',async function(e){
  var b=e.target.closest('[data-void]');if(!b||!needWrite())return;
  var date=ymd(new Date()),id=b.dataset.void,day=S.days[date];
  if(!day||!day.entries||!day.entries[id])return;
  day.entries[id].x=true;renderAll();
  var o={};o[id]={x:true};
  var ok=await patchDay(date,{entries:o});
  if(!ok){delete day.entries[id].x;renderAll()}else toast('Registro anulado.');
});
$('#banners').addEventListener('click',function(e){
  if(e.target.id==='hideDemo'){S.demoOn=false;renderAll()}
  if(e.target.id==='showDemo'){S.demoOn=true;renderAll()}
});

$('#wDate').value=ymd(new Date());
$('#wDate').addEventListener('change',function(){S.wasteDirty=false;fillWasteForm(true);renderWaste()});
['#wPrep','#wWaste','#wMenu'].forEach(function(id){$(id).addEventListener('input',function(){S.wasteDirty=true})});
$('#wasteForm').addEventListener('submit',async function(e){
  e.preventDefault();if(!needWrite())return;
  var date=$('#wDate').value;if(!date){toast('Elige el día.');return}
  var prep=$('#wPrep').value,was=$('#wWaste').value,patch={};
  if(prep!=='')patch.prepared=Math.max(0,Math.round(+prep));
  if(was!=='')patch.wasted=Math.max(0,Math.round(+was));
  patch.menu=$('#wMenu').value.trim();
  if(patch.prepared!=null&&patch.wasted!=null&&patch.wasted>patch.prepared){toast('Las raciones botadas no pueden superar las preparadas.');return}
  if(patch.prepared==null&&patch.wasted==null&&!patch.menu){toast('Escribe al menos un dato.');return}
  var d=localDay(date),prev=clone(d);Object.assign(d,patch);renderAll();
  var ok=await patchDay(date,patch);
  if(!ok){S.days[date]=prev;renderAll()}else{S.wasteDirty=false;toast('Guardado.')}
});

$('#dayChips').addEventListener('click',function(e){var b=e.target.closest('[data-dow]');if(!b)return;S.selDow=+b.dataset.dow;renderSchedule()});
$('#editToggle').addEventListener('click',function(){S.edit=!S.edit;renderSchedule()});
$('#sDays').innerHTML=[1,2,3,4,5].map(function(dw){return '<label><input type="checkbox" value="'+dw+'" checked data-w>'+DAYS[dw]+'</label>'}).join('');
async function saveSlots(slots){
  if(!needWrite())return;
  var prev=S.slots,prevSaved=S.slotsSaved;
  S.slots=slots;S.slotsSaved=true;renderAll();
  if(!S.db){persistLocal();return}
  try{await S.db.doc('config/schedule').set({slots:slots})}
  catch(e){S.slots=prev;S.slotsSaved=prevSaved;renderAll();fail(e)}
}
$('#schedSummary').addEventListener('click',function(e){if(e.target.id==='saveDefault'){saveSlots(defaultSlots());toast('Horario guardado.')}});
$('#slots').addEventListener('click',function(e){
  var t=e.target.closest('[data-tick]');
  if(t){
    var id=t.dataset.tick,date=ymd(weekDate(S.selDow)),slot=getSlots().find(function(s){return s.id===id});
    if(slot)setPassed(date,id,slotStatus(slot,date)!=='past');
    return;
  }
  var b=e.target.closest('[data-del]');if(!b)return;
  var dow=S.selDow;
  saveSlots(getSlots().map(function(s){
    return s.id===b.dataset.del?Object.assign({},s,{days:s.days.filter(function(d){return d!==dow})}):s;
  }).filter(function(s){return s.days.length>0}));
});
$('#slots').addEventListener('change',function(e){
  var row=e.target.closest('.slot.edit');if(!row)return;
  var id=row.dataset.id,c=row.querySelector('.e-course').value.trim(),a=row.querySelector('.e-start').value,b=row.querySelector('.e-end').value;
  e.target.blur();
  if(!c||!a||!b){toast('Completa el curso y las dos horas.');renderSchedule();return}
  if(toMin(a)>=toMin(b)){toast('La hora de salida debe ser después de la entrada.');renderSchedule();return}
  saveSlots(getSlots().map(function(s){return s.id===id?Object.assign({},s,{course:c,start:a,end:b}):s}));
});
$('#nowLine').addEventListener('click',function(e){
  var b=e.target.closest('[data-slot]');if(!b)return;
  setPassed(ymd(new Date()),b.dataset.slot,true);
});
$('#clearSlots').addEventListener('click',function(e){
  var b=e.currentTarget;
  if(!b.dataset.armed){
    b.dataset.armed='1';b.textContent='¿Seguro? Toca otra vez';
    clearTimeout(b.h);b.h=setTimeout(function(){delete b.dataset.armed;b.textContent='Vaciar horario'},4000);
    return;
  }
  clearTimeout(b.h);delete b.dataset.armed;b.textContent='Vaciar horario';
  saveSlots([]);toast('Horario vaciado. Agrega tus turnos.');
});
$('#slotForm').addEventListener('submit',function(e){
  e.preventDefault();
  var c=$('#sCourse').value.trim(),a=$('#sStart').value,b=$('#sEnd').value;
  var days=Array.prototype.map.call(document.querySelectorAll('#sDays input:checked'),function(i){return +i.value});
  if(!c||!a||!b){toast('Completa curso, hora de entrada y de salida.');return}
  if(toMin(a)>=toMin(b)){toast('La hora de salida debe ser después de la entrada.');return}
  if(!days.length){toast('Elige al menos un día.');return}
  var slots=getSlots().concat([{id:'s'+Date.now().toString(36),course:c,start:a,end:b,days:days}]);
  saveSlots(slots);$('#sCourse').value='';toast('Turno agregado.');
});

['#rType','#rMode','#rFormat','#rUrl','#rNotes'].forEach(function(id){$(id).addEventListener('input',function(){S.readerDirty=true})});
$('#readerForm').addEventListener('submit',async function(e){
  e.preventDefault();if(!needWrite())return;
  var r={type:$('#rType').value,mode:$('#rMode').value,format:$('#rFormat').value.trim(),url:$('#rUrl').value.trim(),notes:$('#rNotes').value.trim(),savedAt:new Date().toISOString()};
  var prev=S.reader;S.reader=r;S.readerDirty=false;renderReader();
  if(!S.db){persistLocal();toast('Guardado en este navegador.');return}
  try{await S.db.doc('config/reader').set(r);toast('Configuración guardada.')}
  catch(err){S.reader=prev;renderReader();fail(err)}
});
$('#tapForm').addEventListener('submit',async function(e){
  e.preventDefault();
  var code=$('#tapCode').value.trim();if(!code){toast('Escribe un código.');return}
  var ok=await register('Tarjeta '+code,currentCourse()||'Sin curso','tarjeta');
  if(ok){$('#tapCode').value='';$('#tapCode').focus()}
});

/* ---------- arranque ---------- */
setTab('hoy');
var now0=new Date().getDay();S.selDow=(now0>=1&&now0<=5)?now0:1;
renderAll();
setInterval(function(){renderHead();renderStats();fillCourseSelect();renderSchedule()},20000);

(async function(){
  var c=window.claude;
  if(!c||!c.use){S.dbChecked=true;loadLocal();renderAll();return}
  var db=null,user=null;
  try{db=await c.use('db')}catch(e){}
  try{user=await c.use('user')}catch(e){}
  S.dbChecked=true;S.db=db;
  if(!db)loadLocal();
  if(user){try{var cw=await Promise.resolve(user.can('data.write'));if(cw===false)S.canWrite=false}catch(e){}}
  renderAll();
  if(!db)return;
  var onErr=function(){S.db=null;loadLocal();renderAll()};
  db.collection('days').orderBy('date','desc').limit(120).onSnapshot(function(snap){
    var m={};snap.docs.forEach(function(d){m[d.id]=clone(d.data())});
    S.days=m;renderAll();
  },onErr);
  db.doc('config/schedule').onSnapshot(function(snap){
    if(snap.exists&&snap.data()&&Array.isArray(snap.data().slots)){S.slots=clone(snap.data().slots);S.slotsSaved=true}
    else{S.slots=null;S.slotsSaved=false}
    renderAll();
  },function(){});
  db.doc('config/reader').onSnapshot(function(snap){
    S.reader=snap.exists?clone(snap.data()):null;renderReader();
  },function(){});
})();
})();
