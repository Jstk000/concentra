self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const scope=self.registration.scope;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const page=windows.find(client=>client.url.split(/[?#]/,1)[0]===scope || client.url.split(/[?#]/,1)[0]===scope+'index.html');
    if(page)await page.focus();
    else await self.clients.openWindow(scope);
  })());
});
