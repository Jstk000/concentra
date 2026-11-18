const pagesOrigin='https://jstk000.github.io';
async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
function calendarText(row){
  const stamp=new Date(row.changed).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z/,'Z');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Concentra//Horario//ES','CALSCALE:GREGORIAN','X-WR-CALNAME:Concentra'];
  for(const c of JSON.parse(row.blocks)){
    const d=new Date(row.created);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)+(c.day+6)%7);
    const date=d.toISOString().slice(0,10).replaceAll('-','')+'T';
    const name=c.name.replaceAll('\\','\\\\').replaceAll(',','\\,').replaceAll(';','\\;');
    lines.push('BEGIN:VEVENT','UID:'+c.id+'-'+row.id.slice(0,16)+'@concentra','DTSTAMP:'+stamp,'SUMMARY:'+name,'DTSTART:'+date+c.from.replace(':','')+'00','DTEND:'+date+c.until.replace(':','')+'00','RRULE:FREQ=WEEKLY','END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(s=>{let line='',bytes=0;for(const ch of s){const n=new TextEncoder().encode(ch).length;if(bytes+n>75){line+='\r\n ';bytes=1;}line+=ch;bytes+=n;}return line;}).join('\r\n')+'\r\n';
}
async function calendar(request,env,url){
  const feed=url.pathname.match(/^\/horarios\/([a-f0-9]{64})\.ics$/);
  if(feed&&request.method==='GET'){
    const row=await env.DB.prepare('SELECT * FROM calendars WHERE id=?').bind(await digest(feed[1])).first();
    return row?new Response(calendarText(row),{headers:{...headers,'Content-Type':'text/calendar; charset=utf-8'}}):new Response(null,{status:404,headers});
  }
  const origin=request.headers.get('origin');
  if(url.pathname!=='/api/calendario'||![pagesOrigin,url.origin].includes(origin))return json({},403);
  const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type, x-calendar-key',Vary:'Origin',...headers};
  const respond=(o,s=200)=>Response.json(o,{status:s,headers:cors});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const token=request.headers.get('X-Calendar-Key')?.match(/^([a-f0-9]{64})$/)?.[1];
  if(request.method!=='POST'||!token)return respond({},403);
  const read=await digest('read:'+token),id=await digest(read);
  let body;try{const raw=await request.text();if(raw.length>40000)return respond({},413);body=JSON.parse(raw);}catch{return respond({},400);}
  if(body?.remove===true){await env.DB.prepare('DELETE FROM calendars WHERE id=?').bind(id).run();return respond({ok:true});}
  const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if(!Array.isArray(body?.classes)||body.classes.length>200||body.classes.some(c=>!c||typeof c.name!=='string'||!c.name.trim()||c.name.length>60||/[\x00-\x1F]/.test(c.name)||!Number.isInteger(c.day)||c.day<0||c.day>6||!time.test(c.from)||!time.test(c.until)||c.from>=c.until||!/^[-a-z0-9]{1,64}$/i.test(c.id)))return respond({message:'Revisa los bloques de tu horario (máximo 200).'},400);
  const now=Date.now(),blocks=JSON.stringify(body.classes.map(({id,name,day,from,until})=>({id,name,day,from,until})));
  const bucket=await digest((env.GRUPO_INVITACION||'')+new Date(now).toISOString().slice(0,10)+(request.headers.get('cf-connecting-ip')||'local'));
  const result=await env.DB.prepare('INSERT INTO calendars(id,blocks,created,changed,bucket) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM calendars WHERE id=?) OR (SELECT COUNT(*) FROM calendars WHERE bucket=?)<80 ON CONFLICT(id) DO UPDATE SET blocks=excluded.blocks,changed=excluded.changed').bind(id,blocks,now,now,bucket,id,bucket).run();
  return result.meta.changes?respond({url:url.origin+'/horarios/'+read+'.ics'}):respond({message:'Se alcanzó el límite de calendarios nuevos por hoy.'},429);
}
