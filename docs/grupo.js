'use strict';
(()=>{
  let invitation='',memberLink='',requestNumber=0,draftId=null;
  const key='concentra.grupo.invitacion';
  const profileKey='concentra.perfil.clave';
  function readInvite(){
    if(location.hash.startsWith('#invitar=')){
      invitation=location.hash.slice(9);
      try{sessionStorage.setItem(key,invitation);}catch{}
    }else if(!invitation){try{invitation=sessionStorage.getItem(key)||'';}catch{}}
  }
  async function request(path,body,credential=localStorage.getItem(profileKey)){
    const options=body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'};
    const token=localStorage.getItem(sessionKey);
    if(token)options.headers={...options.headers,'x-concentra-session':token};
    else if(credential)options.headers={...options.headers,'x-concentra-key':credential};
    const response=await fetch(service+'/api/'+path,options);
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
    readInvite();if($('grupo').hidden)return;
    const seq=++requestNumber;
    try{
      const s=await request('grupo');if(seq!==requestNumber)return;
      if(s.state==='anonymous'){
        enter('Entrar al grupo',invitation?'Inicia sesión o crea tu cuenta para aceptar la invitación.':'Usa tu cuenta de Concentra para entrar al grupo.','login');
      }else if(s.state==='guest'){
        enter(invitation?'Únete al grupo de estudio':'Pide una invitación',invitation?'Quienes se unan podrán leer tus publicaciones y compartir las suyas.':'Abre el enlace de invitación que te envió un amigo.',invitation?'joinForm':'');
      }else if(s.state==='member'){
        $('entry').hidden=true;$('room').hidden=false;showPosts(s.posts);window.previousMember=!localStorage.getItem(sessionKey);$('convertProfile').hidden=!window.previousMember;
        memberLink=location.origin+location.pathname+'#invitar='+s.invite;
        invitation='';try{sessionStorage.removeItem(key);}catch{}
        if(location.hash.startsWith('#invitar=')){history.replaceState(null,'','#grupo');go();}
      }else throw Error('Respuesta inesperada del grupo.');
    }catch(e){if(seq===requestNumber)enter('Cargar el grupo',e.message,'retry');}
  }
  $('joinForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
    await request('unirse',{name:$('alias').value,invite:invitation});await loadRoom();
  }catch(err){$('entryInfo').textContent=err.message;}finally{b.disabled=false;}};
  $('login').onclick=()=>accountForm();
  $('convertProfile').onclick=()=>accountForm(true);
  document.addEventListener('account-change',()=>{window.previousMember=false;loadRoom();});
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
