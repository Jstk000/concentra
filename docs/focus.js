'use strict';
const phaseNames = {study:'Estudio', short:'Pausa corta', long:'Pausa larga'};
const melodies = {campana:'Cerámica', pulso:'Prisma', acorde:'Bruma', brio:'Brío'};
function numericPref(key, fallback, min, max) {
  const raw = deviceStore.getItem('concentra.'+key);
  const value = raw===null ? fallback : Number(raw);
  return Number.isInteger(value) && value>=min && value<=max ? value : fallback;
}
function alarmPrefs() {
  const name=deviceStore.getItem('concentra.melodia');
  return {tone:Object.hasOwn(melodies,name)?name:'pulso',volume:numericPref('volumen',90,0,100),repeats:numericPref('repeticiones',2,1,3)};
}
function syncNativeAlarm(){
  if(!windowsApp)return;
  const p=alarmPrefs();
  deviceCommand(['alarmPrefs',p.tone,p.volume,p.repeats].join(':'));
}
function restKey(){return 'concentra.intervalo.'+studyKey();}
function restState(){
  let item;
  try {item=JSON.parse(deviceStore.getItem(restKey()));}catch{}
  if(!item||!['short','long'].includes(item.phase))return null;
  if(item.id && !(Number.isInteger(item.minutes)&&item.minutes>=1&&item.minutes<=180&&
    (Number.isFinite(item.end)||item.end===null&&Number.isFinite(item.left))))return null;
  return item;
}
function storeRest(item){if(item)deviceStore.setItem(restKey(),JSON.stringify(item));else deviceStore.removeItem(restKey());}
function phaseMinutes(phase){return phase==='study'?data.minutes:numericPref('intervalo.'+phase,phase==='short'?5:15,1,180);}
function setPhaseMinutes(phase,value){
  if(!Number.isInteger(value)||value<1||value>180)return;
  if(phase==='study')setMinutes(value);
  else deviceStore.setItem('concentra.intervalo.'+phase,String(value));
}
function switchPhase(phase){
  if(data.timer||restState()?.id||!Object.hasOwn(phaseNames,phase))return;
  storeRest(phase==='study'?null:{phase});renderTimer();
}
function nextRest(timer){
  if(!desktopModes || timer.owner&&timer.owner!==localOwner)return;
  const phase=data.history.filter(h=>!h.partial).length%4===0?'long':'short';
  storeRest({phase,previousMode:timer.mode,afterId:timer.id});
  if(deviceStore.getItem('concentra.autoRest')==='on' && Date.now()-timer.end<5000)startRest();
}
function startRest(){
  const rest=restState();if(!rest||data.timer)return;
  const ms=rest.id?remaining(rest):phaseMinutes(rest.phase)*60000;
  if(rest.id && rest.end!==null){
    if(!releaseDevice(rest))return;
    rest.left=ms;rest.end=null;
  }else{
    rest.id=rest.id||freshId();rest.minutes=rest.minutes||phaseMinutes(rest.phase);rest.owner=localOwner;
    const end=windowsApp?startDevice(rest.id,ms,'normal',[],true):Date.now()+ms;
    if(!end)return;
    rest.end=end;rest.left=null;
  }
  storeRest(rest);renderTimer();
}
function finishRest(rest,natural){
  if(restState()?.id!==rest.id)return;
  if(!natural&&!releaseDevice(rest))return;
  storeRest(null);
  if(natural)void notifyTimerEnd({...rest,rest:true});
  renderTimer();
  if(natural&&deviceStore.getItem('concentra.autoStudy')==='on'&&Date.now()-rest.end<5000 &&
    studyScope===accountScope() && !$('modal').open){if(rest.previousMode==='strict')$('focusMode').value='strict';$('start').click();}
}
function renderRest(rest){
  $('digits').textContent=digits(rest.id?remaining(rest):phaseMinutes(rest.phase)*60000);
  $('mode').textContent=rest.id?(rest.end===null?'Descanso en pausa':'Descanso en curso'):'Próximo intervalo';
  $('sessionTitle').textContent=phaseNames[rest.phase];
  $('runningNote').hidden=false;$('runningNote').textContent='Apps y sitios disponibles durante el descanso.';
  $('start').hidden=false;$('start').textContent=rest.id?(rest.end===null?'Continuar':'Pausar'):'Empezar descanso';
  $('stop').hidden=!rest.id;$('stop').textContent='Terminar descanso';
  $('focusModeField').hidden=true;$('modeHint').hidden=true;$('medina').hidden=true;
}
function settingTabs(active){
  return '<div class="setting-tabs" role="group" aria-label="Secciones de ajustes">'+
    [['intervals','Intervalos'],['alarm','Alarma'],['apps','Apps y sitios']].map(([id,title])=>
      '<button type="button" data-setting="'+id+'" aria-current="'+(id===active)+'">'+title+'</button>').join('')+'</div>';
}
function openIntervals(){
  dialog('Ajustes',settingTabs('intervals')+
    Object.keys(phaseNames).map(id=>'<div class="setting-row"><label for="mins-'+id+'">'+phaseNames[id]+' (min)</label><input id="mins-'+id+'" type="number" min="1" max="180" step="1" value="'+phaseMinutes(id)+'"></div>').join('')+
    '<p>Después de cuatro bloques completos llega una pausa larga.</p>'+
    [['autoRest','Empezar el descanso automáticamente'],['autoStudy','Empezar el siguiente estudio automáticamente']].map(([id,title])=>'<label class="setting-row">'+title+'<input type="checkbox" id="'+id+'"></label>').join(''));
  for(const phase of Object.keys(phaseNames)){
    const field=$('mins-'+phase);field.disabled=!!data.timer||!!restState()?.id;
    field.onchange=()=>{if(field.reportValidity()){setPhaseMinutes(phase,field.valueAsNumber);renderTimer();}};
  }
  for(const id of ['autoRest','autoStudy']){
    $(id).checked=deviceStore.getItem('concentra.'+id)==='on';
    $(id).onchange=()=>deviceStore.setItem('concentra.'+id,$(id).checked?'on':'off');
  }
}
document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-setting]')?.dataset.setting;
  if(tab==='alarm')openAlerts();
  if(tab==='intervals')openIntervals();
  if(tab==='apps')openProtection();
  if(e.target.closest('#settings'))openIntervals();
  const phase=e.target.closest('[data-phase]')?.dataset.phase;
  if(phase)switchPhase(phase);
});

