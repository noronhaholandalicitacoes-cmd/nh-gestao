const CACHE = 'nh-viabilidade-v4';
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(['./viabilidade.html']); }).catch(function(){}));
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

/* Notificações do Viabilidade (29/10/2026): o servidor manda
   {titulo, corpo, tag, url}; tocar abre (ou traz para a frente) o app. */
self.addEventListener('push', function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(x){ d = {corpo: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'NH Viabilidade', {
    body: d.corpo || '', tag: d.tag || undefined, icon: 'icones/viabilidade-192.png',
    data: {url: d.url || 'viabilidade.html'}
  }));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || 'viabilidade.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(cs){
    for(var i = 0; i < cs.length; i++){ if(cs[i].url.indexOf('viabilidade') >= 0 && 'focus' in cs[i]) return cs[i].focus(); }
    return self.clients.openWindow(url);
  }));
});
