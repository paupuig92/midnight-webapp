// Prova automàtica de l'app (06-11-2026): obre docs/ a Chromium com un iPhone, passa per totes les pestanyes
// i comprova que no hi ha errors i que el rellotge i l'horari funcionen.
//   node prova/prova.js                 → prova normal (surt amb codi 1 si falla)
//   node prova/prova.js --trenca=sol    → trenca l'app Sol a propòsit: el nucli ha de continuar funcionant
//   node prova/prova.js --trenca=sol --sintaxi → el mateix amb un error d'escriptura (el pitjor cas: no s'arriba a llegir res de l'app)
//   node prova/prova.js --trenca=nucli  → trenca el nucli: ha de sortir la pantalla «La app no ha arrancado bien · Reparar»
//   node prova/prova.js --captures=dir  → desa captures de cada pestanya
// Sense xarxa externa (tot el que no és la web es talla): així la prova sempre dona el mateix.
const http = require('http'), fs = require('fs'), path = require('path');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch (e) { console.log('SALTADA: falta Playwright (npm i -g playwright)'); process.exit(2); }
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];
const ROOT = path.resolve(__dirname, '..', 'docs'), TRENCA = arg('trenca'), CAPS = arg('captures'), PAGE = arg('pagina') || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; if (f === '/ca') f = '/ca.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
});
(async () => {
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  let b; try { b = await chromium.launch(); } catch (e) { console.log('SALTADA: no s\'ha pogut obrir Chromium (npx playwright install chromium)'); srv.close(); process.exit(2); }
  const fails = [], errs = [];
  const c = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  await c.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  const p = await c.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push('console: ' + m.text()); });
  if (TRENCA) await p.route(base + PAGE, async r => {
    const res = await r.fetch(); let t = await res.text();
    const re = TRENCA === 'nucli' ? /(<script>\ndocument\.documentElement\.lang)/ : new RegExp('(<script data-part="' + TRENCA + '">)');
    if (!re.test(t)) { console.log('No trobo la part «' + TRENCA + '»'); process.exit(1); }
    const bad = process.argv.includes('--sintaxi') ? '\nconst TRENCADA = = ;' : '\nthrow new Error("TRENCADA A PROPÒSIT: ' + TRENCA + '");';
    r.fulfill({ response: res, body: TRENCA === 'nucli' ? t.replace(re, '<script>\nthrow new Error("TRENCADA A PROPÒSIT: nucli");\ndocument.documentElement.lang') : t.replace(re, '$1' + bad) });
  });
  await p.goto(base + PAGE, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  if (TRENCA === 'nucli') {
    await p.waitForTimeout(16000);
    const dead = await p.$('#dead');
    if (CAPS) { fs.mkdirSync(CAPS, { recursive: true }); await p.screenshot({ path: path.join(CAPS, 'nucli-trencat.png') }); }
    await b.close(); srv.close();
    if (!dead) { console.log('FALLA: amb el nucli trencat no surt la pantalla «Reparar»'); process.exit(1); }
    console.log('OK: amb el nucli trencat surt la pantalla «La app no ha arrancado bien · Reparar»'); return;
  }
  const step = async (nom, fn) => {
    const n = errs.length;
    try { await fn(); } catch (e) { fails.push(nom + ': ' + e.message.split('\n')[0]); }
    await p.waitForTimeout(700);
    if (CAPS) { fs.mkdirSync(CAPS, { recursive: true }); await p.screenshot({ path: path.join(CAPS, nom + '.png') }); }
    for (const e of errs.slice(n)) if (!(TRENCA && /TRENCADA|Unexpected token/.test(e))) fails.push(nom + ' → ' + e);
  };
  const clock = () => p.$eval('#clock', e => e.textContent);
  await step('0-arrencada', async () => {
    const a = await clock(); await p.waitForTimeout(1200); const z = await clock();
    if (!/\d\d:\d\d/.test(a)) throw new Error('el rellotge no surt (' + a + ')');
    if (a === z) throw new Error('el rellotge no avança');
    const n = await p.$$eval('#tl > *', l => l.length).catch(() => 0);
    if (!n) throw new Error("l'horari (graella) no surt");
  });
  const tab = t => p.evaluate(t => showTab(t), t);
  for (const t of ['equipo', 'apps', 'sol', 'tiempo', 'multi', 'ajustes', 'org', 'ahora']) await step('tab-' + t, () => tab(t));
  // Timecode i Momentos: s'obren a sobre (com en tocar la fitxa) i es tanquen
  await step('app-timecode', async () => { await tab('apps'); await p.click('#apps [data-app="tc"]', { timeout: 3000 }); await p.waitForTimeout(600); await p.evaluate(() => safe('timecode', () => tcClose())); });
  await step('app-momentos', async () => { await tab('apps'); await p.click('#apps [data-app="mk"]', { timeout: 3000 }); await p.waitForTimeout(600); await p.evaluate(() => safe('momentos', () => mkCloseList())); });
  await step('9-final', async () => {
    const a = await clock(); await p.waitForTimeout(1200);
    if (a === await clock()) throw new Error('el rellotge s\'ha aturat');
  });
  await b.close(); srv.close();
  if (fails.length) { console.log('FALLA (' + fails.length + '):\n- ' + [...new Set(fails)].join('\n- ')); process.exit(1); }
  console.log('OK: l\'app arrenca, el rellotge avança i totes les pestanyes s\'obren sense errors' + (TRENCA ? ' (amb «' + TRENCA + '» trencada)' : ''));
})().catch(e => { console.log('ERROR de la prova: ' + e.message); process.exit(1); });
