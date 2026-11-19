// Acceptance test for a fresh, disposable Android emulator with the debug app installed.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8'}).trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const app='cl.concentra.estudio', other='com.android.deskclock';
assert.equal(adb('shell','getprop','ro.kernel.qemu'),'1','Usar solamente en un emulador recién creado');
assert.match(adb('shell','pm','path',other),/package:/);
const prefs='<map><set name="apps"><string>'+other+'</string></set></map>';
// The chooser is preconfigured only on this dedicated CI device.
execFileSync('adb',['shell','run-as',app,'sh','-c',"'mkdir -p shared_prefs && cat > shared_prefs/focus.xml'"],{input:prefs});
adb('shell','settings','put','secure','enabled_accessibility_services',app+'/.FocusService');
adb('shell','settings','put','secure','accessibility_enabled','1');
adb('shell','am','start','-W','-n',app+'/.StudyActivity');
const pid=adb('shell','pidof',app);
adb('forward','tcp:19483','localabstract:webview_devtools_remote_'+pid);
let tab;
for(let i=0;i<90&&!tab;i++){
  try{tab=(await (await fetch('http://127.0.0.1:19483/json/list')).json()).find(t=>t.url.startsWith('https://jstk000.github.io/concentra/'));}catch{}
  if(!tab)await sleep(1000);
}
assert.ok(tab,'Concentra debe abrirse en el WebView');
const ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});
let seq=0;
function evaluate(expression){
 const id=++seq;
 return new Promise((ok,fail)=>{
   const timer=setTimeout(()=>fail(Error('El WebView no respondió')),15000);
   const listener=e=>{
     const m=JSON.parse(e.data);
     if(m.id!==id)return;
     ws.removeEventListener('message',listener);clearTimeout(timer);
     if(m.error||m.result.exceptionDetails)fail(Error(JSON.stringify(m)));else ok(m.result.result.value);
   };
   ws.addEventListener('message',listener);
   ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,userGesture:true}}));
 });
}
try {
 for(let i=0;i<45;i++){if(await evaluate("typeof strictDeadline === 'function'"))break;await sleep(1000);}
 const start=await evaluate("(()=>{setMinutes(1);data.reason='Leer el problema';save();$('start').click();return {end:data.timer?.end,strict:data.timer?.strict,note:$('modalNotice').textContent||$('toast').textContent}})()");
 assert.equal(start.strict,true,JSON.stringify(start));
 console.log('El Pomodoro activó el bloqueo.');
 const launch=()=>adb('shell','monkey','-p',other,'-c','android.intent.category.LAUNCHER','1');
 const foreground=()=>adb('shell','dumpsys','activity','activities').split('\n').filter(s=>/mResumedActivity|topResumedActivity/.test(s)).join('\n');
 launch();await sleep(1500);const blocked=foreground();assert.ok(blocked && !blocked.includes(other),blocked);
 console.log('Android devolvió al inicio al intentar abrir la app elegida.');
 await sleep(Math.max(0,start.end-Date.now())+1600);launch();await sleep(1400);
 const released=foreground();assert.ok(released.includes(other),released);
 console.log('La misma app se pudo abrir al vencer el tiempo.');
} finally {ws.close();}
