'use strict';
const service=location.hostname==='jstk000.github.io'?'https://concentra-estudio-jp-2611.fastmule27.chatgpt.site':location.origin;
const sessionKey='concentra.sesion.v2';
let signedName='',googleClient='';
async function accountRequest(path,body,extra={}){
 const token=deviceStore.getItem(sessionKey);
 const headers={...extra};if(token)headers['x-concentra-session']=token;
 if(body)headers['content-type']='application/json';
 const r=await fetch(service+'/api/cuenta/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const obj=await r.json();if(!r.ok)throw Error(obj.message||'No se pudo completar la solicitud.');return obj;
}
function setName(name){signedName=name||'';$('accountButton').textContent=signedName||'Iniciar sesión';}
function forgetSession(token){
 if(!token||deviceStore.getItem(sessionKey)!==token)return;
 deviceStore.removeItem(sessionKey);setName('');document.dispatchEvent(new Event('account-change'));
}
async function finishAccount(result){
 deviceStore.setItem(sessionKey,result.token);setName(result.name);$('modal').close();document.dispatchEvent(new Event('account-change'));say('Sesión iniciada.');
}
function accountForm(register=false){
 if(signedName){
   dialog('Mi cuenta','<p id="myUser"></p><p>Tu horario, bloques completados, logros y preferencias se guardan en tu cuenta.</p><button id="logout" class="solid">Cerrar sesión</button><p id="accountError" role="status"></p>');$('myUser').textContent=signedName;
   $('logout').onclick=async()=>{try{await window.flushStudy?.();await accountRequest('logout',{});deviceStore.removeItem(sessionKey);setName('');$('modal').close();document.dispatchEvent(new Event('account-change'));}catch(e){$('accountError').textContent=e.message;}};return;
 }
 dialog(register?'Crear cuenta':'Iniciar sesión','<form id="accountForm"><label for="accountUser">Usuario</label><input id="accountUser" name="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9._\\-]{3,32}" autocapitalize="none" spellcheck="false" autocomplete="username"><label for="accountPass">Contraseña</label><input type="password" id="accountPass" name="password" required maxlength="256" autocomplete="'+(register?'new-password':'current-password')+'" '+(register?'minlength="12" placeholder="Al menos 12 caracteres"':'')+'>'+(register&&window.previousMember?'<label><input id="migrateProfile" style="width:auto" type="checkbox" checked> Conservar mi perfil anterior del grupo</label>':'')+'<p id="accountError" role="status"></p><button class="solid">'+(register?'Crear cuenta':'Entrar')+'</button></form><button class="link" id="switchAccount">'+(register?'Ya tengo cuenta · Iniciar sesión':'Crear una cuenta')+'</button><div id="googleButton"></div>');
 $('switchAccount').onclick=()=>accountForm(!register);
 $('accountForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;
   try{const migrate=!!$('migrateProfile')?.checked,legacy=deviceStore.getItem('concentra.perfil.clave');
     const result=await accountRequest(register?'register':'login',{name:$('accountUser').value,password:$('accountPass').value,migrate},migrate&&legacy?{'x-concentra-key':legacy}:{});
     if(migrate)deviceStore.removeItem('concentra.perfil.clave');await finishAccount(result);
   }catch(err){$('accountError').textContent=err.message;b.disabled=false;}
 };
 mountGoogleButton();
}
let googleScript;
function loadGoogle(){
 if(window.google?.accounts?.id)return Promise.resolve();
 if(!googleScript)googleScript=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://accounts.google.com/gsi/client';
   script.onload=resolve;
   script.onerror=()=>{script.remove();googleScript=null;reject(Error('No se pudo cargar Google.'));};
   document.head.append(script);
 });
 return googleScript;
}
async function mountGoogleButton(){
 const mount=$('googleButton');
 if(!googleClient||!mount||mount.dataset.pending)return;
 mount.dataset.pending='true';
 try{
   await loadGoogle();
   if(!mount.isConnected||!$('modal').open)return;
   google.accounts.id.initialize({client_id:googleClient,callback:async r=>{
     try{await finishAccount(await accountRequest('google',{credential:r.credential}));}
     catch(e){if(mount.isConnected&&$('modal').open)$('accountError').textContent=e.message;else say(e.message);}
   }});
   google.accounts.id.renderButton(mount,{locale:'es',theme:'outline',size:'large'});
 }catch{
   if(!mount.isConnected)return;
   delete mount.dataset.pending;
   const retry=document.createElement('button');
   retry.type='button';retry.className='link';retry.textContent='Reintentar acceso con Google';
   retry.onclick=()=>{mount.replaceChildren();mountGoogleButton();};
   mount.replaceChildren('No se pudo cargar Google. ',retry);
 }
}
$('accountButton').onclick=()=>accountForm();
async function restoreSession(){
 const initial=deviceStore.getItem(sessionKey);
 if(initial){try{const {name}=await accountRequest('me');if(deviceStore.getItem(sessionKey)!==initial)return;if(!name){forgetSession(initial);return;}setName(name);document.dispatchEvent(new Event('account-change'));}catch{}}
 else setName('');
}
window.addEventListener('storage',e=>{if(e.key===sessionKey||e.key===null){setName('');if($('accountForm')||$('myUser'))$('modal').close();document.dispatchEvent(new Event('account-change'));restoreSession();}});
restoreSession();accountRequest('config').then(v=>{googleClient=v.client;mountGoogleButton();}).catch(()=>{});

