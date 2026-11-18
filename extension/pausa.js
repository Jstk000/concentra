let screen=null,timeout=0;
function render(c){
  clearTimeout(timeout);
  const active=c?.end>Date.now()&&c.sites.some(d=>location.hostname===d||location.hostname.endsWith('.'+d));
  if(!active){screen?.remove();screen=null;return;}
  timeout=setTimeout(()=>render(null),Math.max(1,c.end-Date.now()));
  if(screen?.isConnected)return;
  screen=document.createElement('dialog');screen.style.cssText='border:0;border-radius:16px;padding:32px;background:#173e37;color:#fff;font:18px/1.5 system-ui;max-width:min(28em,85vw)';
  const title=document.createElement('strong');title.textContent='Tienes un bloque de estudio en curso.';
  const p=document.createElement('p');p.textContent='Este sitio volverá a estar disponible cuando pauses o termines tu sesión.';
  const link=document.createElement('a');link.href='https://jstk000.github.io/concentra/#hoy';link.target='_blank';link.rel='noopener';link.style.color='#dbeaa3';link.textContent='Volver a Concentra';
  screen.append(title,p,link);screen.addEventListener('cancel',e=>e.preventDefault());document.body.append(screen);screen.showModal();
  document.querySelectorAll('video,audio').forEach(el=>el.pause());
}
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.config)render(changes.config.newValue);});
chrome.storage.local.get('config').then(({config})=>render(config));
