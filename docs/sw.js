const VERSION = 'bitp-0dfadec4';
const FILES = ['./', 'ca', 'manifest.webmanifest', 'icon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  "img/Blogh.woff2", "img/Bricolage-Bold.woff2", "img/Bricolage-ExtraBold.woff2", "img/Bricolage-Regular.woff2", "img/Bricolage-SemiBold.woff2", "img/Bricolage-SemiCondensed-SemiBold.woff2", "img/banner.jpg", "img/bn-cabra.webp", "img/bn-titol.webp", "img/deco-before.png", "img/deco-done.png", "img/deco-empty.png", "img/deco-end.png", "img/deco-foto.png", "img/deco-got.png", "img/deco-h-ahora.png", "img/deco-h-horario.png", "img/deco-h-siguiente.png", "img/deco-m-crack.png", "img/deco-m-enamorat.png", "img/deco-m-enfadat.png", "img/deco-m-festa.png", "img/deco-m-flipat.png", "img/deco-m-guai.png", "img/deco-m-plora.png", "img/deco-m-xocat.png", "img/deco-mecanic.png", "img/deco-sheet.png", "img/deco-strip.png", "img/festa.png", "img/logo-31fam.png", "img/logo-amics.png", "img/logo-aplec.png", "img/logo-catarres.png", "img/logo-figa.png", "img/logo-juls.png", "img/logo-lax.png", "img/logo-ludwig.png", "img/logo-pets.png", "img/logo-prats.png", "img/logo-tyets.png", "img/logo-vennus.png", "img/mapa.jpg", "img/photo.png", "img/principal.png", "img/ride-burro.png", "img/ride-calcot.png", "img/ride-tunel.png"];

// cache: 'reload' salta la cache HTTP de GitHub Pages (10 min): així la versió nova no es guarda amb fitxers vells
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

// Notificacions del servidor (també amb el mòbil bloquejat). El push arriba buit: es demana a PUSH_URL/now què mostrar.
// 'midnight-meta' (no s'esborra en actualitzar l'app): què s'ha mostrat ja (per no repetir) i si s'ha demanat una prova.
const PUSH_URL = "https://midnight-push.midnightgroup.workers.dev";
const PUSH_KEY = "BCFdLY7tYu_Ok-tS6wa2SMcfLgMAqNiA_rodGIhm8AOJSiIU7AJ5Q02TWbs-Sc6ZTD5ITQ3nHhNFUvbyMxKuGTU";
const META = 'midnight-meta';
async function metaGet(k, d) { try { const r = await (await caches.open(META)).match(k); return r ? await r.json() : d; } catch (e) { return d; } }
async function metaPut(k, v) { try { await (await caches.open(META)).put(k, new Response(JSON.stringify(v))); } catch (e) {} }
async function subId() {
  const s = await self.registration.pushManager.getSubscription();
  if (!s) return '';
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.endpoint)));
  return [...h.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
}
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let items = [], got = false;
    // Prova demanada des de Configuración (la pàgina hi deixa la marca abans de demanar-la)
    const test = await metaGet('test', 0);
    if (test && Date.now() - test < 3 * 60000) {
      items.push({ title: 'Midnight · prova', body: 'Les notificacions arriben també amb el mòbil bloquejat ✓', tag: 'prueba-' + test });
      await metaPut('test', 0);
    }
    try {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 8000);
      const r = await fetch(PUSH_URL + '/now?id=' + await subId(), { cache: 'no-store', signal: ac.signal });
      clearTimeout(tm);
      if (r.ok) { items.push(...((await r.json()).items || []).slice(0, 6)); got = true; }
    } catch (err) {}
    // No repetir el que ja s'ha mostrat (el servidor torna tot el dels últims 15 min)
    const shown = await metaGet('shown', []);
    let fresh = items.filter(i => !shown.includes(i.tag));
    await metaPut('shown', [...shown, ...fresh.map(i => i.tag)].slice(-200));
    // L'iPhone obliga a mostrar sempre alguna cosa quan arriba un push
    if (!fresh.length) fresh = [items.length ? items[items.length - 1]
      : { title: 'Midnight', body: got ? 'Obre l’app per veure el teu horari.' : 'Sense connexió: obre l’app per veure el teu horari.', tag: 'midnight' }];
    await Promise.all(fresh.slice(0, 4).map(i => self.registration.showNotification(i.title, { body: i.body, tag: i.tag, icon: 'icon-192.png', badge: 'icon-192.png' })));
  })());
});
// Si el navegador renova la subscripció, es torna a registrar (el servidor conserva els artistes del registre vell)
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    try {
      const pad = '='.repeat((4 - PUSH_KEY.length % 4) % 4), raw = atob((PUSH_KEY + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const sub = e.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
      await fetch(PUSH_URL + '/sub', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, old: e.oldSubscription ? e.oldSubscription.endpoint : '' }) });
    } catch (err) {}
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== META).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primer la còpia guardada (va sense cobertura) i, si hi ha xarxa, s'actualitza per a la propera vegada
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {
    if (!url.hostname.endsWith('fonts.googleapis.com') && !url.hostname.endsWith('fonts.gstatic.com')) return;  // API de GitHub: directe
  }
  // Canvis de l'organització i tasques de l'equip: sempre primer la xarxa; sense cobertura, l'última còpia
  const live = ['changes.json', 'tasks.json'].find(f => url.pathname.endsWith('/' + f));
  if (live) {
    e.respondWith(caches.open(VERSION).then(cache => fetch(e.request).then(res => {
      if (res.ok) cache.put(live, res.clone());
      return res;
    }).catch(() => cache.match(live).then(r => r || new Response('', { status: 504 })))));
    return;
  }
  // «Actualizar la app» demana ./?t=…: ha d'anar a la xarxa de debò (si no, mai detectaria que no hi ha connexió)
  if (url.searchParams.has('t')) return;
  // La pàgina: primer la xarxa (màxim 1,5 s) perquè surti la versió nova; sense cobertura o si falla, la còpia guardada
  if (e.request.mode === 'navigate') {
    // Cada idioma, la seva còpia. Adreces sense «.html» (Cloudflare Pages redirigeix ca.html → ca; GitHub serveix totes dues)
    const page = /[/]ca([.]html)?$/.test(url.pathname) ? 'ca' : './';
    e.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match(page);
      const net = fetch(e.request, { cache: 'no-cache' }).then(res => {
        // Un portal wifi o una pàgina d'error no s'han de guardar com si fossin l'app
        if (res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) cache.put(page, res.clone());
        else if (hit) return hit;   // un error del servidor (404, 5xx) no ha de guanyar a la còpia guardada
        return res;
      });
      const slow = new Promise(r => setTimeout(() => r(hit), 1500));
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
