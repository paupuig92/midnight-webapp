// Midnight · servidor de notificacions (Cloudflare Worker, pla gratuït).
//
// Cada mòbil que activa les notificacions es registra amb POST /sub (els seus artistes i quants minuts abans vol l'avís).
// Cada minut (cron) el servidor:
//   1. llegeix l'horari publicat (docs/changes.json; si GitHub falla, fa servir l'últim bo i no avisa de cap canvi),
//   2. tria els mòbils que han de rebre un avís (artista que comença d'aquí a X minuts o ara; canvi o avís de l'organització),
//   3. els envia en lots de 40, cada lot des d'una crida pròpia (/send), perquè el pla gratuït només deixa 50 peticions per crida.
// Els push van sense contingut: en rebre'l, el service worker de l'app demana GET /now i el servidor li diu què mostrar.
//
// Tasques de l'equip («Mi plan»): l'organització publica docs/tasks.json; el mòbil diu qui és (yo) i quants minuts abans vol l'avís (tb).
// Les ✓ de les tasques es guarden aquí (POST /done) perquè l'organització les vegi a la vista global (GET /done).
// Dades: Durable Object «Store» amb SQLite (un registre per mòbil; coherent i sense curses). Taules: subs, done, kv ('last', 'sets', 'tasks').
// Secrets: VAPID_JWK (clau privada), SEND_KEY (per a /send i per signar les sessions), ADMIN_PW (contrasenya de l'organització),
// GH_TOKEN (token de GitHub de l'editor: viu NOMÉS aquí, ja no va dins la web). Text: VAPID_PUBLIC.
//
// Editor de l'organització (des del 03-11-2026): l'app envia la contrasenya a POST /admin/login (màxim 10 intents cada 15 min per IP)
// i rep una sessió de 12 h. Amb la sessió pot llegir i publicar NOMÉS docs/changes.json i docs/tasks.json (POST /admin/read i /admin/commit).
// Totes les rutes públiques tenen un límit de peticions per IP, perquè ningú pugui esgotar el pla gratuït ni omplir el servidor. Enllaços: STORE (Durable Object), SELF (el mateix worker).
// CARTEL (l'horari del cartell) el posa instala.sh a partir de docs/cartel.json.

const CARTEL = /*CARTEL*/null/*CARTEL*/;
const PAGES = 'https://midnight-app.midnightgroup.workers.dev/';
// L'adreça antiga (GitHub Pages) es manté perquè els mòbils que la tenien encara puguin parlar amb el servidor
const ORIGINS = ['https://visualcrew.midnightgroup.app', 'https://midnight-app.midnightgroup.workers.dev', 'https://paupuig92.github.io', 'http://localhost:8765'];
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
const MIN = 60000;
const BATCH = 40, MAX_SUBS = 600;

// Hora local (Europe/Madrid) → instant, igual que T() de l'app. El dia i l'hora d'inici surten de CARTEL
// (cartel.json, que genera build_web.py a partir del bloc FEST de l'app).
const fmtWall = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
function wallOf(ms) {
  const p = Object.fromEntries(fmtWall.formatToParts(ms).map(x => [x.type, +x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
}
const START_M = (([h, m]) => h * 60 + m)(CARTEL.start.split(':').map(Number));
// Festivals de diversos dies: «2/11:00» = les 11:00 del 2n dia (CARTEL.days)
const NDAYS = Math.max(1, +CARTEL.days || 1);
function T(s) {
  const m = String(s).match(/^(?:(\d)\/)?(\d{1,2}):(\d{2})([ab]?)$/);
  if (!m) return NaN;
  const dd = m[1] ? +m[1] - 1 : 0, h = +m[2], mi = +m[3], f = m[4];
  if (h > 23 || mi > 59 || dd < 0 || dd >= NDAYS) return NaN;
  const [Y, M, D] = CARTEL.date;
  const wall = Date.UTC(Y, M - 1, D + dd + (h * 60 + mi < START_M ? 1 : 0), h, mi);
  const ok = [wall - 2 * 3600000, wall - 3600000].filter(c => wallOf(c) === wall);
  return ok.length ? (f === 'a' ? ok[0] : ok[ok.length - 1]) : wall - 3600000;
}
const END = T((NDAYS > 1 ? NDAYS + '/' : '') + CARTEL.end) + 60 * MIN;   // una hora després del final ja no s'envia res
// Els changes.json d'abans no portaven «fest»: eren del Bass in the Park
const sameFest = c => (c.fest || 'bass-in-the-park-2026') === CARTEL.fest;

const REPO = 'paupuig92/midnight-webapp';
const ADMIN_FILES = ['docs/changes.json', 'docs/tasks.json'];
const SESSION = 12 * 3600000;
const cors = origin => ORIGINS.includes(origin)
  ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'vary': 'origin' }
  : {};
const json = (data, status = 200, origin = '') => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(origin) },
});
const idOf = async endpoint => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))]
  .slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
