import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash,randomBytes } from 'node:crypto';
import { readFileSync,readdirSync } from 'node:fs';
import worker from '../dist/server/index.js';

test('el avance se recupera en otra sesión de la misma cuenta y una revisión antigua no lo sobrescribe',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const folder=new URL('../drizzle/',import.meta.url);
 for(const f of readdirSync(folder).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(f,folder),'utf8'));
 const DB={prepare(sql){return{bind(...args){const stmt=db.prepare(sql);return{first:()=>stmt.get(...args),run:()=>({meta:stmt.run(...args)})};}};}};
 function login(id){
   db.prepare('INSERT OR IGNORE INTO accounts(id,name) VALUES(?,?)').run(id,id);
   const token=randomBytes(32).toString('hex');
   db.prepare('INSERT INTO sessions(token,account,expires) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+60000);
   return token;
 }
 const post=(token,body)=>worker.fetch(new Request('https://concentra.example/api/cuenta/estudio',{
   method:body?'POST':'GET',headers:{origin:'https://concentra.example','content-type':'application/json','x-concentra-session':token},
   body:body?JSON.stringify(body):undefined
 }),{DB});
 const one=login('one'),again=login('one'),two=login('two');
 const h={id:'block-1',minutes:25,at:Date.now(),subject:'Física',goal:'Guía'};
 const state={subject:'Física',goal:'Guía',minutes:25,timer:null,history:[h],classes:[{id:'class-1',name:'Física',day:2,from:'09:00',until:'10:30'}]};
 assert.equal((await post(one,{state,revision:0})).status,200);
 assert.deepEqual((await (await post(again)).json()).state,state);
 assert.equal((await post(again,{revision:0,state:{...state,history:[]}})).status,409);
 assert.equal((await (await post(two)).json()).state,null);
 assert.equal((await post('')).status,401);
});
