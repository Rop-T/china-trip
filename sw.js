// Offline cache for the Nha Trang trip app
const CACHE='trip-677c7e7674';
const FILES=["./", "index.html", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "ph/p_airport.jpg", "ph/p_beach.jpg", "ph/p_church.jpg", "ph/p_city.jpg", "ph/p_coffee.jpg", "ph/p_market.jpg", "ph/p_nem.jpg", "ph/p_pho.jpg", "ph/p_seafood.jpg", "ph/p_tower.jpg", "ph/p_vinw.jpg", "fonts/anuphan-latin-400-normal.woff2", "fonts/anuphan-latin-500-normal.woff2", "fonts/anuphan-latin-600-normal.woff2", "fonts/anuphan-latin-700-normal.woff2", "fonts/anuphan-thai-400-normal.woff2", "fonts/anuphan-thai-500-normal.woff2", "fonts/anuphan-thai-600-normal.woff2", "fonts/anuphan-thai-700-normal.woff2", "fonts/anuphan-vietnamese-400-normal.woff2", "fonts/anuphan-vietnamese-500-normal.woff2", "fonts/anuphan-vietnamese-600-normal.woff2", "fonts/anuphan-vietnamese-700-normal.woff2", "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-700-normal.woff2", "fonts/barlow-condensed-vietnamese-600-normal.woff2", "fonts/barlow-condensed-vietnamese-700-normal.woff2", "vendor/leaflet.css", "vendor/leaflet.js"];
const IMG='trip-img-1';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const old=(await caches.keys()).filter(k=>k!==CACHE&&k!==IMG);await Promise.all(old.map(k=>caches.delete(k)));await self.clients.claim();if(old.length){const cs=await self.clients.matchAll({type:'window'});cs.forEach(c=>{try{c.navigate(c.url)}catch(err){}})}})())});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(/(^|\.)wikimedia\.org$/.test(url.hostname)){ // place photos: keep a copy for offline use
    e.respondWith(caches.open(IMG).then(c=>c.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok||r.type==='opaque')c.put(req,r.clone());return r}))));return}
  if(url.origin!==location.origin)return;
  if(req.mode==='navigate'){ // network first so updates show up, cached copy when offline
    e.respondWith(fetch(req,{cache:'no-store'}).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('index.html',cp));return r}).catch(()=>caches.match('index.html')));return}
  e.respondWith(caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp))}return r})));
});
