const CACHE = 'nh-viabilidade-v1';
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(['/nh-gestao/viabilidade.html']); }).catch(function(){}));
  self.skipWaiting();
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){ return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);})); }));
  self.clients.claim();
});
self.addEventListener('fetch', function(e){
  if(e.request.method!=='GET'||e.request.url.includes('firebase')) return;
  e.respondWith(fetch(e.request).then(function(r){ caches.open(CACHE).then(function(c){c.put(e.request,r.clone());}); return r; }).catch(function(){ return caches.match(e.request); }));
});
