async function studyProfile(request,db){
 const account=await session(request,db);
 if(!account)return json({message:'Vuelve a iniciar sesión.'},401);
 const scope=await digest('study:'+account.id);
 async function current(){
   const row=await db.prepare('SELECT revision,state FROM study_profiles WHERE account=?').bind(account.id).first();
   return {scope,revision:row?.revision||0,state:row?JSON.parse(row.state):null};
 }
 if(request.method==='GET')return json(await current());
 if(request.method!=='POST'||!request.headers.get('content-type')?.startsWith('application/json'))return json({},405);
 const raw=await request.text();if(raw.length>900000)return json({message:'El historial supera el tamaño permitido.'},413);
 let body;try{body=JSON.parse(raw);}catch{return json({},400);}
 const s=body?.state,revision=body?.revision;
 const str=(v,n)=>typeof v==='string'&&v.length<=n;
 const validReason=value=>value===undefined||str(value,240);
 const validId=v=>typeof v==='string'&&/^[-a-z0-9]{1,80}$/i.test(v);
 const minutes=v=>Number.isInteger(v)&&v>=1&&v<=180;
 const time=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
 const timestamp=v=>Number.isSafeInteger(v)&&v>=0&&v<8640000000000000;
 const block=b=>b&&validId(b.id)&&minutes(b.minutes)&&str(b.subject,60)&&str(b.goal,160);
 const validList=(list,check)=>Array.isArray(list)&&list.every(check)&&new Set(list.map(x=>x.id)).size===list.length;
 if(!Number.isSafeInteger(revision)||revision<0||!s||!str(s.subject,60)||!str(s.goal,160)||!minutes(s.minutes)||
   !validList(s.classes,c=>c&&validId(c.id)&&str(c.name,60)&&Number.isInteger(c.day)&&c.day>=0&&c.day<=6&&time(c.from)&&time(c.until)&&c.until>c.from)||
   !validList(s.history,h=>block(h)&&timestamp(h.at))||
   !(s.timer===null||block(s.timer)&&validReason(s.timer.reason)&&(timestamp(s.timer.end)||s.timer.end===null&&Number.isFinite(s.timer.left)&&s.timer.left>=0&&s.timer.left<=s.timer.minutes*60000))||
   !validReason(s.reason)||s.blockSites!==undefined&&(!Array.isArray(s.blockSites)||!s.blockSites.every(d=>str(d,80))))return json({message:'Revisa los datos del horario y de los bloques.'},400);
 const safe={subject:s.subject,goal:s.goal,minutes:s.minutes,classes:s.classes,history:s.history,timer:s.timer,reason:s.reason,blockSites:s.blockSites};
 if(s.calendarLink!=null){
   const link=s.calendarLink;
   if(!/^[a-f0-9]{64}$/.test(link.secret)||link.url!=null&&link.url!=='https://concentra-estudio-jp-2611.fastmule27.chatgpt.site/horarios/'+await digest('read:'+link.secret)+'.ics')return json({message:'El enlace del calendario no es válido.'},400);
   safe.calendarLink={secret:link.secret,url:link.url};
 }
 const state=JSON.stringify(safe);
 const result=revision===0?await db.prepare('INSERT INTO study_profiles(account,revision,state) VALUES(?,1,?) ON CONFLICT DO NOTHING').bind(account.id,state).run():
   await db.prepare('UPDATE study_profiles SET state=?, revision=revision+1 WHERE account=? AND revision=?').bind(state,account.id,revision).run();
 if(!result.meta.changes)return json(await current(),409);
 return json({scope,revision:revision+1,state:safe});
}
