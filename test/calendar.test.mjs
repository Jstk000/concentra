import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../dist/server/index.js';

test('un cambio pendiente de otra pestaña respeta la baja del calendario', async t => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const dir = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file,dir), 'utf8'));
  }
  const DB = { prepare(sql) {
    const query = sqlite.prepare(sql);
    return { bind(...values) { return {
      first: () => query.get(...values),
      run: () => ({meta: query.run(...values)})
    }; } };
  }};
  const origin='https://concentra.example';
  const send=(key, body) => worker.fetch(new Request(origin+'/api/calendario',{
    method:'POST',headers:{origin,'x-calendar-key':key,'content-type':'application/json'},
    body:JSON.stringify(body)
  }),{DB});
  const read=url=>worker.fetch(new Request(url),{DB});
  const key='1'.repeat(64);
  const classes=[{id:'a',name:'Física',day:1,from:'10:00',until:'12:00'}];
  const {url}=await (await send(key,{classes})).json();
  assert.match(await (await read(url)).text(),/SUMMARY:Física/);
  assert.equal((await send(key,{remove:true})).status,200);
  assert.equal((await send(key,{classes})).status,410);
  assert.equal((await read(url)).status,404);
  const fresh=await (await send('2'.repeat(64),{classes})).json();
  assert.notEqual(fresh.url,url);
  assert.equal((await read(fresh.url)).status,200);
});

