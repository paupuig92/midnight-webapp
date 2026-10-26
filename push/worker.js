// Midnight · servidor de notificacions (Cloudflare Worker, pla gratuït).
//
// Cada mòbil que activa les notificacions es registra amb POST /sub (els seus artistes i quants minuts abans vol l'avís).
// Cada minut (cron) el servidor:
//   1. llegeix l'horari publicat (docs/changes.json; si GitHub falla, fa servir l'últim bo i no avisa de cap canvi),
//   2. tria els mòbils que han de rebre un avís (artista que comença d'aquí a X minuts o ara; canvi o avís de l'organització),
//   3. els envia en lots de 40, cada lot des d'una crida pròpia (/send), perquè el pla gratuït només deixa 50 peticions per crida.
// Els push van sense contingut: en rebre'l, el service worker de l'app demana GET /now i el servidor li diu què mostrar.
//
// Dades: Durable Object «Store» amb SQLite (un registre per mòbil; coherent i sense curses). Taules: subs, kv ('last', 'sets').
// Secrets: VAPID_JWK (clau privada), SEND_KEY (per a /send). Text: VAPID_PUBLIC. Enllaços: STORE (Durable Object), SELF (el mateix worker).
// CARTEL (l'horari del cartell) el posa instala.sh a partir de docs/cartel.json.

const CARTEL = /*CARTEL*/null/*CARTEL*/;
const PAGES = 'https://paupuig92.github.io/midnight-webapp/';
const ORIGINS = ['https://paupuig92.github.io', 'http://localhost:8765'];
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
function T(s) {
  const m = String(s).match(/^(\d{1,2}):(\d{2})([ab]?)$/);
  if (!m) return NaN;
  const h = +m[1], mi = +m[2], f = m[3];
  if (h > 23 || mi > 59) return NaN;
  const [Y, M, D] = CARTEL.date;
  const wall = Date.UTC(Y, M - 1, h * 60 + mi < START_M ? D + 1 : D, h, mi);
  const ok = [wall - 2 * 3600000, wall - 3600000].filter(c => wallOf(c) === wall);
  return ok.length ? (f === 'a' ? ok[0] : ok[ok.length - 1]) : wall - 3600000;
}
const END = T(CARTEL.end) + 60 * MIN;   // una hora després del final ja no s'envia res
// Els changes.json d'abans no portaven «fest»: eren del Bass in the Park
const sameFest = c => (c.fest || 'bass-in-the-park-2026') === CARTEL.fest;

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
    return { sets: c.sets && typeof c.sets === 'object' ? c.sets : CARTEL.sets, stamp: c.updated, notice: c.notice };
  } catch (e) { return null; }
}

