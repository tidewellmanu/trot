const CACHE="trotromall-v4";
const CORE=["./","./index.html","./search.html","./listing.html","./assets/css/style.css","./assets/js/app.js?v=20261008-2","./assets/js/data.js","./assets/js/config.js","./assets/js/supabase-client.js","./assets/images/logo.png","./assets/images/favicon.png","./assets/images/apple-touch-icon.png","./site.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.origin!==location.origin)return;if(e.request.method!=="GET")return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html"))))});
