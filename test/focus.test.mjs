import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const focus=readFileSync(new URL('../docs/focus.js',import.meta.url),'utf8');
function device(){
  const storage=new Map(), controls=new Map();
  const state={
    deviceStore:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    data:{minutes:25,timer:null,history:[]},studyScope:'local',accountScope:()=>'local',
    studyKey:()=>'guest',localOwner:'pc',desktopModes:true,windowsApp:false,
    remaining:t=>t.end===null?t.left:Math.max(0,t.end-Date.now()),freshId:()=>'rest-id',
    document:{addEventListener(){}},renderTimer(){},releaseDevice:()=>true,notifyTimerEnd(){},
    $:id=>{if(!controls.has(id))controls.set(id,{click(){this.clicked=true;}});return controls.get(id);}
  };
  vm.createContext(state);vm.runInContext(focus,state);return state;
}
test('Prisma mantiene el identificador anterior y se preservan las elecciones de sonido',()=>{
  const app=device();
  assert.equal(app.alarmPrefs().tone,'pulso');
  for(const tone of ['acorde','campana','pulso','brio']){
    app.deviceStore.setItem('concentra.melodia',tone);
    assert.equal(app.alarmPrefs().tone,tone);
  }
  app.deviceStore.setItem('concentra.melodia','desconocida');
  assert.equal(app.alarmPrefs().tone,'pulso');
});
test('El descanso largo usa solo bloques completos y el descanso nunca suma estudio',()=>{
  const app=device();app.data.history=[{},{},{},{},{partial:true}];const count=app.data.history.length;
  app.nextRest({owner:'pc',end:Date.now(),mode:'focus'});
  assert.equal(app.restState().phase,'long');app.startRest();assert.equal(app.restState().minutes,15);
  app.startRest();assert.equal(app.restState().end,null);assert.ok(app.restState().left>0);
  app.startRest();app.finishRest(app.restState(),true);
  assert.equal(app.restState(),null);assert.equal(app.data.history.length,count);assert.equal(app.data.timer,null);
});
test('Al volver automáticamente desde un descanso estricto se solicita de nuevo el modo estricto',()=>{
  const app=device();app.data.history=[{}];app.deviceStore.setItem('concentra.autoRest','on');app.deviceStore.setItem('concentra.autoStudy','on');
  app.nextRest({owner:'pc',end:Date.now(),mode:'strict'});const rest=app.restState();
  assert.equal(rest.phase,'short');assert.equal(rest.minutes,5);rest.end=Date.now();app.finishRest(rest,true);
  assert.equal(app.$('focusMode').value,'strict');assert.ok(app.$('start').clicked);
});
test('El selector acepta dominios e impide añadir la página que controla el reloj',()=>{
  const app=device();
  for(const value of ['distraccion.cl','mis-videos.ejemplo.org'])assert.equal(app.validSite(value),true);
  for(const value of ['jstk000.github.io','github.io','https://sitio.cl/a','*.sitio.cl','',null])assert.equal(app.validSite(value),false);
});
test('Las cinco muestras compartidas son PCM de tres segundos, con margen antes de saturar',()=>{
  const buffers=new Set();
  for(const tone of ['campana','pulso','acorde','brio','descanso']){
    const wav=readFileSync(new URL('../docs/'+tone+'.wav',import.meta.url));buffers.add(wav.toString('base64'));
    const rate=wav.readUInt32LE(24),bytes=wav.readUInt32LE(40);
    assert.equal(wav.toString('ascii',8,12),'WAVE');assert.equal(wav.readUInt16LE(34),16);
    assert.equal(bytes/(rate*2),3);let peak=0,energy=0;
    for(let i=44;i<wav.length;i+=2){const a=wav.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(a));energy+=a*a;}
    assert.ok(peak>0.6 && peak<0.98);assert.ok(Math.sqrt(energy/(bytes/2))>0.20);
  }
  assert.equal(buffers.size,5);
});
