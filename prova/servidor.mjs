// Prova del servidor d'avisos (push/worker.js) en un Cloudflare simulat (18-11-2026). No toca el servidor de veritat.
// Comprova el login (passi del mòbil, límit global), els mòbils falsos i les fotos.
// Cal miniflare:  npm i --no-save miniflare@3 && node prova/servidor.mjs
import { Miniflare } from 'miniflare';
import fs from 'fs';
import { webcrypto as c } from 'crypto';
const cartel = JSON.parse(fs.readFileSync(new URL('../docs/cartel.json', import.meta.url),'utf8'));
cartel.open = ['2026-01-01','2027-12-31'];
const code = fs.readFileSync(new URL('../push/worker.js', import.meta.url),'utf8').replace('/*CARTEL*/null/*CARTEL*/', JSON.stringify(cartel));
const kp = await c.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'}, true, ['sign']);
const jwk = await c.subtle.exportKey('jwk', kp.privateKey);
const mf = new Miniflare({ modules: true, script: code, compatibilityDate: '2024-09-23',
  durableObjects: { STORE: { className: 'Store', useSQLite: true } },
  bindings: { SEND_KEY: 'k'.repeat(48), ADMIN_PW: 'admin-secret-123', APP_CODE: '424242', GH_TOKEN: 'x', VAPID_JWK: JSON.stringify(jwk), VAPID_PUBLIC: 'pub' },
  outboundService: req => github(req) || new Response('', { status: req.url.includes('real') ? 201 : 400 }) });