function validSite(site){
  return typeof site==='string'&&site.length<=80&&site!=='jstk000.github.io'&&!('jstk000.github.io').endsWith('.'+site)&&/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(site);
}
function nativeList(command){
  const result=JSON.parse(deviceCommand(command));
  if(!Array.isArray(result))throw Error('No se pudo leer la selección de Windows.');
  return result;
}
let nextExclusions=new Set();
function openDesktopProtection(){
  const locked=!!data.timer||deviceDeadline>Date.now();
  dialog('Ajustes',settingTabs('apps')+
    (windowsApp?'<h3>Aplicaciones de Windows</h3><p>Elige qué ventanas minimizar en modo Concentración o Estricto. Aquí aparecen distracciones habituales instaladas y tus selecciones.</p><button class="subtle-button" id="browsePrograms" aria-expanded="false">Ver todas las aplicaciones</button><div id="catalogFilters" class="program-filters" hidden><div><label for="findApp">Buscar aplicación</label><input type="search" id="findApp" placeholder="Nombre de la aplicación"></div><div><label for="filterApp">Mostrar</label><select id="filterApp"><option value="all">Todas</option><option value="chosen">Seleccionadas</option><option value="running">Abiertas</option><option value="available">Disponibles</option></select></div></div><div id="programList" class="choice-list"></div><button class="link" id="addProgram">Elegir un archivo .exe…</button>':'<p id="extStatus" role="status"></p><section id="installSteps"><h3>Conectar el bloqueo web</h3><ol><li><a href="./bloqueador.zip" download>Descarga la extensión</a> y extrae el ZIP en una carpeta que puedas conservar.</li><li>En Chrome abre <code>chrome://extensions</code>. En Edge abre <code>edge://extensions</code>.</li><li>Activa <b>Modo de desarrollador</b>, pulsa <b>Cargar descomprimida</b> y elige la carpeta que contiene <code>manifest.json</code>.</li><li>Recarga Concentra y las pestañas de redes que ya tenías abiertas. Elige <b>Concentración</b> antes de empezar el bloque.</li></ol></section>')+
    '<h3>Sitios web</h3><p>'+(windowsApp?'Concentra cubre los sitios elegidos cuando el navegador expone la dirección de la pestaña. Si eliges el navegador en Programas, se minimiza la ventana completa.':'La extensión impide nuevas navegaciones a los dominios elegidos. En los seis sitios incluidos también cubre pestañas abiertas y silencia sus notificaciones.')+'</p><div id="siteList" class="choice-list"></div><form id="addSite"><label for="siteName">Añadir dominio</label><div class="pair"><input id="siteName" maxlength="80" placeholder="ejemplo.cl" required><button class="subtle-button">Añadir</button></div></form>');
  if(windowsApp){
    // Keep one searchable list in view even on smaller laptop screens.
    const body=$('modalBody'), headings=[...body.querySelectorAll('h3')];
    function groupFrom(heading){
      const group=document.createElement('section');heading.before(group);
      let node=heading;
      do{const next=node.nextSibling;group.append(node);node=next;}while(node&&node.tagName!=='H3');
      return group;
    }
    const apps=groupFrom(headings[0]),sites=groupFrom(headings[1]);
    const selector=document.createElement('div');selector.className='picker-tabs';
    selector.innerHTML='<button type="button">Programas</button><button type="button">Sitios web</button>';
    apps.before(selector);
    function activate(index){apps.hidden=index!==0;sites.hidden=index!==1;[...selector.children].forEach((b,i)=>b.setAttribute('aria-pressed',i===index));}
    [...selector.children].forEach((b,i)=>b.onclick=()=>activate(i));activate(0);
  }
  function useProtection(){
    if(!locked && $('focusMode').value==='normal'){
      $('focusMode').value='focus';$('focusMode').dispatchEvent(new Event('change'));
      say('Concentración activada para el próximo bloque. Puedes cambiar el modo en el reloj.');
    }
  }
  const renderSites=()=>{
    const selected=chosenSites();const all=[...new Set([...focusDomains,...selected])];
    $('siteList').innerHTML=all.map(d=>'<label>'+esc(d)+'<input type="checkbox" value="'+esc(d)+'" '+(selected.includes(d)?'checked ':'')+(locked?'disabled':'')+'></label>').join('');
  };
  renderSites();
  $('siteList').onchange=e=>{if(e.target.checked)useProtection();data.blockSites=[...$('siteList').querySelectorAll(':checked')].map(el=>el.value);save();modeHint();};
  $('siteName').disabled=locked;$('addSite').querySelector('button').disabled=locked;
  $('addSite').onsubmit=e=>{e.preventDefault();
    const site=$('siteName').value.trim().toLowerCase();
    if(!validSite(site)||chosenSites().length>=64){say('Escribe solo el dominio, por ejemplo instagram.com. Puedes elegir hasta 64.');return;}
    data.blockSites=[...new Set([...chosenSites(),site])];useProtection();save();renderSites();modeHint();$('siteName').value='';
  };
  if(!windowsApp){showProtectionStatus();return;}
  let programs=[],expanded=false,allLoaded=false;
  const render=()=>{
    const query=$('findApp').value.toLocaleLowerCase(),filter=$('filterApp').value;
    const suggested=p=>/\b(opera gx|discord|steam|epic games|riot client|battle\.net|spotify|telegram|whatsapp|twitch|roblox|minecraft)\b/i.test(p.name);
    const rows=expanded?programs.filter(p=>(p.name+' '+p.path.split(/[\\/]/).pop()).toLocaleLowerCase().includes(query)&&(filter==='all'||p[filter])):[...programs.filter(p=>p.chosen),...programs.filter(p=>!p.chosen&&suggested(p)).slice(0,6)];
    $('browsePrograms').setAttribute('aria-expanded',expanded);
    $('browsePrograms').textContent=expanded?'Volver a sugeridas':'Ver todas las aplicaciones';
    $('catalogFilters').hidden=!expanded;paths.hidden=!expanded;
    $('programList').innerHTML=rows.map(p=>'<div class="program-entry"><label>'+
      (p.icon?'<img src="'+esc(p.icon)+'" alt="">':'')+'<span>'+esc(p.name)+'<small>'+(p.available?(p.running?'Abierta':'Disponible'):'Archivo ausente')+'</small></span><input data-program="'+esc(p.id)+'" type="checkbox" '+(p.chosen?'checked ':'')+(locked?'disabled':'')+'></label>'+
      (p.chosen&&!locked?'<label class="skip"><input type="checkbox" data-skip="'+esc(p.id)+'" '+(nextExclusions.has(p.id)?'checked':'')+'> Omitir en el próximo bloque</label>':'')+'<details><summary>Ruta del programa</summary><small class="path">'+esc(p.path)+'</small></details></div>').join('')||(expanded?'<p>Sin coincidencias. Puedes elegir el archivo .exe.</p>':'<p>Busca una distracción en el catálogo completo.</p>');
  };
  function reload(){try{programs=nativeList(expanded?'programsAll':'programs');allLoaded=expanded;render();}catch{say('Windows no pudo enumerar las aplicaciones. Vuelve a abrir los ajustes.');}}
  const paths=document.createElement('label');paths.className='show-paths';
  paths.innerHTML='<input type="checkbox" class="focus-check"> Mostrar rutas';
  $('programList').before(paths);paths.firstChild.onchange=e=>$('programList').classList.toggle('paths-visible',e.target.checked);
  $('browsePrograms').onclick=()=>{expanded=!expanded;if(expanded&&!allLoaded)reload();else render();if(expanded)$('findApp').focus();};
  $('findApp').oninput=render;$('filterApp').onchange=render;
  $('programList').onchange=e=>{
    const field=e.target;
    if(field.dataset.skip){if(field.checked)nextExclusions.add(field.dataset.skip);else nextExclusions.delete(field.dataset.skip);return;}
    const p=programs.find(p=>p.id===field.dataset.program);if(!p)return;
    const reply=deviceCommand('select:'+p.id+':'+(field.checked?'1':'0'));
    if(reply==='OK'){if(field.checked)useProtection();p.chosen=field.checked;nextExclusions.delete(p.id);}else say(reply||'No se guardó la selección.');
    render();modeHint();
  };
  $('addProgram').disabled=locked;$('addProgram').onclick=()=>{const result=deviceCommand('addProgram');if(result==='OK'){useProtection();reload();modeHint();}else if(result!=='Cancelado')say(result);};
  reload();
  if(deviceDeadline>Date.now()&&(!data.timer||data.timer.owner!==localOwner)){
    const btn=document.createElement('button');btn.className='link';btn.textContent='Liberar la protección activa de este PC';
    btn.onclick=()=>{if(deviceCommand('emergency')==='OK'){deviceDeadline=0;$('modal').close();refresh();}};$('modalBody').append(btn);
  }
}
function preflight(mode,begin){
  if(!windowsApp||mode==='normal'){begin();return;}
  let missing;
  try{missing=nativeList('missing').filter(p=>!nextExclusions.has(p.id));}catch{say('Windows no pudo comprobar la selección. Reintenta desde Apps y sitios.');return;}
  if(!missing.length){begin();return;}
  dialog('Revisar protección','<p>Windows no encuentra estos programas seleccionados.</p><ul>'+missing.map(p=>'<li>'+esc(p.name)+'</li>').join('')+'</ul><button id="retryProtection" class="solid">Reintentar</button> '+(mode==='focus'?'<button class="link" id="acceptPartial">Continuar sin estos programas</button> ':'')+'<button class="link" id="cancelProtection">Cancelar</button>');
  $('retryProtection').onclick=()=>preflight(mode,begin);
  if($('acceptPartial'))$('acceptPartial').onclick=()=>{missing.forEach(p=>nextExclusions.add(p.id));begin();};
  $('cancelProtection').onclick=()=>$('modal').close();
}
