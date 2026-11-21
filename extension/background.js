const allowed=["instagram.com","tiktok.com","youtube.com","reddit.com","twitch.tv","x.com"];
const origin='https://jstk000.github.io';
let last='';
let queue=Promise.resolve();
function enqueue(fn){const run=queue.then(fn);queue=run.catch(()=>{});return run;}
async function apply(end,sites){
  const active=Number.isFinite(end)&&end>Date.now()&&end<=Date.now()+181*60000;
  const valid=d=>typeof d==='string'&&d.length<=80&&d!=='jstk000.github.io'&&!('jstk000.github.io').endsWith('.'+d)&&/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d);
  const chosen=active?[...new Set(sites.filter(valid))].slice(0,64):[];
  const state=chosen.length?'activo':'listo';
  const config={end:chosen.length?end:0,sites:chosen};
  const signature=JSON.stringify(config);
  if(signature===last)return {state,end:config.end};
  last='';
  // Schedule cleanup before applying restrictions so it survives worker suspension.
  await chrome.storage.local.set({config});
  if(config.end)await chrome.alarms.create('fin',{when:config.end});
  const old=await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:old.map(r=>r.id),addRules:chosen.map((d,i)=>({id:i+1,priority:1,action:{type:'block'},condition:{requestDomains:[d],resourceTypes:['main_frame']}}))});
  await chrome.contentSettings.notifications.clear({});
  for(const d of chosen.filter(d=>allowed.includes(d)))await chrome.contentSettings.notifications.set({primaryPattern:'https://*.'+d+'/*',setting:'block'});
  if(!config.end)await chrome.alarms.clear('fin');
  last=signature;return {state,end:config.end};
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.origin!==origin||!sender.url?.startsWith(origin+'/concentra/')||sender.frameId!==0||!Array.isArray(m.sites))return;
  enqueue(async()=>{
    try{return await apply(m.end,m.sites);}
    catch{last='';await apply(0,[]);return {state:'error'};}
  }).then(reply,()=>reply({state:'error'}));return true;
});
function restore(){return enqueue(async()=>{const {config}=await chrome.storage.local.get('config');return apply(config?.end||0,config?.sites||[]);});}
chrome.runtime.onStartup.addListener(restore);
chrome.runtime.onInstalled.addListener(restore);
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='fin')restore();});