// GitHub de mentida: docs/changes.json i docs/tasks.json (amb ETag) i un commit que sempre va bé
const GH = { 'changes.json': null, 'tasks.json': null, reads: 0, down: false, web: null, webReads: 0 };
function github(req) {
  const u = new URL(req.url);
  if (u.hostname === 'visualcrew.midnightgroup.app') { GH.webReads++; return GH.web ? new Response(GH.web, { headers: { 'content-type': 'application/json' } }) : new Response('', { status: 503 }); }
  if (u.hostname !== 'api.github.com') return null;
  if (GH.down) return new Response('', { status: 500 });
  const m = u.pathname.match(/contents\/docs\/(.+)$/);
  if (m && req.method === 'GET') {
    GH.reads++;
    const t = GH[m[1]];
    if (t == null) return new Response('{}', { status: 404 });
    const etag = '"' + t.length + '-' + t.slice(-30).replace(/\W/g, '') + '"';
    if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304 });
    return new Response(t, { headers: { etag, 'content-type': 'application/json' } });
  }
  return Response.json({ object: { sha: 'a' }, tree: { sha: 'b' }, sha: 'c' });
}
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FALLA:', m); } else console.log('ok   ', m); };
const call = (path, body, ip = '1.1.1.1', method) => mf.dispatchFetch('http://x' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const J = async r => ({ s: r.status, ...(await r.json().catch(() => ({}))) });

// 1. Login
let r = await J(await call('/admin/login', { pw: 'admin-secret-123' }, '9.9.9.1'));
ok(r.s === 200 && r.session && /^k\.[0-9a-f]{40}$/.test(r.k), 'admin entra i rep passi'); const pass = r.k, sess = r.session;
r = await J(await call('/gate/login', { pw: '424242' }, '9.9.9.2')); ok(r.s === 200 && r.role === 'team' && r.k === pass, 'codi d\'equip entra (sessió d\'equip) i rep passi');
r = await J(await call('/admin/commit', { s: r.session, files: [] }, '9.9.9.2')); ok(r.s === 401, 'la sessió d\'equip NO serveix per editar');
for (let i = 0; i < 150; i++) { r = await J(await call('/admin/login', { pw: 'admin-secret-123' }, '8.8.' + (i >> 3) + '.' + (i & 7))); if (r.s !== 200) break; }
ok(r.s === 200, '150 entrades bones seguides no gasten el límit global');
let c401 = 0, c429 = 0;
for (let i = 0; i < 100; i++) { r = await J(await call(i % 2 ? '/admin/login' : '/gate/login', { pw: 'dolenta' + i }, '7.7.' + Math.floor(i / 9) + '.1')); r.s === 401 ? c401++ : c429++; }
ok(c401 === 100, `100 intents fallats des de 12 adreces: tots 401 (${c401}/${c429})`);
r = await J(await call('/admin/login', { pw: 'dolenta' }, '6.6.6.1')); ok(r.s === 429, 'límit global gastat: un desconegut rep 429');
r = await J(await call('/admin/login', { pw: 'admin-secret-123' }, '6.6.6.2')); ok(r.s === 429, 'un mòbil SENSE passi queda fora (com abans)');
r = await J(await call('/admin/login', { pw: 'admin-secret-123', k: pass }, '6.6.6.3')); ok(r.s === 200, 'un mòbil AMB passi entra igualment (admin)');
r = await J(await call('/gate/login', { pw: '424242', k: pass }, '6.6.6.4')); ok(r.s === 200, 'un mòbil AMB passi entra igualment (codi d\'equip)');
r = await J(await call('/admin/login', { pw: 'dolenta', k: pass }, '6.6.6.5')); ok(r.s === 401, 'amb passi i contrasenya dolenta: 401');
r = await J(await call('/admin/login', { pw: 'admin-secret-123', k: 'k.' + '0'.repeat(40) }, '6.6.6.6')); ok(r.s === 429, 'un passi inventat no serveix');
for (let i = 0; i < 10; i++) r = await J(await call('/admin/login', { pw: 'x', k: pass }, '5.5.5.5'));
r = await J(await call('/admin/login', { pw: 'admin-secret-123', k: pass }, '5.5.5.5')); ok(r.s === 429, 'amb passi, el límit per adreça (10 intents) continua');
r = await J(await call('/admin/read', { s: sess, path: 'docs/secret.txt' }, '9.9.9.1')); ok(r.s === 400, 'l\'editor només pot llegir els 2 fitxers');

// 2. Mòbils falsos
const ep = (k, i) => `https://fcm.googleapis.com/fcm/send/${k}-${i}`;
r = await J(await call('/sub', { endpoint: ep('real', 0), favs: [], before: 10 }, '4.4.4.4')); ok(r.s === 200, 'mòbil de veritat registrat');
r = await J(await call('/test', { endpoint: ep('real', 0) }, '4.4.4.4')); ok(r.ok === true, 'notificació de prova acceptada → queda verificat');
let bad = 0;
for (let i = 0; i < 700; i++) { r = await J(await call('/sub', { endpoint: ep('fals', i), favs: [], before: 10 }, '3.' + (i >> 4) + '.1.1')); if (r.s !== 200) bad++; }
ok(bad === 0, '700 mòbils falsos: el servidor no es bloqueja');
r = await J(await call('/')); ok(r.mobiles === 600, `la taula no passa de 600 (${r.mobiles})`);
r = await J(await call('/test', { endpoint: ep('real', 0) }, '4.4.4.5')); ok(r.s === 200 && r.ok, 'el mòbil verificat continua registrat');
r = await J(await call('/sub', { endpoint: ep('real', 1), favs: [], before: 10 }, '4.4.4.6')); ok(r.s === 200 && r.ok, 'amb la taula plena, un mòbil nou de veritat entra');
r = await J(await call('/sub', { endpoint: ep('real', 2), old: ep('real', 0) }, '4.4.4.7')); ok(r.s === 200, 'renovació del mòbil verificat');
for (let i = 700; i < 1400; i++) await call('/sub', { endpoint: ep('fals', i), favs: [], before: 10 }, '2.' + (i >> 4) + '.1.1');
r = await J(await call('/test', { endpoint: ep('real', 2) }, '4.4.4.8')); ok(r.s === 200 && r.ok, 'després de 700 falsos més, el renovat (verificat) segueix');

// 3. Foto
const img = 'data:image/jpeg;base64,/9j/' + 'A'.repeat(400);
r = await J(await call('/inc', { txt: 'prova', who: 'Pau', img }, '4.4.4.9')); ok(r.s === 200 && r.n === 1, 'incidència amb foto');
let f = await call('/incimg?n=1', null, '4.4.4.9'); ok(f.status === 200 && f.headers.get('x-content-type-options') === 'nosniff' && /private/.test(f.headers.get('cache-control')) && f.headers.get('content-type') === 'image/jpeg', 'foto: image/jpeg + nosniff + private');
r = await J(await call('/inc', { txt: 'x', img: 'data:text/html;base64,PHNjcmlwdD4=' }, '4.4.4.9')); f = await call('/incimg?n=2', null, '4.4.4.9'); ok(f.status === 404, 'un fitxer que no és JPEG no es guarda');
r = await J(await call('/live?p=inc,mc,done,mk', null, '4.4.4.9')); ok(r.s === 200 && r.inc.length === 2, '/live respon');

// 4. Horari i tasques servits pel servidor (GET /doc/…) i empremta a /live
const T = async r => ({ s: r.status, t: await r.text() });
const cron = async () => (await mf.dispatchFetch('http://x/cdn-cgi/mf/scheduled?time=' + Math.floor(Date.now() / 300000) * 300000)).text();   // abans del festival el cron només treballa cada 5 min
r = await J(await call('/doc/secret.json', null, '4.5.0.1')); ok(r.s === 404 && r.error === 'not found', '/doc només serveix els 2 fitxers');
r = await J(await call('/doc/changes.json', null, '4.5.0.1')); ok(r.s === 404 && r.error === 'nodoc', 'sense fitxer a GitHub: 404 nodoc');
const ch = u => JSON.stringify({ v: 1, fest: cartel.fest, updated: u, notice: 'hola ' + u, sets: null }, null, 1);
GH['changes.json'] = ch('2026-12-05T10:00:00.000Z');
r = await T(await call('/doc/changes.json', null, '4.5.0.1')); ok(r.s === 404, 'dins dels 90 s no es torna a mirar GitHub');
await cron();   // el cron de cada minut
r = await T(await call('/doc/changes.json', null, '4.5.0.1')); ok(r.s === 200 && JSON.parse(r.t).updated === '2026-12-05T10:00:00.000Z', 'després del cron, /doc torna l\'horari de GitHub');
let live = await J(await call('/live?p=inc', null, '4.5.0.2')); const h1 = live.d && live.d.c; ok(/^[0-9a-f]{12}$/.test(h1 || ''), '/live porta l\'empremta de l\'horari');
live = await J(await call('/live?p=inc&v=' + live.v, null, '4.5.0.2')); ok(live.d && live.d.c === h1 && !live.inc, '/live sense canvis: resposta mínima amb la mateixa empremta');
const reads = GH.reads;
for (let i = 0; i < 20; i++) await call('/doc/changes.json', null, '4.5.1.' + i);
ok(GH.reads === reads, '20 mòbils demanant l\'horari: cap lectura més a GitHub');
// L'organització publica: els mòbils ho veuen a l'instant, encara que GitHub torni el fitxer d'abans
const nou = ch('2026-12-05T11:00:00.000Z');
r = await J(await call('/admin/commit', { s: sess, files: [{ path: 'docs/changes.json', content: nou }], message: 'prova' }, '9.9.9.1')); ok(r.s === 200 && r.ok, 'l\'editor publica');
r = await T(await call('/doc/changes.json', null, '4.5.0.3')); ok(JSON.parse(r.t).updated === '2026-12-05T11:00:00.000Z', '/doc ja torna l\'horari nou');
live = await J(await call('/live?p=inc', null, '4.5.0.2')); ok(live.d.c && live.d.c !== h1, '/live canvia d\'empremta');
await cron();   // GitHub encara diu el d'abans
r = await T(await call('/doc/changes.json', null, '4.5.0.3')); ok(JSON.parse(r.t).updated === '2026-12-05T11:00:00.000Z', 'GitHub endarrerit no fa tornar enrere l\'horari');
GH.down = true;
await cron();
r = await T(await call('/doc/changes.json', null, '4.5.0.4')); ok(r.s === 200 && JSON.parse(r.t).updated === '2026-12-05T11:00:00.000Z', 'amb GitHub caigut, /doc torna l\'última còpia bona');
// (revisió de seguretat 18-11) GitHub caigut i la web amb una còpia MÉS VELLA: no ha de tornar enrere; amb una de més nova, sí
// (amb tasks.json: l'horari encara està dins dels 2 min de «acabat de publicar»)
const tk = u => JSON.stringify({ v: 1, fest: cartel.fest, updated: u, people: [], list: [] });
GH.down = false; GH['tasks.json'] = tk('2026-12-05T11:00:00.000Z'); await cron(); GH.down = true;
GH.web = tk('2026-12-05T10:30:00.000Z'); await cron();
r = await T(await call('/doc/tasks.json', null, '4.5.0.4')); ok(JSON.parse(r.t).updated === '2026-12-05T11:00:00.000Z', 'GitHub caigut + web més vella: no es torna enrere');
GH.web = tk('2026-12-05T11:30:00.000Z'); await cron();
r = await T(await call('/doc/tasks.json', null, '4.5.0.4')); ok(JSON.parse(r.t).updated === '2026-12-05T11:30:00.000Z', 'GitHub caigut + web més nova: s\'aplica');
GH.web = null;
GH.down = false;
r = await J(await call('/admin/commit', { s: sess, files: [{ path: 'docs/changes.json', content: JSON.stringify({ x: 'a'.repeat(450000) }) }] }, '9.9.9.1')); ok(r.s === 413, 'un horari massa gran no es publica');
r = await call('/doc/changes.json', null, '4.5.0.4'); ok(r.headers.get('cache-control') === 'no-store' && /json/.test(r.headers.get('content-type')), '/doc: JSON i sense memòria cau');
live = await J(await call('/live?p=inc', null, '4.5.0.2')); ok(r.headers.get('x-doc') === live.d.c && live.d.t, '/doc porta la mateixa empremta que /live (x-doc)');
r = await mf.dispatchFetch('http://x/doc/tasks.json', { headers: { origin: 'https://visualcrew.midnightgroup.app', 'cf-connecting-ip': '4.5.0.5' } }); ok(r.headers.get('access-control-allow-origin') === 'https://visualcrew.midnightgroup.app', '/doc accepta la web de l\'app (CORS)'); await r.text();
let s429 = 0; for (let i = 0; i < 320; i++) { const x = await call('/doc/changes.json', null, '4.5.9.9'); if (x.status === 429) s429++; await x.text(); }
ok(s429 >= 15 && s429 <= 25, `/doc té límit per adreça (${s429} de 320 frenades)`);
console.log(`\n${n - fail}/${n} proves bé`);
await mf.dispose(); process.exit(fail ? 1 : 0);
