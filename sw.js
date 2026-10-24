const CACHE='greenbandana-v1.3.3';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./style.css','./style.css?v=1.3.3','./app.js','./font-editor.js','./font-editor.js?v=1.3.3','./manifest.webmanifest','./icon.svg','./firmware.json'])));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('greenbandana-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===location.origin)e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});

