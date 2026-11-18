// Prova de punta a punta (18-11-2026): l'app (docs/, a Chromium com un iPhone) parlant amb el servidor d'avisos
// (push/worker.js en un Cloudflare simulat, amb un GitHub de mentida). No toca res de veritat.
// Comprova que l'horari i les tasques arriben pel servidor (GET /doc/…), que no es tornen a baixar si no canvien,
// que un canvi de l'organització arriba en un minut, i que si el servidor cau es fa servir la còpia de la web
// (però mai una de més vella).
//   python3 -I build_web.py && npm i --no-save miniflare@3 playwright && node prova/horari.mjs [--captures=dir]
import { Miniflare } from 'miniflare';
import { chromium, devices } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { webcrypto as wc } from 'crypto';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(DIR, '..', 'docs');
const CAPS = (process.argv.find(a => a.startsWith('--captures=')) || '').split('=')[1];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}`, PUSH = 'http://push.test';

// Servidor d'avisos simulat
const cartel = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartel.json'), 'utf8'));
cartel.open = ['2026-01-01', '2027-12-31'];
const code = fs.readFileSync(path.resolve(DIR, '..', 'push', 'worker.js'), 'utf8')
  .replace('/*CARTEL*/null/*CARTEL*/', JSON.stringify(cartel))
  .replace("const ORIGINS = [", `const ORIGINS = ['${base}', `);
const ch = (u, notice) => JSON.stringify({ v: 1, fest: cartel.fest, updated: u, by: 'video', notice, noticeBy: 'video', noticeTeam: '', sets: null }, null, 1);
const tk = u => JSON.stringify({ v: 1, fest: cartel.fest, updated: u, by: 'video', team: 'Pau: vídeo', tasks: '', people: [{ k: 'pau', n: 'Pau', r: ['vídeo'], e: 'video' }], list: [] });
const GH = { 'changes.json': ch('2026-12-05T09:00:00.000Z', 'AVISO UNO'), 'tasks.json': tk('2026-12-05T09:00:00.000Z') };
const kp = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const mf = new Miniflare({ modules: true, script: code, compatibilityDate: '2024-09-23',
  durableObjects: { STORE: { className: 'Store', useSQLite: true } },
  bindings: { SEND_KEY: 'k'.repeat(48), ADMIN_PW: 'admin-secret-123', GH_TOKEN: 'x', VAPID_JWK: JSON.stringify(await wc.subtle.exportKey('jwk', kp.privateKey)), VAPID_PUBLIC: 'pub' },
  outboundService: req => {
    const u = new URL(req.url), m = u.pathname.match(/contents\/docs\/(.+)$/);
    if (u.hostname !== 'api.github.com') return new Response('', { status: 503 });
    if (m && req.method === 'GET') return GH[m[1]] ? new Response(GH[m[1]], { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 });
    return Response.json({ object: { sha: 'a' }, tree: { sha: 'b' }, sha: 'c' });
  } });

let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FALLA:', m); } else console.log('ok   ', m); };
const b = await chromium.launch();
const c = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', locale: 'es-ES', timezoneId: 'Europe/Madrid' });
const [Y, M, D] = cartel.date;
await c.clock.install({ time: new Date(Date.UTC(Y, M - 1, D, 11, 0)) });
const count = {}, errs = [];
let down = false, webCopy = null;
await c.route('**/*', async r => {
  const q = r.request(), u = new URL(q.url());
  if (q.url().startsWith(PUSH)) {
    count[u.pathname] = (count[u.pathname] || 0) + 1;
    if (down) return r.fulfill({ status: 503, body: '' });
    const res = await mf.dispatchFetch('http://x' + u.pathname + u.search, { method: q.method(), headers: { ...q.headers(), origin: base, 'cf-connecting-ip': '1.2.3.4' }, body: q.postData() || undefined });
    return r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  }
  if (!q.url().startsWith(base)) return r.abort();
  if (u.pathname === '/changes.json') { count.web = (count.web || 0) + 1; if (webCopy) return r.fulfill({ status: 200, contentType: 'application/json', body: webCopy }); }
  if (u.pathname === '/') {   // la web tal com la publicaria build_web.py amb el servidor instal·lat
    const res = await r.fetch(); let t = await res.text();
    if (!t.includes('const PUSH = null;')) { console.log('No trobo «const PUSH = null;» a docs/index.html'); process.exit(1); }
    t = t.replace('const PUSH = null;', `const PUSH = ${JSON.stringify({ url: PUSH, public: 'x' })};`).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    return r.fulfill({ response: res, body: t });
  }
  r.continue();
});
const p = await c.newPage();
p.on('pageerror', e => errs.push(e.message));
const has = async t => (await p.evaluate(() => document.body.innerText)).includes(t);
const run = async ms => { await p.clock.runFor(ms); await p.waitForTimeout(700); };

await p.goto(base + '/', { waitUntil: 'load' });
await p.waitForTimeout(2500);
ok(await has('AVISO UNO'), "l'app mostra l'aviso que ve del servidor");
ok(count['/doc/changes.json'] === 1 && count['/doc/tasks.json'] === 1, `en obrir: 1 baixada de cada fitxer (${count['/doc/changes.json']}/${count['/doc/tasks.json']})`);
ok(!count.web, 'no ha calgut la còpia de la web');
await run(10 * 60000);
ok(count['/live'] >= 4, `10 min oberta: /live va preguntant (${count['/live']})`);
ok(count['/doc/changes.json'] === 1 && count['/doc/tasks.json'] === 1, `10 min sense canvis: cap baixada més (${count['/doc/changes.json']}/${count['/doc/tasks.json']})`);

// L'organització publica un aviso nou
const J = async r => r.json();
const sess = (await J(await mf.dispatchFetch('http://x/admin/login', { method: 'POST', headers: { 'cf-connecting-ip': '9.9.9.9' }, body: JSON.stringify({ pw: 'admin-secret-123' }) }))).session;
const pub = await J(await mf.dispatchFetch('http://x/admin/commit', { method: 'POST', headers: { 'cf-connecting-ip': '9.9.9.9' }, body: JSON.stringify({ s: sess, files: [{ path: 'docs/changes.json', content: ch('2026-12-05T11:20:00.000Z', 'AVISO DOS') }] }) }));
ok(pub.ok, "l'organització publica (GitHub encara té el d'abans)");
await run(65000);
ok(await has('AVISO DOS'), "l'aviso nou arriba al mòbil en 1 minut");
ok(count['/doc/changes.json'] === 2 && count['/doc/tasks.json'] === 1, `només s'ha tornat a baixar l'horari (${count['/doc/changes.json']}/${count['/doc/tasks.json']})`);
if (CAPS) { fs.mkdirSync(CAPS, { recursive: true }); await p.screenshot({ path: path.join(CAPS, 'horari-servidor-aviso-nou.png') }); }

// El servidor cau: la còpia de la web (més vella) no ha de guanyar
down = true;
await run(20 * 60000);
ok(count.web >= 1, `servidor caigut: es prova la còpia de la web (${count.web})`);
ok(await has('AVISO DOS'), 'una còpia de la web més vella NO trepitja el que ja es té');
webCopy = ch('2026-12-05T12:00:00.000Z', 'AVISO TRES');
await run(4 * 60000);
ok(await has('AVISO TRES'), 'servidor caigut i web més nova: arriba per la web');
down = false;
await run(20 * 60000);
ok(await has('AVISO DOS'), 'el servidor torna: mana el que diu el servidor (és qui llegeix GitHub)');
ok(!errs.length, 'cap error de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
console.log(`\n${n - fail}/${n} proves bé`);
await b.close(); await mf.dispose(); srv.close(); process.exit(fail ? 1 : 0);
