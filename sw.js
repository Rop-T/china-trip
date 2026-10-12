// Offline cache for the Chengdu–Chongqing trip app
const CACHE='trip-284197e2e1';
const FILES=["./", "index.html", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "ph/anshun.jpg", "ph/bayi.jpg", "ph/chunxi.jpg", "ph/cq1949.jpg", "ph/daci.jpg", "ph/hongya.jpg", "ph/hym.jpg", "ph/ifs.jpg", "ph/jfb.jpg", "ph/liziba.jpg", "ph/luohan.jpg", "ph/panda.jpg", "ph/pandaA.jpg", "ph/taikoo.jpg", "ph/taode.jpg", "ph/train.jpg", "ph/tssq.jpg", "ph/xns.jpg", "fonts/anuphan-latin-500-normal.woff2", "fonts/anuphan-latin-600-normal.woff2", "fonts/anuphan-latin-700-normal.woff2", "fonts/anuphan-thai-500-normal.woff2", "fonts/anuphan-thai-600-normal.woff2", "fonts/anuphan-thai-700-normal.woff2", "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-700-normal.woff2", "fonts/ibm-plex-sans-thai-latin-400-normal.woff2", "fonts/ibm-plex-sans-thai-latin-500-normal.woff2", "fonts/ibm-plex-sans-thai-latin-600-normal.woff2", "fonts/ibm-plex-sans-thai-thai-400-normal.woff2", "fonts/ibm-plex-sans-thai-thai-500-normal.woff2", "fonts/ibm-plex-sans-thai-thai-600-normal.woff2", "fonts/zh-subset-700.woff2"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(req.mode==='navigate'){ // network first so updates show up, cached copy when offline
    e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('index.html',cp));return r}).catch(()=>caches.match('index.html')));return}
  e.respondWith(caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp))}return r})));
});
