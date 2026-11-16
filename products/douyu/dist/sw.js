/* Only application assets are cached. User photos/projects never enter this cache. */
const CACHE='douyu-mobile-be1219097a88ff55';
const ASSETS=['./','./index.html','./style.css','./core.js','./palettes.js','./touch.js','./app.js','./mobile.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
const urls=new Set(ASSETS.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('douyu-mobile-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);u.search='';u.hash='';
  if(!urls.has(u.href))return;
  e.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.href))||fetch(e.request)));
});
