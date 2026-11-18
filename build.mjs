import fs from 'node:fs/promises';
const files={'/':'index.html','/style.css':'style.css','/app.js':'app.js','/grupo.js':'grupo.js','/icon.png':'icon.png','/app.webmanifest':'app.webmanifest'};
const assets={};
assets['/bloqueador.zip']=(await fs.readFile('docs/bloqueador.zip')).toString('base64');
for(const [route,name] of Object.entries(files)){
  const bytes=await fs.readFile('docs/'+name);
  assets[route]=name.endsWith('.png')?bytes.toString('base64'):bytes.toString('utf8');
}
await fs.mkdir('dist/server',{recursive:true});
assets['/horario.js']=await fs.readFile('docs/horario.js','utf8');
await fs.writeFile('dist/server/index.js','const assets='+JSON.stringify(assets)+';\n'+await fs.readFile('calendar-server.js','utf8')+'\n'+await fs.readFile('worker.js','utf8'));
