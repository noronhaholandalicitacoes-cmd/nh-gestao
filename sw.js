const CACHE = 'nh-gestao-v1';
const ASSETS = [
  '/nh-gestao/index.html',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap',
  'https://cdn.jsdelivr.net/npm/firebase@10.12.0/firebase-app-compat.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.12.0/firebase-firestore-compat.js',
  'https://cdn.jsdelivr.net/npm/firebase@10.12.0/firebase-auth-compat.js'
];

// Instalar — cachear assets principais
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).catch(function(){})
  );
  self.skipWaiting();
});

// Ativar — limpar caches antigos
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  // Firebase — sempre network
  if(e.request.url.includes('firestore') || e.request.url.includes('firebase')) return;
  e.respondWith(
    fetch(e.request).then(function(res){
      var clone = res.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
      return res;
    }).catch(function(){
      return caches.match(e.request);
    })
  );
});
