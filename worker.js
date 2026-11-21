const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
function json(obj,status=200){return Response.json(obj,{status,headers});}
async function api(request,env,url){
  const db=env.DB, path=url.pathname;
  const active=await session(request,db);
  if(request.headers.has('x-concentra-session')&&!active)return json({state:'anonymous'},401);
  const account=active?.id||(request.headers.get('origin')===pagesOrigin?null:request.headers.get('oai-authenticated-user-id'));
  const key=active?null:request.headers.get('x-concentra-key');
  const hash=key&&/^[a-f0-9]{64}$/.test(key)?await digest('profile:'+key):null;
  const linked=hash?await db.prepare('SELECT user FROM member_keys WHERE hash=?').bind(hash).first():null;
  const uid=key?(linked?.user||(hash?'personal:'+hash:null)):account;
  if(!uid)return json({state:'anonymous'},401);
  const member=await db.prepare('SELECT name FROM members WHERE user=?').bind(uid).first();
  if(request.method==='GET'){
    if(path!=='/api/grupo')return json({},404);
    if(!member)return json({state:'guest'});
    const {results}=await db.prepare('SELECT p.id, p.kind, p.body, p.created, m.name, (p.user=?) AS mine FROM posts p JOIN members m ON p.user=m.user ORDER BY p.created DESC,p.id DESC LIMIT 60').bind(uid).all();
    return json({state:'member',name:member.name,posts:results,invite:env.GRUPO_INVITACION});
  }
  if(request.method!=='POST'||![url.origin,pagesOrigin].includes(request.headers.get('origin'))||!request.headers.get('content-type')?.startsWith('application/json'))return json({},403);
  let body;
  try{body=await request.json();if(!body||typeof body!=='object')return json({},400);}catch{return json({},400);}
  if(path==='/api/clave'&&account&&!key&&member){
    if(!/^[a-f0-9]{64}$/.test(body.key))return json({},400);
    await db.prepare('INSERT INTO member_keys(user,hash) VALUES (?,?) ON CONFLICT(user) DO UPDATE SET hash=excluded.hash').bind(account,await digest('profile:'+body.key)).run();
    return json({ok:true});
  }
  if(path==='/api/unirse'){
    if(!env.GRUPO_INVITACION||body.invite!==env.GRUPO_INVITACION)return json({message:'El enlace de invitación no es válido.'},403);
    const name=typeof body.name==='string'?body.name.trim():'';
    if(!name||name.length>40)return json({message:'Usa un nombre de hasta 40 caracteres.'},400);
    await db.prepare('INSERT INTO members (user,name) VALUES (?,?) ON CONFLICT(user) DO NOTHING').bind(uid,name).run();
    return json({ok:true});
  }
  if(!member)return json({},403);
  if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))return json({},400);
  if(path==='/api/publicar'){
    const msg=typeof body.text==='string'?body.text.trim():'';
    if(!msg||msg.length>600||!['Meta','Rutina','Logro'].includes(body.kind))return json({message:'Escribe entre 1 y 600 caracteres.'},400);
    await db.prepare('INSERT INTO posts (id,user,body,kind,created) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(body.id,uid,msg,body.kind,Date.now()).run();
  }else if(path==='/api/quitar'){
    await db.prepare('DELETE FROM posts WHERE id=? AND user=?').bind(body.id,uid).run();
  }else return json({},404);
  return json({ok:true});
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/calendario'||url.pathname.startsWith('/horarios/'))return calendar(request,env,url);
  if(url.pathname.startsWith('/api/'))return withAccountAccess(request,env,url);
  if(url.pathname==='/robots.txt')return new Response('User-agent: *\nDisallow: /',{headers});
  if(url.pathname==='/bloqueador.zip')return new Response(Uint8Array.from(atob(assets[url.pathname]),c=>c.charCodeAt(0)),{headers:{...headers,'Content-Type':'application/zip','Content-Disposition':'attachment; filename="Concentra-bloqueo.zip"'}});
  if(!Object.hasOwn(assets,url.pathname))return new Response('Página no encontrada',{status:404,headers});
  const types={'/timer-worker.js':'application/javascript','/':'text/html; charset=utf-8','/focus.js':'application/javascript','/campana.wav':'audio/wav','/pulso.wav':'audio/wav','/acorde.wav':'audio/wav','/brio.wav':'audio/wav','/descanso.wav':'audio/wav','/style.css':'text/css; charset=utf-8','/app.js':'application/javascript','/horario.js':'application/javascript','/perfil.js':'application/javascript','/cuenta.js':'application/javascript','/grupo.js':'application/javascript','/icon.png':'image/png','/app.webmanifest':'application/manifest+json'};
  const value=assets[url.pathname];return new Response((url.pathname==='/icon.png'||url.pathname.endsWith('.wav'))?Uint8Array.from(atob(value),c=>c.charCodeAt(0)):value,{headers:{...headers,'Content-Type':types[url.pathname]}});
}};
