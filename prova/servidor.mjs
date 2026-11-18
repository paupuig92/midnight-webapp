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
  outboundService: req => new Response('', { status: req.url.includes('real') ? 201 : 400 }) });
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
console.log(`\n${n - fail}/${n} proves bé`);
await mf.dispose(); process.exit(fail ? 1 : 0);
