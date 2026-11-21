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
const sessionKey='concentra.sesion.v3';
const legacySessionKey='concentra.sesion.v2';
function storedSession(){
  const raw=deviceStore.getItem(sessionKey)||deviceStore.getItem(legacySessionKey);
  if(!raw)return null;
  // Accept sessions saved before the account scope was stored with the token.
  if(/^[a-f0-9]{64}$/.test(raw))return {token:raw};
  try{
    const session=JSON.parse(raw);
    if(typeof session?.token==='string'&&/^[a-f0-9]{64}$/.test(session.token)){
      return {token:session.token,scope:/^[a-f0-9]{64}$/.test(session.scope||'')?session.scope:null,name:typeof session.name==='string'?session.name:''};
    }
  }catch{}
  return null;
}
function storeSession(session){
  deviceStore.setItem(sessionKey,JSON.stringify(session));
  deviceStore.removeItem(legacySessionKey);
}
function accountToken(){return storedSession()?.token||'';}
function accountScope(){const session=storedSession();return session?session.scope||null:'';}
const guestStore='concentra.datos.invitado';
if(deviceStore.getItem(guestStore)===null)deviceStore.setItem(guestStore,deviceStore.getItem(key)||JSON.stringify(defaults()));
let studyScope=accountScope();
function studyKey(){return studyScope?'concentra.datos.'+studyScope:guestStore;}
function studyCache(){
  let stored;
  try{
    stored=JSON.parse(deviceStore.getItem(studyKey())||'null');
  }catch{$('dataWarn').hidden=false;stored=null;}
  if(studyScope&&stored?.format===1)return stored;
  let base=null;
  if(studyScope){
    try{base=JSON.parse(deviceStore.getItem(studyKey()+'.base')||'null');}
    catch{$('dataWarn').hidden=false;}
  }
  return {state:stored,base,revision:0};
}
function writeStudy(state,confirmed=studyCache()){
  if(studyScope)deviceStore.setItem(studyKey(),JSON.stringify({
    format:1,state,base:confirmed.base,revision:confirmed.revision
  }));
  else deviceStore.setItem(studyKey(),JSON.stringify(state));
}
let data = defaults();
function load() {
  data=normalizeStudy(studyScope===null?null:studyCache().state);
}
function normalizeStudy(saved){
  const data=Object.assign(defaults(),saved);
  const validMinutes=n=>Number.isInteger(n)&&n>=1&&n<=180;
  const validText=v=>typeof v==='string';
  const validTime=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
  const validClass=c=>c&&validText(c.id)&&validText(c.name)&&Number.isInteger(c.day)&&c.day>=0&&c.day<=6&&validTime(c.from)&&validTime(c.until)&&c.from<c.until;
  const validBlock=b=>b&&validText(b.id)&&validMinutes(b.minutes)&&validText(b.subject)&&validText(b.goal);
  data.subject=validText(data.subject)?data.subject:'';
  data.goal=validText(data.goal)?data.goal:'';
  data.minutes=validMinutes(data.minutes)?data.minutes:25;
  const classes=Array.isArray(data.classes)?data.classes.filter(validClass):[];
  const history=Array.isArray(data.history)?data.history.filter(h=>validBlock(h)&&Number.isFinite(h.at)&&(!h.partial||h.partial===true&&validMinutes(h.plannedMinutes)&&h.minutes<=h.plannedMinutes)):[];
  if(classes.length!==data.classes?.length||history.length!==data.history?.length)$('dataWarn').hidden=false;
  data.classes=classes;data.history=history;
  if(data.timer&&!(validBlock(data.timer)&&(Number.isFinite(data.timer.end)||(data.timer.end===null&&Number.isFinite(data.timer.left)&&data.timer.left>=0)))){data.timer=null;$('dataWarn').hidden=false;}
  if(data.timer&&typeof data.timer.reason!=='string')delete data.timer.reason;
  if(typeof data.reason!=='string')delete data.reason;
  if(!Array.isArray(data.blockSites))delete data.blockSites;
  return data;
}
function mirrorStudy(){
  const t=data.timer;
  const localProtection=t&&t.mode!=='normal'&&(!t.owner||t.owner===localOwner);
  const sites=localProtection&&Array.isArray(t.sites)?t.sites:data.blockSites??['instagram.com'];
  deviceStore.setItem(key,JSON.stringify({timer:localProtection?{end:t.end}:null,blockSites:sites}));
  document.dispatchEvent(new Event('concentra-sync'));
}
function save() {
  if(studyScope===null||studyScope!==accountScope())return;
  writeStudy(data);mirrorStudy();
  document.dispatchEvent(new Event('study-edited'));
}
const localOwner=deviceStore.getItem('concentra.dispositivo')||globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
deviceStore.setItem('concentra.dispositivo',localOwner);
load();mirrorStudy();
document.addEventListener('click',e=>{if(e.target.closest('#proteger'))openProtection();});
const installedApp = navigator.userAgent.includes('ConcentraNative/1');
const windowsApp=navigator.userAgent.includes('ConcentraWindows/2');
const desktopModes=windowsApp || (!installedApp && !/Android|iPhone|iPad|iPod/.test(navigator.userAgent));
const focusDomains=['instagram.com','tiktok.com','x.com','reddit.com','twitch.tv','youtube.com'];
function chosenSites(){return (data.blockSites??['instagram.com']).filter(validSite);}
function deviceCommand(command){
  try {
    if(navigator.userAgent.includes('ConcentraBridge/1'))return window.chrome.webview.hostObjects.sync.concentra.Execute(command)||'';
    return window.prompt('concentra-device-v1',command)||'';
  }
  catch { return ''; }
}
let deviceDeadline = installedApp ? Number(deviceCommand('status')) || 0 : 0;
function strictDeadline(){
  return Math.max(windowsApp ? 0 : deviceDeadline, data.timer?.strict === true ? data.timer.end || 0 : 0);
}
function openProtection(){
  if(desktopModes){openDesktopProtection();return;}
  if(installedApp){
    dialog('Apps que quiero bloquear','<p>Elige las apps de este dispositivo una vez. Al empezar un bloque, quedan restringidas hasta que se cumpla el tiempo.</p><button class="solid" id="chooseApps">Elegir aplicaciones</button>');
    $('chooseApps').disabled=strictDeadline()>Date.now();
    $('chooseApps').onclick=()=>{
      const result=deviceCommand('choose');
      if(result==='OK')$('modal').close();
      else say(result||'No se pudo abrir la selección de aplicaciones.');
    };
    return;
  }
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
  const domains=['instagram.com','tiktok.com','x.com','youtube.com','reddit.com','twitch.tv'];
  const selected=chosenSites();
  const desktop='<details '+(ios?'':'open')+'><summary>Computador · Chrome y Edge</summary><p>Descarga y extrae la extensión. Abre <code>chrome://extensions</code> o <code>edge://extensions</code>, activa el modo de desarrollador y usa <b>Cargar descomprimida</b> para seleccionar la carpeta que contiene manifest.json. Recarga Concentra y las redes que ya tenías abiertas.</p><a href="./bloqueador.zip" download="Concentra-bloqueo.zip">Descargar extensión</a><p>Durante el bloque se restringen estos sitios y sus notificaciones web en este perfil. Al pausar o terminar, se liberan.</p><fieldset><legend>Sitios que quiero bloquear</legend>'+domains.map(d=>'<label><input style="width:auto" type="checkbox" value="'+d+'" '+(selected.includes(d)?'checked':'')+'> '+d+'</label>').join('')+'</fieldset><p id="extStatus" role="status"></p><p>Para silenciar también las apps de Windows, activa No molestar en Configuración → Sistema → Notificaciones.</p></details>';
  const active=data.timer?.end>Date.now();
  const phone='<details '+(ios?'open':'')+'><summary>iPhone · Enfoque y Acceso guiado</summary><h3>Silenciar notificaciones</h3><p>Una vez, crea un enfoque llamado Estudio en Configuración → Enfoque y elige las personas y apps que pueden avisarte.</p><p>En Atajos, crea un atajo llamado <b>Concentra Estudio</b>. Agrega la acción para obtener fechas de la <b>Entrada del atajo</b>. Luego agrega la acción de configurar enfoque: activa <b>Estudio</b> hasta una <b>Hora</b> y usa la fecha de la primera acción como hora final.</p><a href="shortcuts://create-shortcut">Crear atajo en el iPhone</a><p>Con el reloj en marcha, usa el botón para pasar al atajo la hora de término. Si pausas antes, desactiva Estudio en el Centro de control. Al continuar puedes enviar la nueva hora.</p>'+(active?'<a class="solid groupAction" href="shortcuts://run-shortcut?name=Concentra%20Estudio&amp;input=text&amp;text='+encodeURIComponent(new Date(data.timer.end).toISOString())+'">Activar Estudio hasta '+clockTime(data.timer.end)+'</a>':'<p><b>Inicia o continúa una sesión para activar el atajo.</b></p>')+'<h3>Impedir que cambies de app</h3><p>Activa Acceso guiado en Configuración → Accesibilidad y define un código. Vuelve a Concentra desde su ícono de Inicio y presiona tres veces el botón lateral. Elige Acceso guiado e inicia la restricción. Finalízala cuando termines. Para hacer una llamada de emergencia debes salir de Acceso guiado.</p><a href="https://support.apple.com/es-cl/111795" target="_blank" rel="noreferrer">Ver los controles de salida de mi versión de iOS</a></details>';
  const downloads='https://github.com/Jstk000/concentra/releases/download/bloqueo-v0.1/';
  const native='<h3>Versiones nativas anteriores</h3><p>Elige las aplicaciones una vez y empieza el Pomodoro dentro de la app instalada. En Windows puedes pausar, minimizar programas elegidos y cubrir Instagram dentro de Chrome o Edge.</p><p><a href="https://github.com/Jstk000/concentra/releases/download/windows-v0.2/Concentra-Windows-0.2.exe">Windows 0.2</a> · <a href="'+downloads+'Concentra-Android.apk">Prototipo Android</a></p><p>iPhone en prueba con Xcode: <a href="'+downloads+'Concentra-Xcode.zip">descargar proyecto para Mac</a>.</p>';
  dialog('Bloqueo y avisos',native+(ios?phone+desktop:desktop+phone));
  $('modalBody').querySelector('fieldset').onchange=e=>{data.blockSites=[...e.currentTarget.querySelectorAll(':checked')].map(el=>el.value);save();};
  showProtectionStatus();
}
function showProtectionStatus(){
  const el=$('extStatus');if(!el)return;
  const status=document.documentElement.dataset.concentraBloqueo;
  el.textContent=({activo:'Extensión conectada · bloqueo activo',listo:'Extensión conectada · sin bloqueo activo',error:'No se pudo aplicar el bloqueo. Revisa los permisos y recarga esta página.'})[status]||'Extensión sin detectar en este navegador.';
  if($('installSteps'))$('installSteps').hidden=webBlockerReady();
}
function webBlockerReady(){return ['listo','activo'].includes(document.documentElement.dataset.concentraBloqueo);}
function browserStartIssue(sites=chosenSites()){
  if(!sites.length)return 'sites';
  if(!webBlockerReady())return 'connection';
  if(!document.documentElement.dataset.concentraVersion&&sites.some(site=>!focusDomains.includes(site)))return 'version';
  return '';
}
function resolveBrowserStart(mode,issue,pausedId=null){
  const owner=studyScope,token=accountToken();
  const message={
    sites:'Elige al menos un sitio para este bloque.',
    connection:'Comprobando si la extensión responde en esta pestaña…',
    version:'La extensión conectada admite los seis sitios incluidos. Actualízala o ajusta tu selección para usar otros dominios.'
  };
  dialog('Preparar el bloque','<p id="connectMessage" role="status"></p><div class="actions">'+
    (issue==='sites'?'<button id="useInstagram" class="solid">Bloquear Instagram y empezar</button>':'')+
    '<button id="retryConnection" class="solid" hidden>Reintentar conexión</button><button id="timerOnly" class="subtle-button">Empezar solo este bloque sin bloqueo</button><button id="manageBlocker" class="link">Revisar apps y sitios</button></div>');
  const notice=$('connectMessage');
  notice.textContent=message[issue];
  function current(){
    const sameBlock=pausedId?data.timer?.id===pausedId&&data.timer.end===null:!data.timer;
    return $('modal').open&&$('connectMessage')===notice&&studyScope===owner&&accountToken()===token&&sameBlock&&!restState();
  }
  function resume(nextMode){
    if(!current())return;
    if(pausedId&&nextMode==='normal'){data.timer.mode='normal';data.timer.strict=false;}
    $('modal').close();
    startOrPause(nextMode);
  }
  if(pausedId)$('timerOnly').textContent='Continuar este bloque sin bloqueo';
  $('timerOnly').onclick=()=>resume('normal');
  $('manageBlocker').onclick=openProtection;
  if($('useInstagram'))$('useInstagram').onclick=()=>{
    if(!current())return;
    data.blockSites=['instagram.com'];if(pausedId)data.timer.sites=[...data.blockSites];save();resume(mode);
  };
  if(issue!=='connection')return;
  function reconnect(){
    $('retryConnection').hidden=true;
    notice.textContent=message.connection;
    const check=()=>{
      if(!current()){cleanup();return;}
      if(webBlockerReady()){cleanup();resume(mode);}
    };
    const observer=new MutationObserver(check);
    const timeout=setTimeout(()=>{
      cleanup();
      if(!current())return;
      notice.textContent='La extensión no respondió. Si ya está instalada, comprueba que esté habilitada en este perfil y tenga acceso a jstk000.github.io. Después recarga Concentra.';
      $('retryConnection').hidden=false;
    },2500);
    function cleanup(){observer.disconnect();clearTimeout(timeout);}
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-concentra-bloqueo']});
    document.dispatchEvent(new Event('concentra-sync'));check();
  }
  $('retryConnection').onclick=reconnect;
  reconnect();
}
new MutationObserver(()=>{showProtectionStatus();if(desktopModes)renderTimer();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-concentra-bloqueo']});
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
$('help').onclick=()=>dialog('Estudiar en el iPhone', `<h3>Agregar Concentra a Inicio</h3><p>En Safari, abre Compartir y elige Agregar a Inicio. Si aparece la opción Abrir como app web, actívala. Abre el ícono para empezar a registrar tus sesiones ahí.</p><h3>Quedarte en una sola app</h3><p>Activa Acceso guiado en Configuración → Accesibilidad y define tu código. Abre Concentra desde Inicio, presiona tres veces el botón lateral e inicia Acceso guiado. Al terminar, finaliza también Acceso guiado.</p><p>Durante Acceso guiado debes salir de ese modo para hacer una llamada de emergencia. <a href="https://support.apple.com/es-cl/111795" target="_blank" rel="noreferrer">Instrucciones de Apple</a></p><h3>Si necesitas otras apps para estudiar</h3><p>En Configuración → Enfoque puedes crear un modo Estudio, elegir qué avisos recibir y programar su horario.</p><h3>Tus datos</h3><p>Con sesión iniciada, tu horario y tu avance se guardan en tu cuenta. Como invitado, quedan en este navegador. El reloj recupera el tiempo transcurrido al volver a la app. Puedes activar el aviso al terminar y dejar Concentra abierta mientras estudias en otra pestaña.</p>`);
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
let reasonOwner;
document.addEventListener('account-change',()=>{
  if(reasonOwner===accountToken()||!($('myReason')||$('reasonForm')))return;
  $('modal').close();
  $('modalBody').replaceChildren();
});
function currentReason(){
  return data.timer?.reason||data.reason||defaultReason;
}
function askReason(title,submitLabel,onConfirm,followBlock=true){
  const token=accountToken(),scope=studyScope,timerId=data.timer?.id;
  reasonOwner=token;
  dialog(title,'<form id="reasonForm"><label for="reasonText">¿Qué quieres recordarte si te distraes?</label><textarea id="reasonText" required maxlength="240" rows="3"></textarea><button class="solid" type="submit">'+submitLabel+'</button></form>');
  const input=$('reasonText');
  input.value=currentReason();
  input.oninput=()=>input.setCustomValidity('');
  $('reasonForm').onsubmit=event=>{
    event.preventDefault();
    const reason=input.value.trim();
    if(!reason){input.setCustomValidity('Escribe un motivo para este bloque.');input.reportValidity();return;}
    if(token!==accountToken()||scope!==studyScope||followBlock&&timerId!==data.timer?.id){
      $('modal').close();
      say('El bloque cambió. Vuelve a abrir el motivo.');
      return;
    }
    onConfirm(reason);
  };
}
function saveReason(reason){
  data.reason=reason;
  if(data.timer)data.timer.reason=reason;
  save();
}
function openMedina(){
  const task=data.timer||data;
  reasonOwner=accountToken();
  dialog('Medina','<p class="eyebrow">Mi motivo</p><blockquote id="myReason"></blockquote><button class="link" id="editReason">Editar mi motivo</button><p id="returnGoal"></p><h3>Ya. ¿En qué paso quedaste?</h3><div class="actions"><button class="solid" id="backToTask">Sé cómo seguir</button><button class="link" id="getHint">Me trabé</button></div>');
  $('myReason').textContent=currentReason();
  $('returnGoal').textContent=task.goal?'Tu meta · '+task.goal:'';
  $('backToTask').onclick=()=> $('modal').close();
  $('editReason').onclick=()=>askReason('Mi motivo','Guardar motivo',reason=>{
    saveReason(reason);
    openMedina();
  });
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
  const phase=restState()?.phase||'study';
  dialog('Duración del intervalo','<form id="durationForm"><label for="duration">'+phaseNames[phase]+' (minutos)</label><input type="number" min="1" max="180" step="1" required id="duration" value="'+phaseMinutes(phase)+'"><button class="solid">Guardar duración</button></form>');
  $('durationForm').onsubmit=e=>{e.preventDefault();setPhaseMinutes(phase,$('duration').valueAsNumber);renderTimer();$('modal').close();};
};
function remaining(t){return t.end===null?t.left:Math.max(0,t.end-Date.now());}
const alertsKey='concentra.avisos.temporizador';
const supportsAlerts=window.isSecureContext && typeof window.Notification?.requestPermission==='function';
const soundOn=()=>deviceStore.getItem('concentra.sonido')!=='off';
const visualOn=()=>deviceStore.getItem('concentra.aviso.visual')!=='off';
const desktopAlertsOn=()=>windowsApp?deviceStore.getItem(alertsKey)!=='off':supportsAlerts && Notification.permission==='granted' && deviceStore.getItem(alertsKey)!=='off';
let audioContext, alarmId='', soundGeneration=0;
const clips=new Map(), sources=new Set();
function bufferFor(tone){
  if(!clips.has(tone))clips.set(tone,fetch('./'+tone+'.wav').then(r=>{
    if(!r.ok)throw Error('Audio');return r.arrayBuffer();
  }).then(bytes=>audioContext.decodeAudioData(bytes)).catch(e=>{clips.delete(tone);throw e;}));
  return clips.get(tone);
}
function armAudio(){
  if(windowsApp || !soundOn() || !window.AudioContext)return;
  try{
    audioContext??=new AudioContext();
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
    void bufferFor(alarmPrefs().tone).catch(()=>{});void bufferFor('descanso').catch(()=>{});
  }catch{}
}
document.addEventListener('pointerdown',armAudio,{passive:true});
document.addEventListener('keydown',armAudio);
function silence(){
  soundGeneration++;
  for(const node of sources){try{node.stop();}catch{}}
  sources.clear();
}
function ackAlarm(id=alarmId,broadcast=true){
  if(!id)return;
  if(broadcast && id!=='preview'){
    deviceStore.setItem('concentra.aviso.leido',id);
    const pending=readPending();
    if(pending?.id===id)deviceStore.removeItem('concentra.aviso.pendiente.'+studyKey());
  }
  if(windowsApp)deviceCommand('ack:'+id);
  if(alarmId!==id)return;
  silence();alarmId='';$('finishBanner').hidden=true;if($('testAlert'))$('testAlert').textContent='Probar aviso';
}
window.addEventListener('storage',e=>{if(e.key==='concentra.aviso.leido'&&e.newValue===alarmId)ackAlarm(alarmId,false);});
async function playBell(id,rest){
  if(!soundOn()||!alarmPrefs().volume||audioContext?.state!=='running')return false;
  const gen=soundGeneration,p=alarmPrefs();
  try {
    const buffer=await bufferFor(rest?'descanso':p.tone);
    if(gen!==soundGeneration||alarmId!==id)return false;
    const at=audioContext.currentTime;
    for(let i=0;i<p.repeats;i++){
      const node=audioContext.createBufferSource(),gain=audioContext.createGain();
      node.buffer=buffer;gain.gain.value=p.volume/100;node.connect(gain);gain.connect(audioContext.destination);
      sources.add(node);node.onended=()=>{sources.delete(node);node.disconnect();gain.disconnect();};node.start(at+i*8);
    }
    return true;
  }catch{return false;}
}
async function showDesktopNotice(title,body,tag){
  const options={body,tag,silent:true,icon:'./icon.png'};
  if('serviceWorker' in navigator){
    try{
      await navigator.serviceWorker.register('./timer-worker.js');
      const worker=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),3500))]);
      await worker.showNotification(title,options);return;
    }catch{}
  }
  new Notification(title,options);
}
function readPending(){
  try{return JSON.parse(deviceStore.getItem('concentra.aviso.pendiente.'+studyKey()));}catch{return null;}
}
function restoreFinish(){
  const pending=readPending();
  if(pending?.id && pending.id!==deviceStore.getItem('concentra.aviso.leido')){alarmId=pending.id;showFinish(pending.text);}
}
navigator.serviceWorker?.addEventListener('message',e=>{if(alarmId&&e.data?.ack==='concentra-'+alarmId)ackAlarm();});
function showFinish(message){
  if(!visualOn()||!$('finishBanner'))return;
  $('finishText').textContent=message;$('finishBanner').hidden=false;
}
$('dismissFinish').onclick=()=>ackAlarm();
function openFinishedRest(id){
  refresh();
  const next=restState();
  if(!id || next?.afterId!==id || data.timer)return;
  ackAlarm(id);location.hash='hoy';go();$('start').focus();
}
$('finishRestAction').onclick=()=>openFinishedRest(alarmId);
function openAlerts(){
  dialog('Ajustes',settingTabs('alarm')+ '<fieldset id="tone" class="tones"><legend>Sonido</legend>'+Object.entries(melodies).map(([v,n])=>'<label><input type="radio" name="melody" value="'+v+'"><span><b>'+n+'</b><small>'+({campana:'Dos resonancias y un cierre cálido',pulso:'Teclas suaves y definidas',acorde:'Acordes largos y aireados',brio:'Percusión con más ritmo'})[v]+'</small></span></label>').join('')+'</fieldset><label for="level">Volumen · <output id="levelValue"></output></label><input type="range" id="level" min="0" max="100"><div class="setting-row"><label for="rings">Repeticiones</label><select id="rings"><option>1</option><option>2</option><option>3</option></select></div><label><input id="enableSound" class="focus-check" type="checkbox"> Reproducir sonido</label><label><input id="enableVisual" class="focus-check" type="checkbox"> Aviso dentro de Concentra</label><label><input id="enableDesktop" class="focus-check" type="checkbox"> Aviso en el escritorio</label><p id="alertHelp"></p><button id="testAlert" class="solid">Probar aviso</button>');
  const prefs=alarmPrefs();$('tone').querySelector('[value="'+prefs.tone+'"]').checked=true;$('level').value=prefs.volume;$('levelValue').textContent=prefs.volume+' %';$('rings').value=prefs.repeats;
  $('tone').onchange=e=>{if(alarmId==='preview')ackAlarm();deviceStore.setItem('concentra.melodia',e.target.value);syncNativeAlarm();armAudio();};
  $('level').oninput=()=>{$('levelValue').textContent=$('level').value+' %';deviceStore.setItem('concentra.volumen',$('level').value);};
  $('level').onchange=syncNativeAlarm;
  $('rings').onchange=()=>{deviceStore.setItem('concentra.repeticiones',$('rings').value);syncNativeAlarm();};
  $('enableSound').checked=soundOn();$('enableVisual').checked=visualOn();$('enableDesktop').checked=desktopAlertsOn();
  $('enableDesktop').disabled=!windowsApp&&!supportsAlerts;
  function help(){
    $('alertHelp').textContent=windowsApp?'Windows guarda el aviso en su centro de notificaciones (Win + N). Si tienes activado No molestar, el banner puede quedar silenciado.':!supportsAlerts?'Este navegador admite el aviso dentro de la página.':Notification.permission==='denied'?'Chrome bloquea las notificaciones de Concentra. En los permisos del sitio cambia Notificaciones a Permitir.':'Deja la pestaña abierta. Si Windows silencia los avisos, revisa No molestar y el volumen de Chrome.';
  }
  function updateNative(){if(windowsApp)deviceCommand('alerts:'+(soundOn()?'1':'0')+':'+(desktopAlertsOn()?'1':'0'));}
  help();
  $('enableSound').onchange=e=>{if(!e.target.checked&&alarmId==='preview')ackAlarm();deviceStore.setItem('concentra.sonido',e.target.checked?'on':'off');armAudio();updateNative();};
  $('enableVisual').onchange=e=>{deviceStore.setItem('concentra.aviso.visual',e.target.checked?'on':'off');};
  $('enableDesktop').onchange=async e=>{
    const input=e.target;const want=input.checked;
    try{
      const ok=want && (windowsApp||await Notification.requestPermission()==='granted');
      deviceStore.setItem(alertsKey,ok?'on':'off');input.checked=ok;help();updateNative();
    }catch{input.checked=false;say('Revisa los permisos de notificación de este sitio.');}
  };
  $('testAlert').onclick=async()=>{
    if(alarmId==='preview'){ackAlarm();$('testAlert').textContent='Probar aviso';return;}
    if(alarmId)ackAlarm();
    alarmId='preview';armAudio();
    if(windowsApp){syncNativeAlarm();deviceCommand('test:'+(soundOn()?'1':'0')+':'+(desktopAlertsOn()?'1':'0'));if(desktopAlertsOn() && deviceCommand('noticeSent')!=='1')say('Windows no aceptó la notificación. Revisa Configuración → Sistema → Notificaciones → Concentra.');}
    else{
      if(soundOn()&&alarmPrefs().volume){try{await audioContext?.resume();}catch{}if(!await playBell('preview',false))say('El navegador no pudo reproducir el sonido.');}
      if(desktopAlertsOn())try{await showDesktopNotice('Prueba de alarma','Así se verá tu aviso.','concentra-prueba');}catch{say('Revisa el permiso de notificaciones.');}
    }
    $('finishRestAction').hidden=true;showFinish('Prueba de alarma');$('testAlert').textContent='Detener prueba';
  };
}
async function notifyTimerEnd(timer){
  if(timer.owner&&timer.owner!==localOwner)return;
  if(deviceStore.getItem('concentra.aviso.leido')===timer.id)return;
  if(alarmId!==timer.id){silence();alarmId=timer.id;}
  const title=timer.rest?'Terminó tu descanso':'Terminó tu bloque de estudio';
  const body=timer.rest?'Puedes empezar otro bloque.':'Completaste '+timer.minutes+' min.';
  if(visualOn())deviceStore.setItem('concentra.aviso.pendiente.'+studyKey(),JSON.stringify({id:timer.id,text:title+'. '+body}));
  showFinish(title+'. '+body);
  if(windowsApp || Date.now()-timer.end>120000)return;
  const key='concentra.ultimoAviso.'+studyKey();
  async function emit(){
    if(deviceStore.getItem(key)===timer.id)return;
    deviceStore.setItem(key,timer.id);
    if(desktopAlertsOn())try{await showDesktopNotice(title,body,'concentra-'+timer.id);}
    catch{say('Revisa el permiso de notificaciones.');}
  }
  async function ring(){
    if(deviceStore.getItem(key+'.campana')!==timer.id && await playBell(timer.id,timer.rest))deviceStore.setItem(key+'.campana',timer.id);
  }
  if(navigator.locks){
    await navigator.locks.request(key+'.campana',ring);
    await navigator.locks.request(key,emit);
  }else{await ring();await emit();}
}
function digits(ms){const s=Math.ceil(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function settle() {
  const t=data.timer;
  if(!t||t.end===null||t.end>Date.now())return false;
  if(!data.history.some(h=>h.id===t.id)){
    data.history.push({id:t.id,subject:t.subject,goal:t.goal,minutes:t.minutes,at:t.end});
    void notifyTimerEnd(t);
  }
  data.timer=null;save();nextRest(t);return true;
}
function renderTimer(){
  const t=data.timer,paused=t&&t.end===null;
  const interval=desktopModes&&!t?restState():null;
  document.querySelector('.timer').dataset.state=paused||interval?.id&&interval.end===null?'paused':interval?'rest':t?'active':'idle';
  $('finishRestAction').hidden=!alarmId||interval?.afterId!==alarmId;

  $('digits').textContent=digits(t?remaining(t):data.minutes*60000);
  $('mode').textContent=t?(paused?'Sesión en pausa':'Sesión en curso'):'Sesión de enfoque';
  $('sessionTitle').textContent=t?.subject||'';
  $('sessionTitle').hidden=!t?.subject&&!interval;
  $('presets').hidden=!!t;$('runningNote').hidden=!t;
  $('runningNote').textContent=t?(t.goal||'Una tarea a la vez.'):'';
  $('start').textContent=t?(paused?'▶　Continuar':'Ⅱ　Pausar'):'▶　Empezar bloque';
  $('stop').hidden=!t;$('subject').disabled=!!t;$('goal').disabled=!!t;
  const strictActive=strictDeadline()>Date.now();
  const localStrict=strictActive && desktopModes && data.timer?.owner===localOwner;
  const protectedNow=strictActive;
  if($('focusModeField'))$('focusModeField').hidden=!desktopModes||!!t;
  if(!t && $('focusMode').value!=='strict'){
    const savedMode=deviceStore.getItem('concentra.modo');
    const firstProtectedBlock=savedMode===null&&!installedApp&&desktopModes&&webBlockerReady()&&chosenSites().length>0;
    $('focusMode').value=savedMode==='focus'||firstProtectedBlock?'focus':'normal';
  }
  $('start').hidden=protectedNow;$('stop').hidden=!t||(protectedNow&&!localStrict);
  $('stop').textContent=localStrict?'Salir del modo estricto':'Terminar';
  if(protectedNow){
    const local=deviceDeadline>Date.now() || t?.owner===localOwner;
    $('mode').textContent=local?'Bloque protegido':'Bloque en otro dispositivo';
    $('digits').textContent=digits(strictDeadline()-Date.now());
    $('runningNote').hidden=false;
    $('runningNote').textContent=(local?'Las apps elegidas quedan restringidas hasta las ':'El bloqueo se aplica en el dispositivo que inició la sesión hasta las ')+clockTime(strictDeadline())+'.';
  }
  if(t?.mode==='strict' && !paused && !windowsApp && t.owner===localOwner && document.documentElement.dataset.concentraBloqueo!=='activo')$('runningNote').textContent='Protección web pendiente. Revisa Apps y sitios.';
  if(t?.mode==='focus' && !paused){
    $('mode').textContent=t.owner!==localOwner?'Concentración en otro dispositivo':'Concentración';
    if(t.owner===localOwner&&!windowsApp&&document.documentElement.dataset.concentraBloqueo!=='activo'){
      $('runningNote').hidden=false;$('runningNote').textContent='Bloqueo del navegador pendiente. Revisa Bloqueo y avisos.';
    }
  }
  if(foreignProtectedSession(t)){$('start').hidden=true;$('stop').hidden=true;}
  document.querySelectorAll('[data-min]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.min)===data.minutes));
  modeHint();
  const rest=desktopModes&&!t?restState():null;
  $('medina').hidden=!t;$('custom').disabled=!!t||!!rest?.id;
  document.querySelector('.intervals').hidden=!desktopModes;
  for(const btn of document.querySelectorAll('[data-phase]')){
    btn.setAttribute('aria-pressed',btn.dataset.phase===(rest?.phase||'study'));btn.disabled=!!t||!!rest?.id;
  }
  if(rest)renderRest(rest);
}
function modeHint(){
  const hint=$('modeHint');if(!hint||!desktopModes)return;
  const mode=$('focusMode').value;
  if(!installedApp&&!windowsApp){
    hint.hidden=false;
    const t=data.timer;
    if(t){
      if(t.mode==='normal'||!t.mode)hint.textContent='Este bloque está en Solo temporizador: sin bloqueo de sitios.';
      else if(t.owner!==localOwner)hint.textContent='La protección se controla desde el equipo que inició este bloque.';
      else if(t.end===null)hint.textContent='Bloque en pausa. Los sitios están disponibles.';
      else if(document.documentElement.dataset.concentraBloqueo==='activo'&&(!document.documentElement.dataset.concentraVersion||Number(document.documentElement.dataset.concentraFin)===t.end))hint.textContent='Bloqueo activo en este navegador · '+(t.sites||chosenSites()).join(', ');
      else hint.textContent='Esperando confirmación del bloqueo en este navegador.';
      return;
    }
    if(!webBlockerReady()){hint.textContent='Esta pestaña aún no ha conectado con la extensión. Puedes iniciar el contador sin bloqueo.';return;}
    if(mode==='normal'){hint.textContent='Extensión conectada. Elige Concentración para bloquear sitios durante el estudio.';return;}
  }
  hint.hidden=!!data.timer;
  if(mode==='normal'){hint.textContent='Las apps y los sitios estarán disponibles durante este bloque.';return;}
  if(!hint.hidden)hint.textContent='Sitios elegidos: '+(chosenSites().join(', ')||'ninguno')+
    (windowsApp?' · Programas: '+deviceCommand('programCount'):'')+(mode==='strict'?' · Salida con confirmación.':' · Al pausar se liberan.');
}
if($('focusMode'))$('focusMode').onchange=()=>{deviceStore.setItem('concentra.modo',$('focusMode').value==='focus'?'focus':'normal');modeHint();};
function verifyBrowserStart(t){
  if(installedApp||!desktopModes||!['focus','strict'].includes(t.mode))return;
  const deadline=t.end;
  setTimeout(()=>{
    if(data.timer?.id!==t.id||data.timer.end!==deadline||deadline<=Date.now())return;
    const status=document.documentElement.dataset;
    if(status.concentraBloqueo==='activo' && (!status.concentraVersion||Number(status.concentraFin)===deadline))return;
    const current=data.timer;
    current.left=remaining(current);current.end=null;save();renderTimer();
    say('El bloque quedó en pausa porque la extensión no confirmó las reglas. Pulsa Continuar para reintentar.');
  },3000);
}
function startDevice(id,ms,mode,sites,rest=false){
  syncNativeAlarm();
  const safeSites=Array.isArray(sites)?sites.filter(validSite):[];
  const skipKey='concentra.excepciones.'+id;
  const previous=deviceStore.getItem(skipKey);
  const exclusions=mode==='normal'?'':previous??[...nextExclusions].join(',');
  const reply=deviceCommand(['run',id,Math.ceil(ms),mode,safeSites.join(','),soundOn()?'1':'0',desktopAlertsOn()?'1':'0',rest?'rest':'study',exclusions].join(':'));
  const value=Number(reply);
  if(Number.isSafeInteger(value)&&value>Date.now()){
    if(mode!=='normal'){deviceStore.setItem(skipKey,exclusions);nextExclusions.clear();}
    deviceStore.setItem('concentra.bloquePC',JSON.stringify({id,scope:studyScope}));return value;
  }
  say(reply||'El PC no pudo iniciar el bloque.');return 0;
}
function releaseDevice(t){
  if(!windowsApp||t.owner!==localOwner)return true;
  const reply=deviceCommand('release:'+t.id);
  if(reply==='OK'){deviceDeadline=0;return true;}
  say(reply||'No se pudo liberar el bloqueo.');return false;
}
function reconcileWindowsTimer(){
  if(!windowsApp || studyScope===null)return;
  let tracked;
  try{tracked=JSON.parse(deviceStore.getItem('concentra.bloquePC'));}catch{return;}
  if(!tracked || tracked.scope!==studyScope)return;
  const t=data.timer||(restState()?.id?{...restState(),mode:"normal",rest:true}:null);
  if(t?.end!=null && t.end<=Date.now())return;
  const active=deviceCommand('activeId');
  if(active && active!==tracked.id)return;
  if(!t || t.id!==tracked.id || t.owner!==localOwner || t.end===null){
    if(active===tracked.id && deviceCommand('release:'+tracked.id)==='OK')deviceDeadline=0;
    return;
  }
  const end=Number(deviceCommand('status'));
  if(Math.abs(end-t.end)<1000){deviceDeadline=end;return;}
  if(active && deviceCommand('release:'+tracked.id)!=='OK')return;
  const left=remaining(t);
  if(t.strict){deviceDeadline=0;t.end=null;t.left=left;save();say('Windows necesita tu confirmación para retomar la protección estricta.');return;}
  deviceDeadline=startDevice(t.id,left,t.mode,t.sites||[],t.rest);
  if(!deviceDeadline){t.left=left;t.end=null;if(t.rest)storeRest(t);else save();}
}
const resumeStrictIds=new Set();
function foreignProtectedSession(t){return t?.owner&&t.owner!==localOwner&&['focus','strict'].includes(t.mode);}
$('start').onclick=()=>startOrPause();
function startOrPause(requestedMode){
  armAudio();
  if(strictDeadline()>Date.now())return;
  if(desktopModes&&!data.timer&&restState()){const r=restState();if(r.end&&r.end<=Date.now())finishRest(r,true);else startRest();return;}
  if(settle()){refresh();say('¡Bloque completado! Tu avance quedó registrado.');return;}
  const t=data.timer;
  if(!t){
    const mode=desktopModes?(requestedMode||$('focusMode').value):'legacy';
    if(!installedApp && mode!=='normal' && desktopModes){
      const issue=browserStartIssue();
      if(issue){resolveBrowserStart(mode,issue);return;}
    }
    const begin=reason=>preflight(mode,()=>{
      armAudio();
      const id=freshId();
      let end=Date.now()+data.minutes*60000;
      if(windowsApp){
        end=startDevice(id,data.minutes*60000,mode,chosenSites());
        if(!end)return;
        deviceDeadline=end;
      }else if(installedApp){
        const reply=deviceCommand('start:'+data.minutes);
        const deadline=Number(reply);
        if(!Number.isSafeInteger(deadline)||deadline<=Date.now()){
          if(!reply || reply.includes('Bloqueo y avisos'))openProtection();
          say(reply||'No se pudo activar el bloqueo. Revisa Bloqueo y avisos.');
          return;
        }
        deviceDeadline=end=deadline;
      }
      data.reason=reason;
      data.timer={id,subject:data.subject.trim(),goal:data.goal.trim(),reason,minutes:data.minutes,end,left:null};
      if(desktopModes)Object.assign(data.timer,{owner:localOwner,mode,sites:chosenSites()});
      if(mode==='strict'||(installedApp&&!windowsApp))data.timer.strict=true;
      if($('focusMode'))$('focusMode').value='normal';
      if(alarmId==='preview')ackAlarm();
      save();renderTimer();schedule();verifyBrowserStart(data.timer);
      $('modal').close();
    });
    if(mode==='strict'){
      dialog('¿Empezar en modo estricto?','<p>Durante este bloque podrás salir con confirmación. La pausa estará disponible en el modo Concentración.</p><button id="confirmStrict" class="solid">Empezar bloque estricto</button>');
      $('confirmStrict').onclick=()=>begin(currentReason());
    }else if(desktopModes&&data.reason)begin(data.reason);
    else if(installedApp&&data.reason)begin(data.reason);
    else askReason('Tu motivo para este bloque','Empezar bloque',begin);
    return;
  }
  if(foreignProtectedSession(t))return;
  if(t.end===null){
    if(!installedApp&&desktopModes&&['focus','strict'].includes(t.mode)){
      const issue=browserStartIssue(t.sites||chosenSites());
      if(issue){resolveBrowserStart(t.mode,issue,t.id);return;}
    }
    if(t.strict && !resumeStrictIds.delete(t.id)){
      dialog('¿Retomar el modo estricto?','<p>Se volverá a aplicar la protección a este bloque.</p><button class="solid" id="resumeStrict">Retomar bloque</button>');
      $('resumeStrict').onclick=()=>{if(data.timer?.id!==t.id)return;resumeStrictIds.add(t.id);$('modal').close();$('start').click();};return;
    }
    const end=windowsApp&&t.owner===localOwner?startDevice(t.id,t.left,t.mode,t.sites||[]):Date.now()+t.left;
    if(!end)return;t.end=end;t.left=null;
    if(windowsApp&&t.owner===localOwner)deviceDeadline=end;
    verifyBrowserStart(t);
  }else{
    if(!releaseDevice(t))return;
    t.left=remaining(t);t.end=null;
  }
  save();renderTimer();schedule();
}
$('stop').onclick=()=>{
  if(!data.timer&&restState()?.id){finishRest(restState(),false);return;}
  if(strictDeadline()>Date.now()&&(!desktopModes||data.timer?.owner!==localOwner))return;
  const id=data.timer?.id;
  if(!id)return;
  if(foreignProtectedSession(data.timer))return;
  const minutes=Math.max(0,Math.floor((data.timer.minutes*60000-remaining(data.timer))/60000));
  dialog('¿Terminar este bloque?','<p>Llevas '+minutes+' min de estudio. Al terminar se liberan las restricciones.</p>'+(minutes&&data.timer.goal?'<label><input type="checkbox" id="goalDone" class="focus-check"> Cumplí mi meta</label>':'')+(minutes?'<button class="solid" id="partial">Guardar '+minutes+' min y terminar</button> ':'')+'<button class="link" id="discard">Descartar bloque</button> <button class="link" id="restartBlock">Reiniciar desde cero</button> <button class="link" id="keep">Seguir estudiando</button>');
  $('keep').onclick=()=> $('modal').close();
  function finishPartial(keep){
    const t=data.timer;
    if(t?.id!==id){$('modal').close();return;}
    if(settle()){refresh();$('modal').close();return;}
    if(!releaseDevice(t))return;
    const actual=Math.floor((t.minutes*60000-remaining(t))/60000);
    if(keep&&actual>0&&!data.history.some(h=>h.id===id))data.history.push({id,subject:t.subject,goal:t.goal,minutes:actual,plannedMinutes:t.minutes,partial:true,goalDone:$('goalDone')?.checked===true,at:Date.now()});
    data.timer=null;save();refresh();$('modal').close();
    return true;
  }
  $('restartBlock').onclick=()=>{
    const t=data.timer;if(!t||!finishPartial(false))return;
    setMinutes(t.minutes);if(desktopModes)$('focusMode').value=t.mode||'normal';
    $('start').click();
  };
  $('discard').onclick=()=>finishPartial(false);
  if($('partial'))$('partial').onclick=()=>finishPartial(true);
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
  data.history.forEach(h=>{const k=dayKey(h.at),v=byDay.get(k)||{minutes:0,count:0};v.minutes+=h.minutes;if(!h.partial)v.count++;byDay.set(k,v);});
  const day=byDay.get(today())||{minutes:0,count:0};
  let chain=0,back=day.minutes?0:-1;
  while(byDay.has(dayKey(offsetDay(back)))){chain++;back--;}
  $('todayMin').innerHTML=day.minutes+' <em>min</em>';$('todayCount').textContent=day.count;$('streak').innerHTML=chain+' <em>'+ (chain===1?'día':'días')+'</em>';
  const week=Array.from({length:7},(_,i)=>{const d=offsetDay(i-6);return {label:days[d.getDay()].slice(0,2),n:byDay.get(dayKey(d))?.minutes||0};});
  const max=Math.max(1,...week.map(d=>d.n));
  $('chart').innerHTML=week.map(d=>'<div><b>'+d.n+'</b><i style="height:'+Math.round(d.n/max*87)+'px"></i>'+d.label+'</div>').join('');
  const total=week.reduce((n,d)=>n+d.n,0);$('weekTotal').textContent=total+' min en 7 días';
  const blocks=data.history.filter(h=>!h.partial).length,all=data.history.reduce((s,h)=>s+h.minutes,0);
  const rewards=[['Primer paso','Completa tu primer bloque',blocks,1],['Una hora para ti','Acumula 60 minutos',all,60],['Constancia','Estudia en 3 días distintos',byDay.size,3]];
  $('badges').innerHTML=rewards.map(([name,desc,n,target])=>'<div class="item reward '+(n>=target?'earned':'')+'"><span class="seal">'+(n>=target?'✓':'◇')+'</span><div><b>'+name+'</b><small>'+desc+' · '+(n>=target?'Logrado':n+'/'+target)+'</small></div></div>').join('');
  $('history').innerHTML=data.history.length?[...data.history].reverse().slice(0,20).map(h=>'<div class="row item"><div><small>'+new Date(h.at).toLocaleDateString('es-CL',{day:'numeric',month:'short'})+' · '+clockTime(h.at)+'</small><b>'+esc(h.subject||'Bloque de estudio')+'</b>'+esc(h.goal)+'</div><small>'+h.minutes+(h.partial?' de '+h.plannedMinutes+' min · parcial'+(h.goalDone===true?' · meta cumplida':''):' min')+'</small></div>').join(''):'Tu primer bloque completado aparecerá aquí.';
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
  const x=w*.84,y=h*.81,r=Math.min(w*.042,24);ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fillStyle='#e5b784';ctx.fill();
  for(let i=0;i<34;i++){
    ctx.beginPath();for(let j=0;j<=180;j++){const a=j/180;const yy=h*(.97-.10*a+.038*Math.sin(a*7+.32)+.052*Math.sin(a*9.7-1.3))+i*4; if(j)ctx.lineTo(a*w,yy);else ctx.moveTo(0,yy);}
    ctx.strokeStyle='rgba(195,210,149,'+(.21+i*.004)+')';ctx.lineWidth=1;ctx.stroke();
  }
}
function refresh(){reconcileWindowsTimer();const ended=settle();if($('subject').value!==data.subject)$('subject').value=data.subject;if($('goal').value!==data.goal)$('goal').value=data.goal;$('date').textContent=new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'});renderTimer();schedule();progress();if(ended&&$('finishBanner').hidden)say('¡Bloque completado! Tu avance quedó registrado.');}
let lastHealth=0;
let lastMinute=Math.floor(Date.now()/60000);
setInterval(()=>{if(deviceDeadline&&deviceDeadline<=Date.now()){deviceDeadline=0;refresh();}
  if(strictDeadline()>Date.now())$('digits').textContent=digits(strictDeadline()-Date.now());
  else if(data.timer?.end!=null&&data.timer.end<=Date.now())refresh();else if(data.timer)$('digits').textContent=digits(remaining(data.timer));
  const rest=desktopModes&&!data.timer&&restState();
  if(rest?.end){if(rest.end<=Date.now())finishRest(rest,true);else $('digits').textContent=digits(remaining(rest));}
  if(windowsApp && data.timer?.end>Date.now() && data.timer.owner===localOwner && data.timer.mode!=='normal' && Math.floor(Date.now()/2000)!==lastHealth){
    lastHealth=Math.floor(Date.now()/2000);
    const health=deviceCommand('activeId')===data.timer.id?deviceCommand('health'):'lost';
    $('runningNote').hidden=false;
    $('runningNote').textContent=health.startsWith('appLimited:')?'Windows no logró minimizar '+health.slice(11)+'.':health==='minimized'?'Windows recibió la orden de minimizar la aplicación elegida.':health==='limited'?'Protección limitada: no se pudo leer la dirección del navegador.':health==='covered'?'Sitio elegido cubierto en el navegador.':health==='ready'?'Protección en espera de una app o un sitio elegido.':'Windows dejó de confirmar la protección. Revisa Apps y sitios.';
  }
  const minute=Math.floor(Date.now()/60000);if(minute!==lastMinute){lastMinute=minute;schedule();progress();$('date').textContent=new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'});}
},400);
window.addEventListener('storage',e=>{
  if(e.key===restKey()){renderTimer();return;}
  if(studyScope!==accountScope()||(e.key!==studyKey()&&e.key!==null))return;
  const previous=data.calendarLink;
  const previousTimer=data.timer;
  load();refresh();
  if(previousTimer?.end && previousTimer.end<=Date.now() && !data.timer &&
    data.history.some(h=>h.id===previousTimer.id && !h.partial))void notifyTimerEnd(previousTimer);
  if(JSON.stringify(previous)!==JSON.stringify(data.calendarLink))document.dispatchEvent(new Event('profile-loaded'));
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){load();refresh();}});
document.addEventListener('account-change',()=>{silence();alarmId='';$('finishBanner').hidden=true;nextExclusions.clear();});
document.addEventListener('profile-loaded',restoreFinish);
window.addEventListener('resize',paint);refresh();restoreFinish();go();
