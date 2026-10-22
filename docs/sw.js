const VERSION = 'bitp-c7444845';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png',
  'img/banner.jpg', 'img/ner.png', 'img/tox.png', 'img/pont.png', 'img/misa.png', 'img/ss.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
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
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
