const key='concentra.estudio.v1';
let seq=0;
async function sync(){
  const n=++seq;
  try{
    const s=JSON.parse(localStorage.getItem(key)||'{}');
    const ack=await chrome.runtime.sendMessage({end:s.timer?.end||0,sites:s.blockSites??['instagram.com','tiktok.com','x.com']});
    if(n===seq)document.documentElement.dataset.concentraBloqueo=ack?.state||'error';
  }catch{document.documentElement.dataset.concentraBloqueo='error';}
}
document.addEventListener('concentra-sync',sync);
window.addEventListener('storage',sync);
window.addEventListener('pageshow',sync);
window.addEventListener('focus',sync);
sync();
