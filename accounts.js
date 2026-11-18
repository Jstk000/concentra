import {createRemoteJWKSet,jwtVerify} from 'jose';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const encoder=new TextEncoder();
const hex=b=>Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');
const secret=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
async function passwordHash(password,salt){
 const k=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-512',salt:encoder.encode(salt),iterations:100000},k,512)));
}
async function session(request,db){
 const token=request.headers.get('x-concentra-session');
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 return db.prepare('SELECT a.id,a.name FROM accounts a JOIN sessions s ON s.account=a.id WHERE s.token=? AND s.expires>?').bind(await digest(token),Date.now()).first();
}
async function issue(db,a){
 const token=secret();
 await db.prepare('INSERT INTO sessions(token,account,expires) VALUES(?,?,?)').bind(await digest(token),a.id,Date.now()+30*86400000).run();
 return json({name:a.name,token});
}
async function limited(db,tag){
 const slot=Math.floor(Date.now()/900000),key=await digest(tag+':'+slot);
 const row=await db.prepare('INSERT INTO attempts(key,n,slot) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n').bind(key,slot).first();
 return row.n>24;
}
async function accountApi(request,env,url){
 const action=url.pathname.split('/').pop(),db=env.DB;
 if(action==='estudio')return studyProfile(request,db);
 if(action==='config'&&request.method==='GET')return json({client:env.GOOGLE_CLIENT_ID||null});
 if(action==='me'&&request.method==='GET'){const a=await session(request,db);return json({name:a?.name||null});}
 if(request.method!=='POST'||!request.headers.get('content-type')?.startsWith('application/json'))return json({},405);
 if(action==='logout'){
   const token=request.headers.get('x-concentra-session')||'';
   await db.prepare('DELETE FROM sessions WHERE token=?').bind(await digest(token)).run();return json({ok:true});
 }
 if(!['register','login','google'].includes(action))return json({},404);
 const raw=await request.text();if(raw.length>6400)return json({},413);
 let body;try{body=JSON.parse(raw);}catch{return json({},400);}
 if(!body||typeof body!=='object')return json({},400);
 if(await limited(db,'ip:'+(request.headers.get('cf-connecting-ip')||'local')))return json({message:'Demasiados intentos. Vuelve a intentar en 15 minutos.'},429);
 await db.batch([db.prepare('DELETE FROM attempts WHERE slot<?').bind(Math.floor(Date.now()/900000)-1),db.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now())]);
 if(action==='google'){
   if(!env.GOOGLE_CLIENT_ID)return json({message:'Google aún no está habilitado.'},503);
   let identity;try{identity=(await jwtVerify(body.credential,googleKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GOOGLE_CLIENT_ID,algorithms:['RS256']})).payload;}catch{return json({message:'Google no pudo confirmar esta sesión.'},401);}
   if(typeof identity.sub!=='string'||!identity.sub)return json({},401);
   const id='google:'+identity.sub,name=String(identity.name||'Estudiante').slice(0,60);
   await db.prepare('INSERT INTO accounts(id,name) VALUES(?,?) ON CONFLICT(id) DO NOTHING').bind(id,name).run();
   return issue(db,await db.prepare('SELECT id,name FROM accounts WHERE id=?').bind(id).first());
 }
 const name=typeof body.name==='string'?body.name.trim():'',login=name.toLowerCase(),pw=body.password;
 if(!/^[a-z0-9._-]{3,32}$/.test(login)||typeof pw!=='string'||pw.length>256)return json({message:'Usa un usuario de 3 a 32 letras, números, guiones o puntos y una contraseña válida.'},400);
 if(action==='register'){
   if(pw.length<12)return json({message:'Usa al menos 12 caracteres en la contraseña.'},400);
   let id='user:'+crypto.randomUUID();
   if(body.migrate===true){
     const legacy=request.headers.get('x-concentra-key');
     const hash=/^[a-f0-9]{64}$/.test(legacy||'')?await digest('profile:'+legacy):null;
     const mapped=hash?await db.prepare('SELECT user FROM member_keys WHERE hash=?').bind(hash).first():null;
     const owner=hash?(mapped?.user||'personal:'+hash):request.headers.get('oai-authenticated-user-id');
     if(!owner||!await db.prepare('SELECT user FROM members WHERE user=?').bind(owner).first())return json({message:'Abre tu perfil anterior en el dispositivo donde lo usabas.'},400);
     id=owner;
   }
   const salt=secret(),hash=await passwordHash(pw,salt);
   const inserted=await db.prepare('INSERT INTO accounts(id,name,login,salt,hash) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING').bind(id,name,login,salt,hash).run();
   if(!inserted.meta.changes)return json({message:'El usuario o el perfil ya está registrado.'},409);
   return issue(db,{id,name});
 }
 if(await limited(db,'login:'+login))return json({message:'Demasiados intentos. Espera 15 minutos.'},429);
 const a=await db.prepare('SELECT id,name,salt,hash FROM accounts WHERE login=?').bind(login).first();
 const hash=await passwordHash(pw,a?.salt||'concentra-unused-salt');
 if(!a||hash!==a.hash)return json({message:'Revisa tu usuario y contraseña.'},401);
 return issue(db,a);
}
async function withAccountAccess(request,env,url){
 const origin=request.headers.get('origin'),allowed=origin===url.origin||origin===pagesOrigin;
 if((origin&&!allowed)||(request.method==='POST'&&!allowed))return json({},403);
 const cors={'Access-Control-Allow-Origin':origin||url.origin,'Access-Control-Allow-Headers':'content-type,x-concentra-session,x-concentra-key','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 let response;try{response=url.pathname.startsWith('/api/cuenta/')?await accountApi(request,env,url):await api(request,env,url);}catch{response=json({message:'No pudimos conectar con el servicio. Inténtalo de nuevo.'},503);}
 const out=new Response(response.body,response);Object.entries(cors).forEach(([k,v])=>out.headers.set(k,v));return out;
}
