const VERSION = 'bitp-99a74835';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'img/banner.jpg', 'img/ner.png', 'img/tox.png', 'img/pont.png', 'img/misa.png', 'img/ss.png'];

// cache: 'reload' salta la cache HTTP de GitHub Pages (10 min): així la versió nova no es guarda amb fitxers vells
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primer la còpia guardada (va sense cobertura) i, si hi ha xarxa, s'actualitza per a la propera vegada
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {
    if (!url.hostname.endsWith('fonts.googleapis.com') && !url.hostname.endsWith('fonts.gstatic.com')) return;  // API de GitHub: directe
  }
  // Canvis de l'organització: sempre primer la xarxa; sense cobertura, l'última còpia
  if (url.pathname.endsWith('/changes.json')) {
    e.respondWith(caches.open(VERSION).then(cache => fetch(e.request).then(res => {
      if (res.ok) cache.put('changes.json', res.clone());
      return res;
    }).catch(() => cache.match('changes.json').then(r => r || new Response('', { status: 504 })))));
    return;
  }
  // La pàgina: primer la xarxa (màxim 3 s) perquè surti la versió nova; sense cobertura, la còpia guardada
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match('index.html');
      const net = fetch(e.request, { cache: 'no-cache' }).then(res => {
        if (res.ok) cache.put('index.html', res.clone());
        return res;
      });
      const slow = new Promise(r => setTimeout(() => r(hit), 3000));
      try { return (await Promise.race([net, hit ? slow : net])) || await net; }
      catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  // La resta (imatges, fonts…): primer la còpia guardada i s'actualitza en segon pla
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
