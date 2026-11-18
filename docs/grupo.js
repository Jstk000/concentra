'use strict';
(()=>{
  let invitation='',memberLink='',requestNumber=0,draftId=null;
  const key='concentra.grupo.invitacion';
  const profileKey='concentra.perfil.clave';
  let personal=localStorage.getItem(profileKey)||'';
  const newKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  function readInvite(){
    if(location.hash.startsWith('#invitar=')){
      invitation=location.hash.slice(9);
      try{sessionStorage.setItem(key,invitation);}catch{}
    }else if(!invitation){try{invitation=sessionStorage.getItem(key)||'';}catch{}}
  }
  async function request(path,body,credential=personal){
    const options=body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'};
    if(credential)options.headers={...options.headers,'x-concentra-key':credential};
    const response=await fetch('/api/'+path,options);
    const result=await response.json();
    if(!response.ok&&!(response.status===401&&result.state==='anonymous'))throw Error(result.message||'No se pudo completar la acción. Vuelve a intentar.');
    if(body&&result.state==='anonymous')throw Error('Tu sesión venció. Vuelve a entrar al grupo.');
    return result;
  }
  function enter(title,info,action){
    $('room').hidden=true;$('entry').hidden=false;$('entryTitle').textContent=title;$('entryInfo').textContent=info;
    for(const id of ['joinForm','login','retry'])$(id).hidden=id!==action;
  }
  function showPosts(posts){
    $('feed').innerHTML=posts.length?posts.map(p=>'<article class="item groupPost"><div class="row"><small>'+esc(p.kind)+' · '+esc(p.name)+'</small><small>'+esc(new Date(p.created).toLocaleDateString('es-CL',{day:'numeric',month:'short'}))+'</small></div><p>'+esc(p.body)+'</p>'+(p.mine?'<button class="link" data-del="'+esc(p.id)+'">Quitar mi publicación</button>':'')+'</article>').join(''):'<p>El muro está listo. Comparte la primera meta del grupo.</p>';
  }
  async function loadRoom(){
    if(location.hostname==='jstk000.github.io'){if(location.hash==='#grupo'||location.hash.startsWith('#invitar='))location.replace('https://concentra-estudio-jp-2611.fastmule27.chatgpt.site/'+location.hash);return;}
    readInvite();if($('grupo').hidden)return;
    const seq=++requestNumber;
    try{
      const s=await request('grupo');if(seq!==requestNumber)return;
      if(s.state==='anonymous'){
        // Including the original fragment in the return path also works across a fresh tab.
        const dest=invitation?'/#invitar='+encodeURIComponent(invitation):'/#grupo';
        $('login').href='/signin-with-chatgpt?return_to='+encodeURIComponent(dest);
        enter(invitation?'Te invitaron a Concentra':'Entrar al grupo',invitation?'Elige tu apodo para crear un perfil con clave personal o continúa con ChatGPT.':'Usa tu clave personal o entra con ChatGPT. Para crear un perfil, abre una invitación.','login');
        $('joinForm').hidden=!invitation;
      }else if(s.state==='guest'){
        enter(invitation?'Únete al grupo de estudio':'Pide una invitación',invitation?'Quienes se unan podrán leer tus publicaciones y compartir las suyas.':'Abre el enlace de invitación que te envió un amigo.',invitation?'joinForm':'');
      }else if(s.state==='member'){
        $('entry').hidden=true;$('room').hidden=false;showPosts(s.posts);$('leaveDevice').hidden=!personal;
        memberLink=new URL('/',location.href).href+'#invitar='+s.invite;
        invitation='';try{sessionStorage.removeItem(key);}catch{}
        if(location.hash.startsWith('#invitar=')){history.replaceState(null,'','#grupo');go();}
      }else throw Error('Respuesta inesperada del grupo.');
    }catch(e){if(seq===requestNumber)enter('Cargar el grupo',e.message,'retry');}
  }
  $('joinForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
    const credential=!$('login').hidden&&!personal?newKey():personal;
    await request('unirse',{name:$('alias').value,invite:invitation},credential);
    if(credential&&!personal){personal=credential;localStorage.setItem(profileKey,personal);showKey();}
    await loadRoom();
  }catch(err){$('entryInfo').textContent=err.message;}finally{b.disabled=false;}};
  function showKey(){
    dialog('Mi clave personal','<p>Guárdala en tu gestor de contraseñas. Quien tenga esta clave puede entrar a tu perfil desde otro dispositivo.</p><label for="keyValue">Clave de acceso</label><textarea readonly id="keyValue"></textarea><button class="solid" id="copyKey">Copiar clave</button>');
    $('keyValue').value=personal;$('copyKey').onclick=async()=>{try{await navigator.clipboard.writeText(personal);say('Clave copiada.');}catch{$('keyValue').select();}};
  }
  $('manageKey').onclick=async()=>{
    if(personal){showKey();return;}
    dialog('Crear clave personal','<p>Podrás entrar al mismo perfil sin ChatGPT. Si ya tenías otra clave, se reemplazará.</p><button id="createKey" class="solid">Crear mi clave</button>');
    $('createKey').onclick=async e=>{e.target.disabled=true;try{const k=newKey();await request('clave',{key:k});personal=k;localStorage.setItem(profileKey,k);showKey();}catch(err){say(err.message);e.target.disabled=false;}};
  };
  $('useKey').onclick=()=>{
    dialog('Entrar con mi clave','<form id="restoreForm"><label for="restoreKey">Clave personal de Concentra</label><input id="restoreKey" type="password" autocomplete="current-password" required><button class="solid">Entrar</button><p role="status" id="restoreInfo"></p></form>');
    $('restoreForm').onsubmit=async e=>{e.preventDefault();const v=$('restoreKey').value.trim();if(!/^[a-f0-9]{64}$/.test(v)){$('restoreInfo').textContent='Revisa que hayas copiado la clave completa.';return;}try{const s=await request('grupo',null,v);if(s.state!=='member')throw Error('No encontramos un perfil con esa clave.');personal=v;localStorage.setItem(profileKey,v);$('modal').close();await loadRoom();}catch(err){$('restoreInfo').textContent=err.message;}};
  };
  $('leaveDevice').onclick=()=>{personal='';localStorage.removeItem(profileKey);loadRoom();};
  $('useRoutine').onclick=()=>{
    const t=data.timer||data;
    $('kind').value='Rutina';$('postText').value=[t.subject||'Mi bloque de estudio',t.minutes+' min',t.goal||'Estudiar una tarea a la vez'].join(' · ');draftId=null;$('postText').focus();
  };
  $('postText').oninput=$('kind').onchange=()=>{draftId=null;};
  $('postForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;
    draftId=draftId||crypto.randomUUID();
    try{await request('publicar',{id:draftId,kind:$('kind').value,text:$('postText').value});
      $('postText').value='';draftId=null;$('groupStatus').textContent='Publicado en el grupo.';await loadRoom();
    }catch(err){$('groupStatus').textContent=err.message;}finally{b.disabled=false;}
  };
  $('feed').onclick=e=>{
    const id=e.target.closest('[data-del]')?.dataset.del;if(!id)return;
    dialog('¿Quitar esta publicación?','<p>Dejará de aparecer en el muro del grupo.</p><button id="removePost" class="solid">Quitar del muro</button>');
    $('removePost').onclick=async()=>{const b=$('removePost');b.disabled=true;try{await request('quitar',{id});$('modal').close();await loadRoom();}catch(err){say(err.message);}finally{b.disabled=false;}};
  };
  $('inviteFriends').onclick=()=>{
    dialog('Invitar a mi grupo','<p>Quien reciba este enlace puede unirse, leer el muro y publicar.</p><label for="inviteURL">Enlace de invitación</label><textarea id="inviteURL" rows="3" readonly></textarea><button id="giveLink" class="solid">'+(navigator.share?'Compartir enlace':'Copiar enlace')+'</button>');
    $('inviteURL').value=memberLink;
    $('giveLink').onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Concentra',text:'Únete a mi grupo de estudio en Concentra.',url:memberLink});else await navigator.clipboard.writeText(memberLink);$('modal').close();if(!navigator.share)say('Enlace copiado.');}catch(e){if(e.name!=='AbortError')$('inviteURL').select();}};
  };
  $('retry').onclick=$('reloadFeed').onclick=loadRoom;
  window.addEventListener('hashchange',loadRoom);
  window.addEventListener('pageshow',loadRoom);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadRoom();});
  loadRoom();
})();