const okEndpoint = ep => { try { return typeof ep === 'string' && ep.length <= 600 && ep.startsWith('https://') && PUSH_HOSTS.test(new URL(ep).hostname); } catch (e) { return false; } };
const cleanFavs = f => Array.isArray(f) ? [...new Set(f.filter(x => typeof x === 'string' && /^[\w-]{1,40}$/.test(x)))].slice(0, 80) : [];
const cleanBefore = b => [0, 5, 10, 15, 20, 30].includes(+b) ? +b : 10;
const cleanYo = y => typeof y === 'string' && /^[a-z0-9]{1,40}$/.test(y) ? y : '';
const cleanTeam = t => ['prod', 'mkt', 'video', 'foto'].includes(t) ? t : '';
const okTaskId = id => typeof id === 'string' && /^[\w-]{1,40}$/.test(id);
const MAX_DONE = 5000;
// Multicámara (pestanya «Cámaras»): estat de cada càmera, compartit per tot l'equip (sense contrasenya, com les ✓)
const MC_ST = ['', 'montada', 'grabando', 'parada', 'recogida'];
const okMcId = id => typeof id === 'string' && /^[\w-]{1,80}$/.test(id);
const mcText = (s, n) => typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) : '';
const MAX_MC = 400;
// Límits per IP: [nom, peticions, finestra]. Generosos: a la festa molts mòbils poden compartir IP (4G).
const LIM = {
  sub: ['sub', 40, 10 * MIN], test: ['test', 10, 10 * MIN], now: ['now', 400, 10 * MIN], done: ['done', 800, 10 * MIN],
  doneall: ['doneall', 1500, 10 * MIN], mc: ['mc', 600, 10 * MIN], mcall: ['mcall', 1500, 10 * MIN], mclog: ['mclog', 300, 10 * MIN], count: ['count', 60, 10 * MIN], login: ['login', 10, 15 * MIN], admin: ['admin', 200, 10 * MIN],
};
const errStatus = r => r.error === 'slow' || r.error === 'full' ? 429 : r.error ? 400 : 200;

// Sessió de l'organització: «caducitat.signatura». Si es canvia la contrasenya, totes les sessions velles deixen de valer.
const te = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey('raw', te.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, te.encode(msg)));
}
// Comparació que no depèn de quantes lletres coincideixen (es comparen els HMAC, no el text)
const sameText = async (a, b) => (await hmacHex('cmp', String(a))) === (await hmacHex('cmp', String(b)));
const sign = (env, exp) => hmacHex(env.SEND_KEY, `adm|${exp}|${env.ADMIN_PW}`);
async function okSession(env, s) {
  const m = typeof s === 'string' && s.match(/^(\d{10,16})\.([0-9a-f]{64})$/);
  if (!m || !env.ADMIN_PW || !env.SEND_KEY) return false;
  const exp = +m[1];
  if (exp < Date.now() || exp > Date.now() + SESSION + MIN) return false;
  return sameText(m[2], await sign(env, exp));
}

