'use strict';
(()=>{
 const slots=$('slots'),calendarKey='concentra.calendar.v1';
 const base='https://concentra-estudio-jp-2611.fastmule27.chatgpt.site';
 function readLink(){
   if(studyScope===null)return null;
   const raw=studyScope?JSON.stringify(data.calendarLink||null):deviceStore.getItem(calendarKey);
   if(!raw||raw==='null')return null;
   try{
     const value=JSON.parse(raw);
     if(!value||!/^[a-f0-9]{64}$/.test(value.secret))throw Error();
     if(value.url){
       const url=new URL(value.url);
       if(url.origin!==base||!/^\/horarios\/[a-f0-9]{64}\.ics$/.test(url.pathname))throw Error();
     }
     return value;
   }catch{$('calState').textContent='Revisa la vinculación del calendario. Tu horario sigue disponible.';return null;}
 }
 let link=readLink(),queue=Promise.resolve(),revoking=false;
 function persist(){
   if(studyScope===null)return false;
   if(!studyScope)return link?deviceStore.setItem(calendarKey,JSON.stringify(link)):deviceStore.removeItem(calendarKey);
   const next=link?{secret:link.secret,url:link.url}:null;
   if(JSON.stringify(next)!==JSON.stringify(data.calendarLink||null)){if(next)data.calendarLink=next;else delete data.calendarLink;save();}
   return true;
 }
 document.addEventListener('profile-loaded',()=>{
   const next=readLink();if(link?.secret!==next?.secret&&$('calControls')&&$('modal').open)$('modal').close();
   if(link&&next?.secret===link.secret)Object.assign(link,next);else link=next;
   if(link)sync();
 });
 function addSlot(chosen=[new Date().getDay()],from='09:00',until='10:30'){
   const row=document.createElement('fieldset');row.className='slot';row.innerHTML='<legend>Bloque semanal</legend><div class="dayChoices">'+[1,2,3,4,5,6,0].map(i=>'<label><input type="checkbox" value="'+i+'" '+(chosen.includes(i)?'checked':'')+'><span>'+days[i].slice(0,3)+'</span></label>').join('')+'</div><div class="pair"><label>Desde<input type="time" required class="from"></label><label>Hasta<input type="time" required class="until"></label></div><button type="button" class="link removeSlot">Quitar bloque</button>';
   row.querySelector('.from').value=from;row.querySelector('.until').value=until;
   slots.append(row);row.querySelector('button').onclick=()=>{row.remove();updateRemove();};updateRemove();
 }
 function updateRemove(){slots.querySelectorAll('.removeSlot').forEach(b=>b.hidden=slots.children.length===1);}
 $('addSlot').onclick=()=>{const row=slots.lastElementChild;addSlot([...row.querySelectorAll(':checked')].map(c=>+c.value),row.querySelector('.until').value,'');};
 $('classForm').onsubmit=e=>{
   e.preventDefault();const name=$('className').value.trim(),next=[];
   if(!name){say('Escribe el nombre del ramo.');return;}
   for(const row of slots.children){
     const from=row.querySelector('.from').value,until=row.querySelector('.until').value,selected=row.querySelectorAll(':checked');
     if(!selected.length||until<=from){say('Elige al menos un día y revisa las horas de cada bloque.');return;}
     for(const input of selected){const day=+input.value;
       if([...data.classes,...next].some(c=>c.day===day&&from<c.until&&until>c.from)){say('Hay un cruce el '+days[day]+' entre '+from+' y '+until+'. Revisa los bloques.');return;}
       next.push({id:freshId(),day,name,from,until});
     }
   }
   data.classes.push(...next);save();schedule();slots.replaceChildren();addSlot();$('className').value='';say(name+' · '+next.length+(next.length===1?' bloque guardado.':' bloques guardados.'));sync();
 };
 addSlot();
 async function send(state,body){
   const r=await fetch(base+'/api/calendario',{method:'POST',headers:{'Content-Type':'application/json','X-Calendar-Key':state.secret},body:JSON.stringify(body)});
   const result=await r.json();
   if(!r.ok){const error=new Error(result.message||'No se pudo actualizar el calendario.');error.status=r.status;throw error;}
   return result;
 }
 function sync(force=false){
   if(!link||revoking)return Promise.resolve();const state=link,blocks=JSON.stringify(data.classes);
   queue=queue.catch(()=>{}).then(async()=>{if(revoking||state!==link||readLink()?.secret!==state.secret||(!force&&blocks===state.snapshot))return;
     try{const r=await send(state,{classes:JSON.parse(blocks)});if(!revoking&&state===link&&readLink()?.secret===state.secret){state.url=r.url;state.snapshot=blocks;persist();$('calState').textContent='Horario enviado al calendario.';}}
     catch(e){
       if(e.status===410&&state===link){link=null;if(readLink()?.secret===state.secret)persist();$('calState').textContent='Suscripción desactivada.';if($('calControls'))$('modal').close();}
       else $('calState').textContent=e.message;
       throw e;
     }
   });queue.catch(()=>{});return queue;
 }
 document.addEventListener('concentra-horario',()=>sync());
 window.addEventListener('online',()=>sync());
 window.addEventListener('storage',e=>{
   if(studyScope!==''||(e.key!==calendarKey&&e.key!==null))return;
   const previous=link?.secret,next=readLink();
   if(link&&next?.secret===previous){Object.assign(link,next);return;}
   link=next;
   if(previous!==link?.secret){
     if($('calControls')&&$('modal').open)$('modal').close();
     $('calState').textContent=link?'Suscripción de calendario activa.':'Suscripción desactivada.';
   }
 });
 async function calendarDialog(){
   dialog('Vincular calendario','<p>Suscribe Google Calendar o el Calendario del iPhone a tus clases semanales. Concentra enviará el ramo, los días y las horas. Cualquier persona con el enlace podrá leer ese horario.</p><div id="calControls"></div>');
   if(!link?.url){$('calControls').innerHTML='<button class="solid" id="enableCal">Activar suscripción</button>';
     $('enableCal').onclick=async e=>{const b=e.target;b.disabled=true;try{if(!link){link={secret:Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('')};if(!persist()){link=null;persist();throw Error('Permite guardar datos en este navegador para conservar el control de tu enlace.');}}await sync(true);if($('calControls')&&$('modal').open)await calendarDialog();}catch(error){say(error.message);b.disabled=false;}};return;}
   $('calControls').innerHTML='<a id="appleSub" class="link">Suscribirme en Apple Calendar</a><p>En Google Calendar desde el computador, abre Otros calendarios → + → Desde una URL y pega este enlace.</p><label for="calUrl">Enlace de solo lectura</label><textarea readonly id="calUrl" rows="3"></textarea><button class="solid" id="copyCal">Copiar enlace</button> <button class="link" id="retryCal">Sincronizar ahora</button><hr><p>Los cambios aparecen cuando la otra app actualice la suscripción. Las clases se repiten en hora local.</p><button class="link" id="disableCal">Desactivar enlace</button>';
   $('calUrl').value=link.url;$('appleSub').href=link.url.replace('https:','webcal:');
   $('copyCal').onclick=async()=>{try{await navigator.clipboard.writeText(link.url);say('Enlace copiado.');}catch{$('calUrl').select();}};
   $('retryCal').onclick=async()=>{try{await sync(true);say('Horario actualizado.');}catch{say('No se pudo sincronizar.');}};
   $('disableCal').onclick=async e=>{const b=e.target;b.disabled=true;revoking=true;const old=link;await queue.catch(()=>{});try{await send(old,{remove:true});if(readLink()?.secret===old.secret){link=null;persist();}$('modal').close();$('calState').textContent='Suscripción desactivada.';}catch{say('No se pudo desactivar el enlace.');b.disabled=false;}finally{revoking=false;}};
 }
 $('calendarConnect').onclick=calendarDialog;if(link)sync();
})();
