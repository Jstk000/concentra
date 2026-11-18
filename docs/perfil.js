'use strict';
(()=>{
 let job=Promise.resolve(),timer=0,readyToken='',working=false;
 const status=text=>{$('profileState').textContent=text;$('syncStudy').hidden=!accountToken();};
 const guestKey='concentra.datos.invitado';
 function equal(a,b){
   if(a===b)return true;
   if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
   const keys=new Set([...Object.keys(a),...Object.keys(b)]);
   for(const k of keys)if(!equal(a[k],b[k]))return false;
   return true;
 }
 const fields=['subject','goal','minutes','reason','blockSites','calendarLink','timer'];
 function mergeRows(base,local,remote){
   const before=new Map(base.map(x=>[x.id,x])),result=new Map(remote.map(x=>[x.id,x]));
   const retained=new Set(local.map(x=>x.id));
   for(const id of before.keys())if(!retained.has(id))result.delete(id);
   for(const row of local)if(!equal(before.get(row.id),row))result.set(row.id,row);
   return [...result.values()];
 }
 function merge(base,local,remote){
   const result={...remote};
   for(const f of fields)if(!equal(local[f],base[f]))result[f]=local[f];
   result.history=mergeRows(base.history,local.history,remote.history).sort((a,b)=>a.at-b.at);
   result.classes=mergeRows(base.classes,local.classes,remote.classes);
   // A sleeping browser may finish an older countdown after another device paused it.
   const previous=base.timer;
   if(previous&&local.timer===null&&local.history.some(h=>h.id===previous.id&&h.at===previous.end)&&
      !equal(remote.timer,previous)&&!remote.history.some(h=>h.id===previous.id)){
     result.history=result.history.filter(h=>h.id!==previous.id);result.timer=remote.timer;
   }
   if(result.timer&&result.history.some(h=>h.id===result.timer.id))result.timer=null;
   return result;
 }
 function localJSON(k,fallback){try{return JSON.parse(deviceStore.getItem(k))??fallback;}catch{return fallback;}}
 function importable(s){return s&&(s.history?.length||s.classes?.length||s.subject||s.goal||s.reason||s.timer||s.blockSites||s.minutes!==25);}
 function showImport(){const guest=localJSON(guestKey,null);$('importStudy').hidden=!studyScope||!importable(guest);}
 function switchScope(id){
   lockStudy(id===null);
   if(studyScope===id)return;
   studyScope=id;
   load();mirrorStudy();refresh();showImport();document.dispatchEvent(new Event('profile-loaded'));
 }
 function lockStudy(locked){
   for(const id of ['hoy','horario','avance'])$(id).inert=locked;
 }
 async function api(token,body){
   const headers={'x-concentra-session':token};if(body)headers['content-type']='application/json';
   const r=await fetch(service+'/api/cuenta/estudio',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout?.(12000)});
   const value=await r.json();
   if(r.status===401){forgetSession(token);throw Error('Vuelve a iniciar sesión.');}
   if(!r.ok&&r.status!==409)throw Error(value.message||'No se pudo sincronizar.');
   return {value,conflict:r.status===409};
 }
 async function sync(){
   const token=accountToken();
   if(!token){readyToken='';switchScope('');status('En este navegador. Inicia sesión para guardar en tu cuenta.');return;}
   if(studyScope===null)status('Cargando tu cuenta…');
   working=true;
   try{
     let remote=(await api(token)).value;
     if(token!==accountToken())return;
     const current=storedSession();
     if(current.scope!==remote.scope)storeSession({...current,scope:remote.scope});
     switchScope(remote.scope);readyToken=token;
     for(let i=0;i<4;i++){
       if(token!==accountToken())return;
       const cached=studyCache();
       if(cached.revision>remote.revision){remote=(await api(token)).value;continue;}
       const taken=normalizeStudy(cached.state);
       const target=merge(normalizeStudy(cached.base),taken,remote.state||defaults());
       if(!equal(target,remote.state||defaults())){
         status('Guardando en tu cuenta…');
         const response=await api(token,{revision:remote.revision,state:target});
         if(token!==accountToken())return;
         remote=response.value;if(response.conflict)continue;
       }
       const saved=remote.state||defaults();
       const after=studyCache();
       if(after.revision>remote.revision){remote=(await api(token)).value;continue;}
       const latest=merge(taken,normalizeStudy(after.state),saved);
       if(after.revision!==remote.revision||!equal(latest,after.state)){
         writeStudy(latest,{base:saved,revision:remote.revision});
         deviceStore.removeItem(studyKey()+'.base');
       }
       if(!equal(latest,data)){load();mirrorStudy();refresh();document.dispatchEvent(new Event('profile-loaded'));}
       if(!equal(data,saved))continue;
       status('Guardado en tu cuenta');showImport();return;
     }
     throw Error('Hay cambios pendientes. Vuelve a sincronizar.');
   }catch(err){if(token===accountToken())status('Sin sincronizar · '+(navigator.onLine?err.message:'Sin conexión'));throw err;}
   finally{working=false;}
 }
 function run(){
   clearTimeout(timer);timer=0;
   const guardedSync=()=>navigator.locks?navigator.locks.request('concentra-estudio',sync):sync();
   job=job.catch(()=>{}).then(guardedSync);job.catch(()=>{});return job;
 }
 function later(){if(accountToken()){status('Cambios pendientes de guardar…');clearTimeout(timer);timer=setTimeout(run,250);}}
 window.flushStudy=async()=>{if(accountToken())await run();};
 document.addEventListener('study-edited',later);
 document.addEventListener('account-change',()=>{
   const token=accountToken();
   switchScope(accountScope());
   if(token!==readyToken){readyToken='';if(token)status('Cargando tu cuenta…');}
   run();
 });
 $('syncStudy').onclick=run;
 $('importStudy').onclick=()=>{
   if(!studyScope||readyToken!==accountToken())return;
   const rawGuest=localJSON(guestKey,null);if(!rawGuest)return;
   const guest=normalizeStudy(rawGuest);
   dialog('Importar datos de este navegador','<p id="importSummary"></p><p>Se añadirán a la cuenta abierta. Hazlo si esos datos son tuyos.</p><button class="solid" id="confirmImport">Importar a mi cuenta</button>');
   $('importSummary').textContent=guest.classes.length+' bloques de horario y '+guest.history.length+' sesiones completadas.';
   const owner=studyScope;
   $('confirmImport').onclick=async e=>{
     if(owner!==studyScope||readyToken!==accountToken())return;
     const b=e.target;b.disabled=true;
     const combined=merge(defaults(),data,merge(defaults(),guest,defaults()));
     const oldLink=localJSON('concentra.calendar.v1',null);
     if(!combined.calendarLink&&oldLink?.secret)combined.calendarLink={secret:oldLink.secret,url:oldLink.url};
     data=combined;save();refresh();document.dispatchEvent(new Event('profile-loaded'));
     try{await run();if(owner!==studyScope||!readyToken)return;
       if(equal(rawGuest,localJSON(guestKey,null))){deviceStore.setItem(guestKey,JSON.stringify(defaults()));if(oldLink?.secret===data.calendarLink?.secret)deviceStore.removeItem('concentra.calendar.v1');}
       showImport();$('modal').close();say('Datos importados a tu cuenta.');
     }catch{b.disabled=false;say('Los datos siguen en este navegador. Reintenta con conexión.');}
   };
 };
 window.addEventListener('online',run);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();else if(timer)run();});
 setInterval(()=>{if(!document.hidden&&!working&&accountToken())run();},30000);
 lockStudy(studyScope===null);showImport();run();
})();
