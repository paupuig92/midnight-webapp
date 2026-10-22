const VERSION = 'bitp-3434a1f1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'img/banner.jpg', 'img/ner.png', 'img/tox.png', 'img/pont.png', 'img/misa.png', 'img/ss.png'];

// cache: 'reload' salta la cache HTTP de GitHub Pages (10 min): així la versió nova no es guarda amb fitxers vells
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

// Notificacions del servidor (també amb el mòbil bloquejat). El push arriba buit: es demana a PUSH_URL/now què mostrar
const PUSH_URL = "https://midnight-push.midnightgroup.workers.dev";
async function subId() {
  const s = await self.registration.pushManager.getSubscription();
  if (!s) return '';
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.endpoint)));
  return [...h.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
}
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let items = [];
    try {
      const r = await fetch(PUSH_URL + '/now?id=' + await subId(), { cache: 'no-store' });
      items = ((await r.json()).items || []).slice(0, 4);
    } catch (err) {}
    // L'iPhone obliga a mostrar sempre alguna cosa quan arriba un push
    if (!items.length) items = [{ title: 'Midnight', body: 'Hay novedades en el horario.', tag: 'midnight' }];
    await Promise.all(items.map(i => self.registration.showNotification(i.title, { body: i.body, tag: i.tag, icon: 'icon-192.png', badge: 'icon-192.png' })));
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
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
  // «Actualizar la app» demana ./?t=…: ha d'anar a la xarxa de debò (si no, mai detectaria que no hi ha connexió)
  if (url.searchParams.has('t')) return;
  // La pàgina: primer la xarxa (màxim 3 s) perquè surti la versió nova; sense cobertura, la còpia guardada
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match('index.html');
      const net = fetch(e.request, { cache: 'no-cache' }).then(res => {
        // Un portal wifi o una pàgina d'error no s'han de guardar com si fossin l'app
        if (res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) cache.put('index.html', res.clone());
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
