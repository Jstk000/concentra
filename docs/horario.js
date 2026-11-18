'use strict';
(()=>{
 const slots=$('slots'),calendarKey='concentra.calendar.v1';
 const base='https://concentra-estudio-jp-2611.fastmule27.chatgpt.site';
 let link=JSON.parse(localStorage.getItem(calendarKey)||'null'), queue=Promise.resolve();
 const persist=()=>link?localStorage.setItem(calendarKey,JSON.stringify(link)):localStorage.removeItem(calendarKey);
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
   data.classes.push(...next);save();schedule();slots.replaceChildren();addSlot();$('className').value='';say(name+' · '+next.length+' bloque(s) guardado(s).');sync();
 };
 addSlot();
 async function send(state,body){
   const r=await fetch(base+'/api/calendario',{method:'POST',headers:{'Content-Type':'application/json','X-Calendar-Key':state.secret},body:JSON.stringify(body)});
   if(!r.ok)throw Error('No se pudo actualizar el calendario.');return r.json();
 }
 function sync(force=false){
   if(!link)return Promise.resolve();const state=link,blocks=JSON.stringify(data.classes);
   queue=queue.catch(()=>{}).then(async()=>{if(state!==link||(!force&&blocks===state.snapshot))return;
     try{const r=await send(state,{classes:JSON.parse(blocks)});if(state===link){state.url=r.url;state.snapshot=blocks;persist();$('calState').textContent='Horario enviado al calendario.';}}
     catch(e){$('calState').textContent='Sin sincronizar. Reintenta desde Vincular calendario.';throw e;}
   });queue.catch(()=>{});return queue;
 }
 document.addEventListener('concentra-horario',()=>sync());
 window.addEventListener('online',()=>sync());
 async function calendarDialog(){
   dialog('Vincular calendario','<p>Suscribe Google Calendar o el Calendario del iPhone a tus clases semanales. Concentra enviará el ramo, los días y las horas. Cualquier persona con el enlace podrá leer ese horario.</p><div id="calControls"></div>');
   if(!link?.url){$('calControls').innerHTML='<button class="solid" id="enableCal">Activar suscripción</button>';
     $('enableCal').onclick=async e=>{const b=e.target;b.disabled=true;try{if(!link){link={secret:Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('')};persist();}await sync(true);await calendarDialog();}catch{say('No se pudo activar. Vuelve a intentar.');b.disabled=false;}};return;}
   $('calControls').innerHTML='<a id="appleSub" class="link">Suscribirme en Apple Calendar</a><p>En Google Calendar desde el computador, abre Otros calendarios → + → Desde una URL y pega este enlace.</p><label for="calUrl">Enlace de solo lectura</label><textarea readonly id="calUrl" rows="3"></textarea><button class="solid" id="copyCal">Copiar enlace</button> <button class="link" id="retryCal">Sincronizar ahora</button><hr><p>Los cambios aparecen cuando la otra app actualice la suscripción. Las clases se repiten en hora local.</p><button class="link" id="disableCal">Desactivar enlace</button>';
   $('calUrl').value=link.url;$('appleSub').href=link.url.replace('https:','webcal:');
   $('copyCal').onclick=async()=>{try{await navigator.clipboard.writeText(link.url);say('Enlace copiado.');}catch{$('calUrl').select();}};
   $('retryCal').onclick=async()=>{try{await sync(true);say('Horario actualizado.');}catch{say('No se pudo sincronizar.');}};
   $('disableCal').onclick=async e=>{const b=e.target;b.disabled=true;await queue.catch(()=>{});try{await send(link,{remove:true});link=null;persist();$('modal').close();$('calState').textContent='Suscripción desactivada.';}catch{say('No se pudo desactivar el enlace.');b.disabled=false;}};
 }
 $('calendarConnect').onclick=calendarDialog;if(link)sync();
})();