// Què toca avisar a un mòbil en la finestra (from, to]
function dueFor(sub, all, from, to) {
  const items = [];
  if (!(sub.before > 0)) return items;
  for (const id of sub.favs) {
    const x = all[id];
    if (!x) continue;
    const pre = x.a - sub.before * MIN;
    if (pre > from && pre <= to) items.push({ title: `${x.n} · en ${sub.before} min`, body: x.stage, tag: `${id}@${x.a}:pre` });
    if (x.a > from && x.a <= to) items.push({ title: `${x.n} · empieza ahora`, body: x.stage, tag: `${id}@${x.a}:go` });
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
  const fresh = await fetchSchedule();
  const res = await callStore(env, '/tick', { now, fresh });
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
    // Festival nou: s'esborren els mòbils i l'horari del festival anterior (els preferits d'un no valen per a l'altre)
    if (this.get('fest') !== CARTEL.fest) {
      this.sql.exec('DELETE FROM subs');
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
  upsert(id, endpoint, favs, before, changes, at) {
    this.sql.exec(`INSERT INTO subs (id, endpoint, favs, before, changes, at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, favs = excluded.favs, before = excluded.before, changes = excluded.changes, at = excluded.at`,
      id, endpoint, JSON.stringify(favs), before, changes ? 1 : 0, at);
  }
  row(id) {
    const r = this.sql.exec('SELECT * FROM subs WHERE id = ?', id).toArray()[0];
    return r ? { ...r, favs: JSON.parse(r.favs), changes: !!r.changes } : null;
  }
  async fetch(req) {
    await this.ready;
    const url = new URL(req.url);
    const b = req.method === 'POST' ? await req.json() : {};
    if (url.pathname === '/sub') {
      const id = await idOf(b.endpoint);
      let { favs, before, changes } = b;
      if (b.old && b.old !== b.endpoint) {
        const oldId = await idOf(b.old), prev = this.row(oldId);
        // Renovació de la subscripció (pushsubscriptionchange): conserva les preferències del registre vell
        if (prev && favs === undefined) ({ favs, before, changes } = prev);
        this.sql.exec('DELETE FROM subs WHERE id = ?', oldId);
      }
      const cur = this.row(id);
      const nf = cleanFavs(favs), nb = cleanBefore(before), nc = changes !== false;
      if (cur && cur.endpoint === b.endpoint && JSON.stringify(cur.favs) === JSON.stringify(nf) && cur.before === nb && cur.changes === nc) return json({ ok: true, id, same: true });
      if (!cur && this.sql.exec('SELECT COUNT(*) AS n FROM subs').one().n >= MAX_SUBS) return json({ error: 'full' }, 429);
      this.upsert(id, b.endpoint, nf, nb, nc, Date.now());
      return json({ ok: true, id });
    }
    if (url.pathname === '/unsub') { this.sql.exec('DELETE FROM subs WHERE id = ?', await idOf(b.endpoint)); return json({ ok: true }); }
    if (url.pathname === '/gone') { for (const id of b.ids || []) this.sql.exec('DELETE FROM subs WHERE id = ?', id); return json({ ok: true }); }
    if (url.pathname === '/endpoint') { const r = this.row(b.id); return json({ endpoint: r ? r.endpoint : null }); }
    if (url.pathname === '/count') return json({ n: this.sql.exec('SELECT COUNT(*) AS n FROM subs').one().n });
    if (url.pathname === '/debug') return json({ last: this.get('last'), sets: (this.get('sets') || {}).stamp || null, sent: this.get('sent'),
      subs: this.sql.exec('SELECT id, before, changes, at, favs FROM subs').toArray() });
    if (url.pathname === '/sent') { this.put('sent', b); return json({ ok: true }); }

    // Horari vigent: el fresc si n'hi ha; si no, l'últim bo; si no, el cartell
    const current = fresh => {
      if (fresh) return digest(fresh.sets, fresh.stamp, fresh.notice);
      const s = this.get('sets');
      return s ? digest(s.sets, s.stamp, s.notice) : digest(CARTEL.sets, 'cartel', '');
    };

    if (url.pathname === '/tick') {
      const { now, fresh } = b;
      const sch = current(fresh);
      if (fresh) {
        const s = this.get('sets');
        if (!s || s.stamp !== fresh.stamp) this.put('sets', { sets: fresh.sets, stamp: fresh.stamp, notice: fresh.notice });
      }
      const targets = new Map();
      for (const sub of this.sql.exec('SELECT * FROM subs').toArray()) {
        const s = { ...sub, favs: JSON.parse(sub.favs), changes: !!sub.changes };
        if (dueFor(s, sch.all, now - MIN, now).length) targets.set(s.id, s.endpoint);
      }
      // Canvi de l'organització: només si l'horari publicat és més nou que el que ja s'havia vist
      if (fresh) {
        const last = this.get('last');
        if (!last) this.put('last', { stamp: sch.stamp, notice: sch.notice, key: sch.key, at: 0 });
        else if (sch.stamp !== last.stamp && !(Date.parse(sch.stamp) <= Date.parse(last.stamp))) {
          const newNotice = !!sch.notice && sch.notice !== last.notice;
          const schedChanged = last.key !== undefined ? last.key !== sch.key : !newNotice;
          const ev = {
            stamp: sch.stamp, notice: sch.notice, key: sch.key, at: now, silent: !newNotice && !schedChanged,
            title: newNotice ? 'Aviso de la organización' : 'Cambio de horario',
            body: newNotice ? sch.notice.slice(0, 180) : 'La organización ha cambiado el horario.',
          };
          this.put('last', ev);
          if (!ev.silent) for (const sub of this.sql.exec('SELECT id, endpoint FROM subs WHERE changes = 1').toArray()) targets.set(sub.id, sub.endpoint);
        }
      }
      return json({ targets: [...targets].map(([id, endpoint]) => ({ id, endpoint })) });
    }

    if (url.pathname === '/now') {
      const sub = this.row(b.id);
      if (!sub) return json({ items: [] });
      const sch = current(null);
      // 15 min: el mateix temps que Apple guarda el push si el mòbil no té cobertura (TTL 900 s); el mòbil no repeteix el que ja ha mostrat
      const items = dueFor(sub, sch.all, b.now - 15 * MIN, b.now);
      const last = this.get('last');
      if (sub.changes && last && last.at && !last.silent && b.now - last.at < 15 * MIN) items.push({ title: last.title, body: last.body, tag: 'org-' + last.stamp });
      return json({ items });
    }
    return json({ error: 'not found' }, 404);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    try {
      // Lot d'enviament (només el pot cridar el mateix servidor)
      if (req.method === 'POST' && url.pathname === '/send') {
        if (!env.SEND_KEY || req.headers.get('x-send-key') !== env.SEND_KEY) return json({ error: 'forbidden' }, 403);
        const list = (await req.json()).filter(t => t && typeof t.id === 'string' && okEndpoint(t.endpoint)).slice(0, BATCH);
        return json(await sendBatch(env, list));
      }
      if (req.method === 'POST' && (url.pathname === '/sub' || url.pathname === '/unsub')) {
        const b = await req.json();
        if (!okEndpoint(b.endpoint) || (b.old !== undefined && b.old !== '' && !okEndpoint(b.old))) return json({ error: 'endpoint' }, 400, origin);
        const r = await callStore(env, url.pathname, b);
        return json(r, r.error ? 400 : 200, origin);
      }
      // Notificació de prova: només s'envia el push (el text el posa el mòbil, que sap que l'ha demanada)
      if (req.method === 'POST' && url.pathname === '/test') {
        const b = await req.json();
        if (!okEndpoint(b.endpoint)) return json({ error: 'endpoint' }, 400, origin);
        const r = await callStore(env, '/endpoint', { id: await idOf(b.endpoint) });
        if (!r.endpoint) return json({ error: 'nosub' }, 404, origin);
        const st = await sendPush(env, r.endpoint);
        return json({ ok: st >= 200 && st < 300, status: st }, 200, origin);
      }
      // El service worker del mòbil pregunta què ha de mostrar
      if (req.method === 'GET' && url.pathname === '/now') {
        const id = String(url.searchParams.get('id') || '').slice(0, 64);
        return json(await callStore(env, '/now', { id, now: Date.now() }), 200, origin);
      }
      // Estat: quants mòbils hi ha registrats (només el número, cap dada)
      if (url.pathname === '/debug') {
        if (!env.SEND_KEY || req.headers.get('x-send-key') !== env.SEND_KEY) return json({ error: 'forbidden' }, 403);
        return json(await callStore(env, '/debug', {}));
      }
      if (url.pathname === '/') return json({ ok: true, service: 'midnight-push', mobiles: (await callStore(env, '/count', {})).n }, 200, origin);
      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'server' }, 500, origin);
    }
  },
  async scheduled(event, env, ctx) {
    // L'hora prevista de l'execució (no la real): si el cron arriba uns segons tard, no es perd ni es repeteix cap minut
    ctx.waitUntil(everyMinute(env, Math.floor(event.scheduledTime / MIN) * MIN));
  },
};
