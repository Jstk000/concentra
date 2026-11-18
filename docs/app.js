'use strict';
const $ = id => document.getElementById(id);
const key = 'concentra.estudio.v1';
const temporaryValues = new Map();
const deviceStore = {
  getItem(name) {
    if (temporaryValues.has(name)) return temporaryValues.get(name);
    try { return localStorage.getItem(name); }
    catch { $('storageWarn').hidden = false; return null; }
  },
  setItem(name,value) {
    try { localStorage.setItem(name,value); temporaryValues.delete(name); return true; }
    catch { temporaryValues.set(name,value); $('storageWarn').hidden = false; return false; }
  },
  removeItem(name) {
    try { localStorage.removeItem(name); temporaryValues.delete(name); }
    catch { temporaryValues.set(name,null); $('storageWarn').hidden = false; }
  }
};
const days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const defaults = () => ({subject:'', goal:'', minutes:25, classes:[], history:[], timer:null});
const guestStore='concentra.datos.invitado';
if(deviceStore.getItem(guestStore)===null)deviceStore.setItem(guestStore,deviceStore.getItem(key)||JSON.stringify(defaults()));
let studyScope=deviceStore.getItem('concentra.sesion.v2')?(deviceStore.getItem('concentra.estudio.activo')||''):'';
function studyKey(){return studyScope?'concentra.datos.'+studyScope:guestStore;}
let data = defaults();
function load() {
  let saved;
  try { saved=JSON.parse(deviceStore.getItem(studyKey())||'null'); }
  catch { saved=null; $('dataWarn').hidden=false; }
  data=Object.assign(defaults(),saved);
  const validMinutes=n=>Number.isInteger(n)&&n>=1&&n<=180;
  const validText=v=>typeof v==='string';
  const validTime=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
  const validClass=c=>c&&validText(c.id)&&validText(c.name)&&Number.isInteger(c.day)&&c.day>=0&&c.day<=6&&validTime(c.from)&&validTime(c.until)&&c.from<c.until;
  const validBlock=b=>b&&validText(b.id)&&validMinutes(b.minutes)&&validText(b.subject)&&validText(b.goal);
  data.subject=validText(data.subject)?data.subject:'';
  data.goal=validText(data.goal)?data.goal:'';
  data.minutes=validMinutes(data.minutes)?data.minutes:25;
  const classes=Array.isArray(data.classes)?data.classes.filter(validClass):[];
  const history=Array.isArray(data.history)?data.history.filter(h=>validBlock(h)&&Number.isFinite(h.at)):[];
  if(classes.length!==data.classes?.length||history.length!==data.history?.length)$('dataWarn').hidden=false;
  data.classes=classes;data.history=history;
  if(data.timer&&!(validBlock(data.timer)&&(Number.isFinite(data.timer.end)||(data.timer.end===null&&Number.isFinite(data.timer.left)&&data.timer.left>=0)))){data.timer=null;$('dataWarn').hidden=false;}
  if(!Array.isArray(data.blockSites))delete data.blockSites;
}
function mirrorStudy(){
  deviceStore.setItem(key,JSON.stringify({timer:data.timer?{end:data.timer.end}:null,blockSites:data.blockSites}));
  document.dispatchEvent(new Event('concentra-sync'));
}
function save() {
  deviceStore.setItem(studyKey(),JSON.stringify(data));mirrorStudy();
  document.dispatchEvent(new Event('study-edited'));
}
load();
document.addEventListener('click',e=>{if(e.target.closest('#proteger'))openProtection();});
function openProtection(){
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
  const domains=['instagram.com','tiktok.com','x.com','youtube.com','reddit.com','twitch.tv'];
  const selected=data.blockSites??domains.slice(0,3);
  const desktop='<details '+(ios?'':'open')+'><summary>Computador · Chrome y Edge</summary><p>Descarga y extrae la extensión. Abre <code>chrome://extensions</code> o <code>edge://extensions</code>, activa el modo de desarrollador y usa <b>Cargar descomprimida</b> para seleccionar la carpeta que contiene manifest.json. Recarga Concentra y las redes que ya tenías abiertas.</p><a href="./bloqueador.zip" download="Concentra-bloqueo.zip">Descargar extensión</a><p>Durante el bloque se restringen estos sitios y sus notificaciones web en este perfil. Al pausar o terminar, se liberan.</p><fieldset><legend>Sitios que quiero bloquear</legend>'+domains.map(d=>'<label><input style="width:auto" type="checkbox" value="'+d+'" '+(selected.includes(d)?'checked':'')+'> '+d+'</label>').join('')+'</fieldset><p id="extStatus" role="status"></p><p>Para silenciar también las apps de Windows, activa No molestar en Configuración → Sistema → Notificaciones.</p></details>';
  const active=data.timer?.end>Date.now();
  const phone='<details '+(ios?'open':'')+'><summary>iPhone · Enfoque y Acceso guiado</summary><h3>Silenciar notificaciones</h3><p>Una vez, crea un enfoque llamado Estudio en Configuración → Enfoque y elige las personas y apps que pueden avisarte.</p><p>En Atajos, crea un atajo llamado <b>Concentra Estudio</b>. Agrega la acción para obtener fechas de la <b>Entrada del atajo</b>. Luego agrega la acción de configurar enfoque: activa <b>Estudio</b> hasta una <b>Hora</b> y usa la fecha de la primera acción como hora final.</p><a href="shortcuts://create-shortcut">Crear atajo en el iPhone</a><p>Con el reloj en marcha, usa el botón para pasar al atajo la hora de término. Si pausas antes, desactiva Estudio en el Centro de control. Al continuar puedes enviar la nueva hora.</p>'+(active?'<a class="solid groupAction" href="shortcuts://run-shortcut?name=Concentra%20Estudio&amp;input=text&amp;text='+encodeURIComponent(new Date(data.timer.end).toISOString())+'">Activar Estudio hasta '+clockTime(data.timer.end)+'</a>':'<p><b>Inicia o continúa una sesión para activar el atajo.</b></p>')+'<h3>Impedir que cambies de app</h3><p>Activa Acceso guiado en Configuración → Accesibilidad y define un código. Vuelve a Concentra desde su ícono de Inicio y presiona tres veces el botón lateral. Elige Acceso guiado e inicia la restricción. Finalízala cuando termines. Para hacer una llamada de emergencia debes salir de Acceso guiado.</p><a href="https://support.apple.com/es-cl/111795" target="_blank" rel="noreferrer">Ver los controles de salida de mi versión de iOS</a></details>';
  dialog('Bloqueo y avisos',ios?phone+desktop:desktop+phone);
  $('modalBody').querySelector('fieldset').onchange=e=>{data.blockSites=[...e.currentTarget.querySelectorAll(':checked')].map(el=>el.value);save();};
  showProtectionStatus();
}
function showProtectionStatus(){
  const el=$('extStatus');if(!el)return;
  const status=document.documentElement.dataset.concentraBloqueo;
  el.textContent=({activo:'Extensión conectada · bloqueo activo',listo:'Extensión conectada · sin bloqueo activo',error:'No se pudo aplicar el bloqueo. Revisa los permisos y recarga esta página.'})[status]||'Extensión sin detectar en este navegador.';
}
new MutationObserver(showProtectionStatus).observe(document.documentElement,{attributes:true,attributeFilter:['data-concentra-bloqueo']});
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const dayKey = t => new Date(t).toLocaleDateString('sv-SE');
const clockTime = t => new Date(t).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
const freshId = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
const today = () => dayKey(Date.now());
function offsetDay(n) { const d = new Date(); d.setDate(d.getDate()+n); return d; }
function say(s) {
  const status=$('modal').open?$('modalNotice'):$('toast');
  status.textContent=s;
  clearTimeout(status.noticeTimer);
  status.noticeTimer=setTimeout(()=>status.textContent='',4600);
}
function dialog(title, body) { $('modalNotice').textContent=''; $('modalTitle').textContent=title; $('modalBody').innerHTML=body; if (!$('modal').open) $('modal').showModal(); }
$('close').onclick=()=> $('modal').close();
$('help').onclick=()=>dialog('Estudiar en el iPhone', `<h3>Agregar Concentra a Inicio</h3><p>En Safari, abre Compartir y elige Agregar a Inicio. Si aparece la opción Abrir como app web, actívala. Abre el ícono para empezar a registrar tus sesiones ahí.</p><h3>Quedarte en una sola app</h3><p>Activa Acceso guiado en Configuración → Accesibilidad y define tu código. Abre Concentra desde Inicio, presiona tres veces el botón lateral e inicia Acceso guiado. Al terminar, finaliza también Acceso guiado.</p><p>Durante Acceso guiado debes salir de ese modo para hacer una llamada de emergencia. <a href="https://support.apple.com/es-cl/111795" target="_blank" rel="noreferrer">Instrucciones de Apple</a></p><h3>Si necesitas otras apps para estudiar</h3><p>En Configuración → Enfoque puedes crear un modo Estudio, elegir qué avisos recibir y programar su horario.</p><h3>Tus datos</h3><p>Con sesión iniciada, tu horario y tu avance se guardan en tu cuenta. Como invitado, quedan en este navegador. El reloj recupera el tiempo transcurrido al volver a la app. El aviso de término aparece dentro de Concentra.</p>`);
function go() {
  const name=location.hash.startsWith('#invitar=')?'grupo':['hoy','horario','avance','grupo'].includes(location.hash.slice(1))?location.hash.slice(1):'hoy';
  document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==name);
  document.querySelectorAll('nav a').forEach(a=>a.hash==='#'+name?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
  if(name==='hoy') paint();
}
window.addEventListener('hashchange',go);
$('subject').oninput=()=>{data.subject=$('subject').value; save();};
$('goal').oninput=()=>{data.goal=$('goal').value; save();};
const defaultReason='Quiero terminar esto para después dedicarme tranquilo a lo otro.';
function openMedina(){
  const task=data.timer||data;
  dialog('Medina','<p class="eyebrow">Mi motivo</p><blockquote id="myReason"></blockquote><button class="link" id="editReason">Editar mi motivo</button><p id="returnGoal"></p><h3>Ya. ¿En qué paso quedaste?</h3><div class="actions"><button class="solid" id="backToTask">Sé cómo seguir</button><button class="link" id="getHint">Me trabé</button></div>');
  $('myReason').textContent=data.reason||defaultReason;
  $('returnGoal').textContent=task.goal?'Tu meta · '+task.goal:'';
  $('backToTask').onclick=()=> $('modal').close();
  $('editReason').onclick=()=>{
    dialog('Mi motivo','<form id="reasonForm"><label for="reasonText">¿Qué quieres recordarte cuando te distraigas?</label><textarea id="reasonText" required maxlength="240" rows="3"></textarea><button class="solid">Guardar motivo</button></form>');
    $('reasonText').value=data.reason||defaultReason;
    $('reasonForm').onsubmit=e=>{e.preventDefault();const value=$('reasonText').value.trim();if(!value){$('reasonText').focus();return;}data.reason=value;save();openMedina();};
  };
  $('getHint').onclick=()=>{
    const subject=(task.subject+' '+task.goal).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const problem=/fisica|calculo|algebra|matematica|ecuacion|integral|deriva/.test(subject);
    const hints=problem?['No nos adelantemos. En una hoja, escribe qué te pide el ejercicio.','Anota un dato del enunciado y qué representa. Si hay una figura, márcalo ahí.','Busca en tus apuntes un ejemplo con esa misma incógnita. Compara solo el primer paso.']:['No nos adelantemos. Escribe en una línea qué necesitas hacer.','Marca la primera palabra o instrucción que te cuesta explicar.','Busca esa parte en tus apuntes y escribe un ejemplo antes de seguir.'];
    let step=0;
    function draw(){dialog('Medina','<p>'+hints[step]+'</p><div class="actions"><button class="solid" id="resumeStudy">Volver al estudio</button>'+(step<hints.length-1?'<button id="moreHint" class="link">Sigo trabado</button>':'')+'</div>');
      $('resumeStudy').onclick=()=> $('modal').close();if($('moreHint'))$('moreHint').onclick=()=>{step++;draw();};}
    draw();
  };
}
$('medina').onclick=openMedina;
function setMinutes(n){if(data.timer)return;data.minutes=n;save(); renderTimer();}
document.querySelectorAll('[data-min]').forEach(b=>b.onclick=()=>setMinutes(Number(b.dataset.min)));
$('custom').onclick=()=>{
  dialog('Duración del bloque','<form id="durationForm"><label for="duration">Minutos de estudio</label><input type="number" min="1" max="180" step="1" required id="duration" value="'+data.minutes+'"><button class="solid">Usar duración</button></form>');
  $('durationForm').onsubmit=e=>{e.preventDefault();setMinutes(Number($('duration').value));$('modal').close();};
};
function remaining(t){return t.end===null?t.left:Math.max(0,t.end-Date.now());}
function digits(ms){const s=Math.ceil(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function settle() {
  const t=data.timer;
  if(!t||t.end===null||t.end>Date.now())return false;
  if(!data.history.some(h=>h.id===t.id))data.history.push({id:t.id,subject:t.subject,goal:t.goal,minutes:t.minutes,at:t.end});
  data.timer=null;save();return true;
}
function renderTimer(){
  const t=data.timer,paused=t&&t.end===null;
  $('digits').textContent=digits(t?remaining(t):data.minutes*60000);
  $('mode').textContent=t?(paused?'Sesión en pausa':'Sesión en curso'):'Sesión de enfoque';
  $('sessionTitle').textContent=t?t.subject||'Bloque de estudio':'Tiempo de estudiar';
  $('presets').hidden=!!t;$('runningNote').hidden=!t;
  $('runningNote').textContent=t?(t.goal||'Una tarea a la vez.'):'';
  $('start').textContent=t?(paused?'▶　Continuar':'Ⅱ　Pausar'):'▶　Empezar bloque';
  $('stop').hidden=!t;$('subject').disabled=!!t;$('goal').disabled=!!t;
  document.querySelectorAll('[data-min]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.min)===data.minutes));
  const custom=![15,25,50].includes(data.minutes);
  $('custom').textContent=custom?data.minutes+' min':'Otra';$('custom').setAttribute('aria-pressed',custom);
}
$('start').onclick=()=>{
  if(settle()){refresh();say('¡Bloque completado! Tu avance quedó registrado.');return;}
  const t=data.timer;
  if(!t) data.timer={id:freshId(),subject:data.subject.trim(),goal:data.goal.trim(),minutes:data.minutes,end:Date.now()+data.minutes*60000,left:null};
  else if(t.end===null){t.end=Date.now()+t.left;t.left=null;}
  else {t.left=remaining(t);t.end=null;}
  save();renderTimer();schedule();
};
$('stop').onclick=()=>{
  const id=data.timer?.id;
  dialog('¿Terminar este bloque?','<p>Si sales antes del final, este bloque quedará fuera de tus logros. También puedes pausarlo y seguir después.</p><button class="solid" id="discard">Terminar bloque</button> <button class="link" id="keep">Seguir estudiando</button>');
  $('keep').onclick=()=> $('modal').close();
  $('discard').onclick=()=>{if(data.timer?.id===id){settle();data.timer=null;save();refresh();}$('modal').close();};
};
function mins(time){const [h,m]=time.split(':').map(Number);return h*60+m;}
function schedule(){
  const sorted=[...data.classes].sort((a,b)=>(a.day+6)%7-(b.day+6)%7||a.from.localeCompare(b.from));
  $('classes').innerHTML=sorted.length?sorted.map(c=>'<div class="row item"><div><small>'+days[c.day]+' · '+c.from+'–'+c.until+'</small><b>'+esc(c.name)+'</b></div><button class="del" data-remove="'+esc(c.id)+'" aria-label="Quitar '+esc(c.name)+'">Quitar</button></div>').join(''):'<p>Aquí aparecerán tus clases de la semana.</p>';
  $('subjects').innerHTML=[...new Set(sorted.map(c=>c.name))].map(n=>'<option value="'+esc(n)+'"></option>').join('');
  const now=new Date(),m=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
  const list=sorted.filter(c=>c.day===now.getDay()), current=list.find(c=>mins(c.from)<=m&&m<mins(c.until)),next=list.find(c=>mins(c.from)>m);
  $('fit').hidden=true;
  let note='Agrega tus clases para encontrar un bloque libre en tu horario.';
  if(current)note='Ahora tienes '+current.name+'. Tu clase termina a las '+current.until+'.';
  else if(next){
    const free=Math.floor(mins(next.from)-m),suggested=Math.min(25,free);
    note='Tu próxima clase es '+next.name+' a las '+next.from+'. '+(free>0?'Tienes '+free+' min libres.':'Empieza en menos de un minuto.');
    if(suggested>0&&!data.timer){$('fit').hidden=false;$('fit').textContent='Preparar bloque de '+suggested+' min';$('fit').onclick=()=>{setMinutes(suggested);say('Duración ajustada a tu horario.');};}
  } else if(sorted.length)note='Tienes libre el resto del día según tu horario.';
  $('suggestion').textContent=note;
}
$('classes').onclick=e=>{const id=e.target.closest('[data-remove]')?.dataset.remove;if(!id)return;data.classes=data.classes.filter(c=>c.id!==id);save();schedule();document.dispatchEvent(new Event("concentra-horario"));};
function progress(){
  const byDay=new Map();
  data.history.forEach(h=>{const k=dayKey(h.at),v=byDay.get(k)||{minutes:0,count:0};v.minutes+=h.minutes;v.count++;byDay.set(k,v);});
  const day=byDay.get(today())||{minutes:0,count:0};
  let chain=0,back=day.count?0:-1;
  while(byDay.has(dayKey(offsetDay(back)))){chain++;back--;}
  $('todayMin').innerHTML=day.minutes+' <em>min</em>';$('todayCount').textContent=day.count;$('streak').innerHTML=chain+' <em>'+ (chain===1?'día':'días')+'</em>';
  const week=Array.from({length:7},(_,i)=>{const d=offsetDay(i-6);return {label:days[d.getDay()].slice(0,2),n:byDay.get(dayKey(d))?.minutes||0};});
  const max=Math.max(1,...week.map(d=>d.n));
  $('chart').innerHTML=week.map(d=>'<div><b>'+d.n+'</b><i style="height:'+Math.round(d.n/max*87)+'px"></i>'+d.label+'</div>').join('');
  const total=week.reduce((n,d)=>n+d.n,0);$('weekTotal').textContent=total+' min en 7 días';
  const blocks=data.history.length,all=data.history.reduce((s,h)=>s+h.minutes,0);
  const rewards=[['Primer paso','Completa tu primer bloque',blocks,1],['Una hora para ti','Acumula 60 minutos',all,60],['Constancia','Estudia en 3 días distintos',byDay.size,3]];
  $('badges').innerHTML=rewards.map(([name,desc,n,target])=>'<div class="item reward '+(n>=target?'earned':'')+'"><span class="seal">'+(n>=target?'✓':'◇')+'</span><div><b>'+name+'</b><small>'+desc+' · '+(n>=target?'Logrado':n+'/'+target)+'</small></div></div>').join('');
  $('history').innerHTML=blocks?[...data.history].reverse().slice(0,20).map(h=>'<div class="row item"><div><small>'+new Date(h.at).toLocaleDateString('es-CL',{day:'numeric',month:'short'})+' · '+clockTime(h.at)+'</small><b>'+esc(h.subject||'Bloque de estudio')+'</b>'+esc(h.goal)+'</div><small>'+h.minutes+' min</small></div>').join(''):'Tu primer bloque completado aparecerá aquí.';
}
$('share').onclick=()=>{
  const h=data.history[data.history.length-1],subject=data.subject.trim()||h?.subject||'Estudio personal',goal=data.goal.trim()||h?.goal||'Dedicar un bloque a una sola tarea';
  const text='Mi rutina en Concentra\nRamo: '+subject+'\nMeta: '+goal+'\nBloque: '+data.minutes+' min\nMi avance: '+$('weekTotal').textContent+'.';
  dialog('Compartir mi rutina','<p>Revisa el texto y compártelo con tu grupo de estudio.</p><label for="shareText">Mi rutina</label><textarea rows="6" id="shareText"></textarea><button id="send" class="solid">'+(navigator.share?'Compartir…':'Copiar rutina')+'</button>');$('shareText').value=text;
  $('send').onclick=async()=>{const msg=$('shareText').value;try{if(navigator.share){await navigator.share({text:msg});}else{await navigator.clipboard.writeText(msg);say('Rutina copiada.');}$('modal').close();}catch(e){if(e.name!=='AbortError'){$('shareText').select();say('Selecciona Copiar para llevarte la rutina.');}}};
};
function paint(){
  const canvas=$('land'),box=canvas.getBoundingClientRect();if(!box.width)return;
  const w=box.width,h=box.height,dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=w*dpr;canvas.height=h*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,'#193b33');grad.addColorStop(1,'#305d4b');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  const x=w*.85,y=h*.25,r=Math.min(w*.085,43);ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fillStyle='#e5b784';ctx.fill();
  for(let i=0;i<34;i++){
    ctx.beginPath();for(let j=0;j<=180;j++){const a=j/180;const yy=h*(.90-.30*a+.08*Math.sin(a*7+.32)+.115*Math.sin(a*9.7-1.3))+i*5; if(j)ctx.lineTo(a*w,yy);else ctx.moveTo(0,yy);}
    ctx.strokeStyle='rgba(195,210,149,'+(.21+i*.004)+')';ctx.lineWidth=1;ctx.stroke();
  }
}
function refresh(){const ended=settle();$('subject').value=data.subject;$('goal').value=data.goal;$('date').textContent=new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'});renderTimer();schedule();progress();if(ended)say('¡Bloque completado! Tu avance quedó registrado.');}
let lastMinute=Math.floor(Date.now()/60000);
setInterval(()=>{if(data.timer?.end!=null&&data.timer.end<=Date.now())refresh();else if(data.timer)$('digits').textContent=digits(remaining(data.timer));
  const minute=Math.floor(Date.now()/60000);if(minute!==lastMinute){lastMinute=minute;schedule();progress();$('date').textContent=new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'});}
},400);
window.addEventListener('storage',e=>{if(e.key===studyKey()||e.key===null){load();refresh();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){load();refresh();}});
window.addEventListener('resize',paint);refresh();go();