// GitHub (només des del servidor; el token no surt mai d'aquí)
async function gh(env, path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'midnight-push', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) { const e = new Error('github'); e.status = r.status; throw e; }
  return r.status === 204 ? null : r.json();
}
async function ghRead(env, path) {
  try {
    const cur = await gh(env, `/contents/${path}?ref=main&t=${Date.now()}`);
    return { data: JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cur.content.replace(/\s/g, '')), c => c.charCodeAt(0)))) };
  } catch (e) {
    if (e.status === 404) return { data: null };
    throw e;
  }
}
// Un commit amb un o dos fitxers (API de dades de Git); si algú ha publicat just ara, es torna a provar
async function ghCommit(env, files, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await gh(env, '/git/ref/heads/main');
    const head = await gh(env, `/git/commits/${ref.object.sha}`);
    const tree = await gh(env, '/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree: files.map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) }) });
    const commit = await gh(env, '/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }) });
    try { await gh(env, '/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) }); return { ok: true }; }
    catch (e) { if (e.status !== 422 && e.status !== 409) throw e; }
    await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
  }
  return { error: 'busy' };
}

// Horari: { all: { id: { n, a, b, stage } }, key, stamp, notice }
function digest(sets, stamp, notice) {
  const names = Object.fromEntries(CARTEL.stages.map(s => [s.id, s.name]));
  const all = {};
  for (const [sid, list] of Object.entries(sets || {})) {
    if (!Array.isArray(list)) continue;
    for (const x of list) {
      if (!x || typeof x.id !== 'string' || !x.n) continue;
      const a = T(x.a), b = T(x.b);
      if (Number.isFinite(a)) all[x.id] = { n: String(x.n).trim().slice(0, 80), a, b, stage: names[sid] || sid };
    }
  }
  const key = Object.keys(all).sort().map(id => `${id}|${all[id].a}|${all[id].b}|${all[id].n}`).join('~');
  return { all, key, stamp, notice: typeof notice === 'string' ? notice : '' };
}
// Llegeix changes.json. Si GitHub no respon bé, torna null (s'usarà l'últim horari bo i no s'avisarà de cap canvi)
async function fetchSchedule() {
  try {
    const r = await fetch(`${PAGES}changes.json?t=${Date.now()}`, { cf: { cacheTtl: 0 }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const c = await r.json();
    if (!c || typeof c !== 'object' || typeof c.updated !== 'string') return null;
    if (!sameFest(c)) return { sets: CARTEL.sets, stamp: 'cartel', notice: '' };  // són d'un altre festival
    return { sets: c.sets && typeof c.sets === 'object' ? c.sets : CARTEL.sets, stamp: c.updated, notice: c.notice, noticeTeam: cleanTeam(c.noticeTeam) };
  } catch (e) { return null; }
}

// Tasques: { list: [{ id, a, b, t, p: [qui] }] } (a i b ja en ms; p = les persones a qui toca, ja resoltes per l'app)
async function fetchTasks() {
  try {
    const r = await fetch(`${PAGES}tasks.json?t=${Date.now()}`, { cf: { cacheTtl: 0 }, signal: AbortSignal.timeout(6000) });
    if (r.status === 404) return { list: [], stamp: 'none' };
    if (!r.ok) return null;
    const c = await r.json();
    if (!c || typeof c !== 'object' || c.fest !== CARTEL.fest || !Array.isArray(c.list)) return { list: [], stamp: 'none' };
    const list = c.list.filter(x => x && okTaskId(x.id) && Number.isFinite(x.a) && typeof x.t === 'string' && Array.isArray(x.p))
      .slice(0, 2000).map(x => ({ id: x.id, a: x.a, t: x.t.slice(0, 120), p: x.p.filter(k => cleanYo(k)) }));
    return { list, stamp: String(c.updated || '') };
  } catch (e) { return null; }
}
function dueTasks(sub, list, from, to) {
  const items = [];
  if (!sub.yo || !(sub.tb > 0) || !list) return items;
  for (const x of list) {
    if (!x.p.includes(sub.yo)) continue;
    const pre = x.a - sub.tb * MIN;
    if (pre > from && pre <= to) items.push({ title: `Tasca · d’aquí a ${sub.tb} min`, body: x.t, tag: `tk-${x.id}@${x.a}:pre` });
    if (x.a > from && x.a <= to) items.push({ title: 'Tasca · ara', body: x.t, tag: `tk-${x.id}@${x.a}:go` });
  }
  return items;
}

// Què toca avisar a un mòbil en la finestra (from, to]
function dueFor(sub, all, from, to) {
  const items = [];
  if (!(sub.before > 0)) return items;
  for (const id of sub.favs) {
    const x = all[id];
    if (!x) continue;
    const pre = x.a - sub.before * MIN;
    if (pre > from && pre <= to) items.push({ title: `${x.n} · d’aquí a ${sub.before} min`, body: x.stage, tag: `${id}@${x.a}:pre` });
    if (x.a > from && x.a <= to) items.push({ title: `${x.n} · comença ara`, body: x.stage, tag: `${id}@${x.a}:go` });
  }
  return items;
}

// Push sense contingut amb VAPID. El JWT es fa un cop per servei de push (Apple, Google…) i es reaprofita 1 h
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let keyCache = null;
const jwts = new Map();
async function vapidAuth(env, aud) {
  const c = jwts.get(aud), nowS = Math.floor(Date.now() / 1000);
  if (c && c.exp - nowS > 3600) return c.h;
  if (!keyCache) keyCache = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const exp = nowS + 12 * 3600;
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp, sub: PAGES })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyCache, new TextEncoder().encode(unsigned));
  const h = `vapid t=${unsigned}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
  jwts.set(aud, { h, exp });
  return h;
}
async function sendPush(env, endpoint) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { TTL: '900', Urgency: 'high', Authorization: await vapidAuth(env, new URL(endpoint).origin), 'Content-Length': '0' },
    signal: AbortSignal.timeout(8000),
  });
  return r.status;
}

const store = env => env.STORE.get(env.STORE.idFromName('main'));
const callStore = async (env, path, body) => {
  const r = await store(env).fetch('https://store' + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
  return r.json();
};

// Envia un lot (s'executa en una crida pròpia per tenir el seu propi límit de peticions)
async function sendBatch(env, list) {
  const gone = [];
  let ok = 0, ko = 0;
  await Promise.all(list.map(async t => {
    try {
      const st = await sendPush(env, t.endpoint);
      if (st === 404 || st === 410) gone.push(t.id);
      else if (st >= 200 && st < 300) ok++; else ko++;
    } catch (e) { ko++; }
  }));
  if (gone.length) await callStore(env, '/gone', { ids: gone });
  return { ok, ko, gone: gone.length };
}

// Cada minut
async function everyMinute(env, now) {
  if (now > END) return;
  const [fresh, tasks] = await Promise.all([fetchSchedule(), fetchTasks()]);
  const res = await callStore(env, '/tick', { now, fresh, tasks });
  const targets = res.targets || [];
  if (!targets.length) return;
  const chunks = [];
  for (let i = 0; i < targets.length; i += BATCH) chunks.push(targets.slice(i, i + BATCH));
  const results = await Promise.all(chunks.map(c => env.SELF
    ? env.SELF.fetch('https://self/send', { method: 'POST', headers: { 'x-send-key': env.SEND_KEY }, body: JSON.stringify(c) }).then(r => r.json()).catch(() => ({ ko: c.length }))
    : sendBatch(env, c)));
  const sum = results.reduce((s, r) => ({ ok: s.ok + (r.ok || 0), ko: s.ko + (r.ko || 0), gone: s.gone + (r.gone || 0) }), { ok: 0, ko: 0, gone: 0 });
  console.log('avisos', new Date(now).toISOString(), 'enviats', sum.ok, 'errors', sum.ko, 'caducats', sum.gone, 'de', targets.length);
  await callStore(env, '/sent', { at: new Date(now).toISOString(), ...sum, of: targets.length });
}

// Emmagatzematge (Durable Object amb SQLite): un sol lloc i coherent, sense curses entre peticions
export class Store {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS subs (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, favs TEXT NOT NULL, before INTEGER NOT NULL, changes INTEGER NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS done (who TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (who, id))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS mc (id TEXT PRIMARY KEY, st TEXT NOT NULL, ssd TEXT NOT NULL, note TEXT NOT NULL, who TEXT NOT NULL, at INTEGER NOT NULL)`);
    // Multicámara: «since» = quan va canviar l'estat (per al «REC hace 1 h 52») i historial de canvis (els últims 500)
    if (!this.sql.exec('PRAGMA table_info(mc)').toArray().some(c => c.name === 'since')) this.sql.exec('ALTER TABLE mc ADD COLUMN since INTEGER NOT NULL DEFAULT 0');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS mclog (n INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, st TEXT NOT NULL, ssd TEXT NOT NULL, who TEXT NOT NULL, at INTEGER NOT NULL)`);
    // Columnes noves (tasques): qui és el mòbil i quants minuts abans vol l'avís de les seves tasques
    const cols = this.sql.exec('PRAGMA table_info(subs)').toArray().map(c => c.name);
    if (!cols.includes('yo')) this.sql.exec("ALTER TABLE subs ADD COLUMN yo TEXT NOT NULL DEFAULT ''");
    if (!cols.includes('tb')) this.sql.exec('ALTER TABLE subs ADD COLUMN tb INTEGER NOT NULL DEFAULT 10');
    // Equip del mòbil (prod / mkt / video / foto): els avisos de l'organització poden anar només a un equip
    if (!cols.includes('team')) this.sql.exec("ALTER TABLE subs ADD COLUMN team TEXT NOT NULL DEFAULT ''");
    // Festival nou: s'esborren els mòbils i l'horari del festival anterior (els preferits d'un no valen per a l'altre)
    if (this.get('fest') !== CARTEL.fest) {
      this.sql.exec('DELETE FROM subs');
      this.sql.exec('DELETE FROM done');
      this.sql.exec('DELETE FROM mc');
      this.sql.exec('DELETE FROM mclog');
      this.sql.exec("DELETE FROM kv WHERE k <> 'imported'");
      this.put('fest', CARTEL.fest);
    }
    this.ready = state.blockConcurrencyWhile(() => this.importOld());
  }
  get(k) { const r = this.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray()[0]; return r ? JSON.parse(r.v) : null; }
  put(k, v) { this.sql.exec('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v)); }
  // Un sol cop: porta els mòbils que hi havia a l'antic KV
  async importOld() {
    if (this.get('imported') || !this.env.SUBS) return;
    try {
      const old = (await this.env.SUBS.get('subs', 'json')) || {};
      for (const [id, s] of Object.entries(old)) if (okEndpoint(s.endpoint)) this.upsert(id, s.endpoint, cleanFavs(s.favs), cleanBefore(s.before), s.changes !== false, s.at || Date.now());
      const last = await this.env.SUBS.get('last', 'json');
      if (last) this.put('last', last);
    } catch (e) {}
    this.put('imported', true);
  }
  upsert(id, endpoint, favs, before, changes, at, yo = '', tb = 10, team = '') {
    this.sql.exec(`INSERT INTO subs (id, endpoint, favs, before, changes, at, yo, tb, team) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, favs = excluded.favs, before = excluded.before, changes = excluded.changes, at = excluded.at, yo = excluded.yo, tb = excluded.tb, team = excluded.team`,
      id, endpoint, JSON.stringify(favs), before, changes ? 1 : 0, at, yo, tb, team);
  }
  // Límit de peticions (finestra fixa): true si encara en queden
  hit(k, max, win) {
    const now = Date.now();
    if (Math.random() < 0.02) this.sql.exec('DELETE FROM rl WHERE reset < ?', now);
    const r = this.sql.exec('SELECT n, reset FROM rl WHERE k = ?', k).toArray()[0];
    if (!r || r.reset <= now) {
      this.sql.exec('INSERT INTO rl (k, n, reset) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = 1, reset = excluded.reset', k, now + win);
      return true;
    }
    if (r.n >= max) return false;
    this.sql.exec('UPDATE rl SET n = n + 1 WHERE k = ?', k);
    return true;
  }
  row(id) {
    const r = this.sql.exec('SELECT * FROM subs WHERE id = ?', id).toArray()[0];
    return r ? { ...r, favs: JSON.parse(r.favs), changes: !!r.changes } : null;
  }
  async fetch(req) {
    await this.ready;
    const url = new URL(req.url);
    const b = req.method === 'POST' ? await req.json() : {};
    if (Array.isArray(b._rl)) {
      const [k, max, win] = b._rl;
      if (!this.hit(String(k).slice(0, 80), +max, +win)) return json({ error: 'slow' }, 429);
      if (url.pathname === '/rl') return json({ ok: true });
    }
    if (url.pathname === '/sub') {
      const id = await idOf(b.endpoint);
      let { favs, before, changes, yo, tb, team } = b;
      if (b.old && b.old !== b.endpoint) {
        const oldId = await idOf(b.old), prev = this.row(oldId);
        // Renovació de la subscripció (pushsubscriptionchange): conserva les preferències del registre vell
        if (prev && favs === undefined) ({ favs, before, changes, yo, tb, team } = prev);
        this.sql.exec('DELETE FROM subs WHERE id = ?', oldId);
      }
      const cur = this.row(id);
      const nf = cleanFavs(favs), nb = cleanBefore(before), nc = changes !== false;
      // Un mòbil antic (sense «yo») conserva el que ja hi havia
      const ny = yo === undefined ? (cur ? cur.yo : '') : cleanYo(yo), nt = tb === undefined ? (cur ? cur.tb : 10) : cleanBefore(tb);
      const ne = team === undefined ? (cur ? cur.team || '' : '') : cleanTeam(team);
      if (cur && cur.endpoint === b.endpoint && JSON.stringify(cur.favs) === JSON.stringify(nf) && cur.before === nb && cur.changes === nc && cur.yo === ny && cur.tb === nt && (cur.team || '') === ne) return json({ ok: true, id, same: true });
      if (!cur && this.sql.exec('SELECT COUNT(*) AS n FROM subs').one().n >= MAX_SUBS) return json({ error: 'full' }, 429);
      this.upsert(id, b.endpoint, nf, nb, nc, Date.now(), ny, nt, ne);
      return json({ ok: true, id });
    }
    if (url.pathname === '/unsub') { this.sql.exec('DELETE FROM subs WHERE id = ?', await idOf(b.endpoint)); return json({ ok: true }); }
    if (url.pathname === '/gone') { for (const id of b.ids || []) this.sql.exec('DELETE FROM subs WHERE id = ?', id); return json({ ok: true }); }
    if (url.pathname === '/endpoint') { const r = this.row(b.id); return json({ endpoint: r ? r.endpoint : null }); }
    if (url.pathname === '/count') return json({ n: this.sql.exec('SELECT COUNT(*) AS n FROM subs').one().n });
    if (url.pathname === '/debug') return json({ last: this.get('last'), sets: (this.get('sets') || {}).stamp || null, sent: this.get('sent'),
      subs: this.sql.exec('SELECT id, before, changes, at, favs FROM subs').toArray() });
    if (url.pathname === '/sent') { this.put('sent', b); return json({ ok: true }); }
    // ✓ d'una tasca (v = true la marca, false la desmarca)
    if (url.pathname === '/done') {
      const who = cleanYo(b.who);
      if (!who || !okTaskId(b.id)) return json({ error: 'bad' }, 400);
      if (b.v) {
        if (this.sql.exec('SELECT COUNT(*) AS n FROM done').one().n >= MAX_DONE) return json({ error: 'full' }, 429);
        this.sql.exec('INSERT INTO done (who, id, at) VALUES (?, ?, ?) ON CONFLICT(who, id) DO NOTHING', who, b.id, Date.now());
      } else this.sql.exec('DELETE FROM done WHERE who = ? AND id = ?', who, b.id);
      return json({ ok: true });
    }
    // Multicámara: una càmera (estat, SSD, nota, qui i quan). Només es canvien els camps que s'envien
    // (així dos mòbils no es trepitgen: un posa REC i l'altre l'SSD, i queden tots dos). Tot buit = s'esborra
    if (url.pathname === '/mc') {
      if (!okMcId(b.id)) return json({ error: 'bad' }, 400);
      const old = this.sql.exec('SELECT st, ssd, note, since FROM mc WHERE id = ?', b.id).toArray()[0] || { st: '', ssd: '', note: '', since: 0 };
      const st = 'st' in b ? (MC_ST.includes(b.st) ? b.st : '') : old.st;
      const ssd = 'ssd' in b ? mcText(b.ssd, 24) : old.ssd, note = 'note' in b ? mcText(b.note, 140) : old.note, who = mcText(b.who, 30), now = Date.now();
      const since = st !== old.st ? now : old.since || 0;
      if (!/-pos$/.test(b.id) && (st !== old.st || ssd !== old.ssd)) {
        this.sql.exec('INSERT INTO mclog (id, st, ssd, who, at) VALUES (?, ?, ?, ?, ?)', b.id, st, ssd, who, now);
        this.sql.exec('DELETE FROM mclog WHERE n <= (SELECT MAX(n) - 500 FROM mclog)');
      }
      if (!st && !ssd && !note) { this.sql.exec('DELETE FROM mc WHERE id = ?', b.id); return json({ ok: true }); }
      if (!this.sql.exec('SELECT id FROM mc WHERE id = ?', b.id).toArray().length && this.sql.exec('SELECT COUNT(*) AS n FROM mc').one().n >= MAX_MC) return json({ error: 'full' }, 429);
      this.sql.exec('INSERT INTO mc (id, st, ssd, note, who, at, since) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET st = excluded.st, ssd = excluded.ssd, note = excluded.note, who = excluded.who, at = excluded.at, since = excluded.since',
        b.id, st, ssd, note, who, now, since);
      return json({ ok: true, mc: { st, ssd, note, who, at: now, since } });
    }
    if (url.pathname === '/mcall') {
      const out = {};
      for (const r of this.sql.exec('SELECT id, st, ssd, note, who, at, since FROM mc').toArray()) out[r.id] = { st: r.st, ssd: r.ssd, note: r.note, who: r.who, at: r.at, since: r.since };
      return json({ mc: out });
    }
    if (url.pathname === '/mclogall') {
      return json({ log: this.sql.exec('SELECT id, st, ssd, who, at FROM mclog ORDER BY n DESC LIMIT 80').toArray() });
    }
    // Vista global: totes les ✓ ({ qui: { tasca: hora } })
    if (url.pathname === '/doneall') {
      const out = {};
      for (const r of this.sql.exec('SELECT who, id, at FROM done').toArray()) (out[r.who] = out[r.who] || {})[r.id] = r.at;
      return json({ done: out });
    }

    // Horari vigent: el fresc si n'hi ha; si no, l'últim bo; si no, el cartell
    const current = fresh => {
      if (fresh) return digest(fresh.sets, fresh.stamp, fresh.notice);
      const s = this.get('sets');
      return s ? digest(s.sets, s.stamp, s.notice) : digest(CARTEL.sets, 'cartel', '');
    };

    if (url.pathname === '/tick') {
      const { now, fresh } = b;
      const sch = current(fresh);
      // Tasques: les fresques si n'hi ha; si GitHub falla, les últimes bones
      if (b.tasks) this.put('tasks', b.tasks);
      const tasks = (b.tasks || this.get('tasks') || {}).list || [];
      if (fresh) {
        const s = this.get('sets');
        if (!s || s.stamp !== fresh.stamp) this.put('sets', { sets: fresh.sets, stamp: fresh.stamp, notice: fresh.notice, noticeTeam: fresh.noticeTeam || '' });
      }
      const targets = new Map();
      for (const sub of this.sql.exec('SELECT * FROM subs').toArray()) {
        const s = { ...sub, favs: JSON.parse(sub.favs), changes: !!sub.changes };
        if (dueFor(s, sch.all, now - MIN, now).length || dueTasks(s, tasks, now - MIN, now).length) targets.set(s.id, s.endpoint);
      }
      // Canvi de l'organització: només si l'horari publicat és més nou que el que ja s'havia vist
      if (fresh) {
        const last = this.get('last');
        if (!last) this.put('last', { stamp: sch.stamp, notice: sch.notice, key: sch.key, at: 0 });
        else if (sch.stamp !== last.stamp && !(Date.parse(sch.stamp) <= Date.parse(last.stamp))) {
          const newNotice = !!sch.notice && sch.notice !== last.notice;
          const schedChanged = last.key !== undefined ? last.key !== sch.key : !newNotice;
          // Un avís només per a un equip: als altres mòbils només els arriba si a més ha canviat l'horari
          const team = newNotice ? cleanTeam(fresh.noticeTeam) : '';
          const ev = {
            stamp: sch.stamp, notice: sch.notice, key: sch.key, at: now, silent: !newNotice && !schedChanged, team, sched: schedChanged,
            title: newNotice ? 'Avís de l’organització' : 'Canvi d’horari',
            body: newNotice ? sch.notice.slice(0, 180) : 'L’organització ha canviat l’horari.',
          };
          this.put('last', ev);
          if (!ev.silent) for (const sub of this.sql.exec('SELECT id, endpoint, team FROM subs WHERE changes = 1').toArray()) if (!team || sub.team === team || schedChanged) targets.set(sub.id, sub.endpoint);
        }
      }
      return json({ targets: [...targets].map(([id, endpoint]) => ({ id, endpoint })) });
    }

    if (url.pathname === '/now') {
      const sub = this.row(b.id);
      if (!sub) return json({ items: [] });
      const sch = current(null);
      // 15 min: el mateix temps que Apple guarda el push si el mòbil no té cobertura (TTL 900 s); el mòbil no repeteix el que ja ha mostrat
      const items = [...dueFor(sub, sch.all, b.now - 15 * MIN, b.now), ...dueTasks(sub, (this.get('tasks') || {}).list, b.now - 15 * MIN, b.now)];
      const last = this.get('last');
      if (sub.changes && last && last.at && !last.silent && b.now - last.at < 15 * MIN) {
        if (!last.team || sub.team === last.team) items.push({ title: last.title, body: last.body, tag: 'org-' + last.stamp });
        else if (last.sched) items.push({ title: 'Canvi d’horari', body: 'L’organització ha canviat l’horari.', tag: 'org-' + last.stamp });
      }
      return json({ items });
    }
    return json({ error: 'not found' }, 404);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    const ip = req.headers.get('cf-connecting-ip') || 'x';
    const lim = name => ({ _rl: [`${LIM[name][0]}:${ip}`, LIM[name][1], LIM[name][2]] });
    // Les crides de l'app no poden ser enormes
    const body = async () => {
      const t = await req.text();
      if (t.length > 600000) throw Object.assign(new Error('big'), { big: true });
      return JSON.parse(t || '{}');
    };
    try {
      // Lot d'enviament (només el pot cridar el mateix servidor)
      if (req.method === 'POST' && url.pathname === '/send') {
        if (!env.SEND_KEY || !(await sameText(req.headers.get('x-send-key') || '', env.SEND_KEY))) return json({ error: 'forbidden' }, 403);
        const list = (await req.json()).filter(t => t && typeof t.id === 'string' && okEndpoint(t.endpoint)).slice(0, BATCH);
        return json(await sendBatch(env, list));
      }
      // ✓ de les tasques: les marca cada mòbil i les llegeix la vista global de l'organització
      if (req.method === 'POST' && url.pathname === '/done') {
        const r = await callStore(env, '/done', { ...(await body()), ...lim('done') });
        return json(r, errStatus(r), origin);
      }
      // Multicámara: cada mòbil canvia l'estat d'una càmera; tots el llegeixen
      if (req.method === 'POST' && url.pathname === '/mc') {
        const r = await callStore(env, '/mc', { ...(await body()), ...lim('mc') });
        return json(r, errStatus(r), origin);
      }
      if (req.method === 'GET' && url.pathname === '/mc') { const r = await callStore(env, '/mcall', lim('mcall')); return json(r, errStatus(r), origin); }
      if (req.method === 'GET' && url.pathname === '/mclog') { const r = await callStore(env, '/mclogall', lim('mclog')); return json(r, errStatus(r), origin); }
      if (req.method === 'GET' && url.pathname === '/done') { const r = await callStore(env, '/doneall', lim('doneall')); return json(r, errStatus(r), origin); }
      if (req.method === 'POST' && (url.pathname === '/sub' || url.pathname === '/unsub')) {
        const b = await body();
        if (!okEndpoint(b.endpoint) || (b.old !== undefined && b.old !== '' && !okEndpoint(b.old))) return json({ error: 'endpoint' }, 400, origin);
        const r = await callStore(env, url.pathname, { ...b, ...lim('sub') });
        return json(r, errStatus(r), origin);
      }
      // Notificació de prova: només s'envia el push (el text el posa el mòbil, que sap que l'ha demanada)
      if (req.method === 'POST' && url.pathname === '/test') {
        const b = await body();
        if (!okEndpoint(b.endpoint)) return json({ error: 'endpoint' }, 400, origin);
        const r = await callStore(env, '/endpoint', { id: await idOf(b.endpoint), ...lim('test') });
        if (r.error) return json(r, errStatus(r), origin);
        if (!r.endpoint) return json({ error: 'nosub' }, 404, origin);
        const st = await sendPush(env, r.endpoint);
        return json({ ok: st >= 200 && st < 300, status: st }, 200, origin);
      }
      // El service worker del mòbil pregunta què ha de mostrar
      if (req.method === 'GET' && url.pathname === '/now') {
        const id = String(url.searchParams.get('id') || '').slice(0, 64);
        const r = await callStore(env, '/now', { id, now: Date.now(), ...lim('now') });
        return json(r, errStatus(r), origin);
      }
      // Estat: quants mòbils hi ha registrats (només el número, cap dada)
      if (url.pathname === '/debug') {
        if (!env.SEND_KEY || !(await sameText(req.headers.get('x-send-key') || '', env.SEND_KEY))) return json({ error: 'forbidden' }, 403);
        return json(await callStore(env, '/debug', {}));
      }
      // Editor de l'organització
      if (req.method === 'POST' && url.pathname.startsWith('/admin/')) {
        if (!env.ADMIN_PW || !env.GH_TOKEN) return json({ error: 'off' }, 503, origin);
        const b = await body();
        if (url.pathname === '/admin/login') {
          const rl = await callStore(env, '/rl', lim('login'));
          if (rl.error) return json(rl, 429, origin);
          if (!(await sameText(b.pw || '', env.ADMIN_PW))) return json({ error: 'pw' }, 401, origin);
          const exp = Date.now() + SESSION;
          return json({ session: `${exp}.${await sign(env, exp)}`, exp }, 200, origin);
        }
        const rl = await callStore(env, '/rl', lim('admin'));
        if (rl.error) return json(rl, 429, origin);
        if (!(await okSession(env, b.s))) return json({ error: 'session' }, 401, origin);
        try {
          if (url.pathname === '/admin/read') {
            if (!ADMIN_FILES.includes(b.path)) return json({ error: 'path' }, 400, origin);
            return json(await ghRead(env, b.path), 200, origin);
          }
          if (url.pathname === '/admin/commit') {
            const files = Array.isArray(b.files) ? b.files : [];
            const ok = files.length >= 1 && files.length <= ADMIN_FILES.length && files.every(f => f && ADMIN_FILES.includes(f.path) && typeof f.content === 'string' && (() => { try { JSON.parse(f.content); return true; } catch (e) { return false; } })());
            if (!ok) return json({ error: 'files' }, 400, origin);
            const msg = String(b.message || 'Cambios de la organización').replace(/[\r\n]+/g, ' ').slice(0, 200);
            const r = await ghCommit(env, files.map(f => ({ path: f.path, content: f.content })), msg);
            return json(r, r.error ? 409 : 200, origin);
          }
        } catch (e) {
          return json({ error: 'github', status: e.status || 0 }, 502, origin);
        }
        return json({ error: 'not found' }, 404, origin);
      }
      if (url.pathname === '/') {
        const r = await callStore(env, '/count', lim('count'));
        return json(r.error ? r : { ok: true, service: 'midnight-push', mobiles: r.n }, errStatus(r), origin);
      }
      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      if (e.big) return json({ error: 'big' }, 413, origin);
      if (e instanceof SyntaxError) return json({ error: 'bad' }, 400, origin);
      return json({ error: 'server' }, 500, origin);
    }
  },
  async scheduled(event, env, ctx) {
    // L'hora prevista de l'execució (no la real): si el cron arriba uns segons tard, no es perd ni es repeteix cap minut
    ctx.waitUntil(everyMinute(env, Math.floor(event.scheduledTime / MIN) * MIN));
  },
};
