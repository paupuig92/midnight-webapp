// Midnight · servidor de notificacions (Cloudflare Worker, pla gratuït).
//
// Cada mòbil que activa les notificacions es registra amb POST /sub (els seus artistes i quants minuts abans vol l'avís).
// Cada minut (cron) el servidor:
//   1. llegeix l'horari publicat (docs/changes.json o, si no n'hi ha, docs/cartel.json),
//   2. envia un push als mòbils que tenen un artista que comença d'aquí a X minuts o ara,
//   3. si l'organització ha publicat un canvi o un avís, envia un push als que tenen activat «cambios».
// Els push van sense contingut (així no cal xifrar-los): en rebre'l, el service worker de l'app demana GET /now
// i el servidor li torna què ha de mostrar en aquell moment.
//
// Dades (KV «SUBS»): 'subs' = { id: { endpoint, favs, before, changes, at } }, 'last' = { stamp, notice, at, title, body },
// 'test:<id>' = prova demanada (caduca sola).
// Secrets: VAPID_JWK (clau privada, JSON) · Text: VAPID_PUBLIC (clau pública, base64url).

const PAGES = 'https://paupuig92.github.io/midnight-webapp/';
const ORIGINS = ['https://paupuig92.github.io', 'http://localhost:8765', 'http://127.0.0.1:8765'];
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|googleapis\.com)$/;
const MIN = 60000;

// Hora local de Montmeló → UTC (igual que T() de l'app; la nit del 24 al 25 canvia l'hora a les 3:00)
function T(s) {
  const m = String(s).match(/^(\d{1,2}):(\d{2})([ab]?)$/);
  if (!m) return NaN;
  const h = +m[1], mi = +m[2], f = m[3];
  if (h > 23 || mi > 59) return NaN;
  let day, off;
  if (h >= 6) { day = 24; off = 2; }
  else if (h < 2 || (h === 2 && f === 'a')) { day = 25; off = 2; }
  else { day = 25; off = 1; }
  return Date.UTC(2026, 9, day, h - off, mi);
}

const json = (data, status = 200, origin = '') => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(origin) },
});
const cors = origin => ORIGINS.includes(origin)
  ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'vary': 'origin' }
  : {};
const idOf = async endpoint => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))]
  .slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');

async function getSubs(env) { return (await env.SUBS.get('subs', 'json')) || {}; }
async function putSubs(env, subs) { await env.SUBS.put('subs', JSON.stringify(subs)); }

// Horari vigent
async function schedule() {
  const bust = `?t=${Date.now()}`;
  const cartel = await (await fetch(PAGES + 'cartel.json' + bust, { cf: { cacheTtl: 0 } })).json();
  let changes = null;
  const r = await fetch(PAGES + 'changes.json' + bust, { cf: { cacheTtl: 0 } });
  if (r.ok) changes = await r.json();
  const sets = changes && changes.sets && typeof changes.sets === 'object' ? changes.sets : cartel.sets;
  const names = Object.fromEntries(cartel.stages.map(s => [s.id, s.name]));
  const all = {};
  for (const [sid, list] of Object.entries(sets || {})) {
    if (!Array.isArray(list)) continue;
    for (const x of list) {
      if (!x || typeof x.id !== 'string' || !x.n) continue;
      const a = T(x.a);
      if (Number.isFinite(a)) all[x.id] = { n: String(x.n).trim(), a, stage: names[sid] || sid };
    }
  }
  return { all, stamp: changes ? String(changes.updated || '') : 'cartel', notice: changes && typeof changes.notice === 'string' ? changes.notice : '' };
}

// Què toca avisar a un mòbil en la finestra (from, to]
function dueFor(sub, all, from, to) {
  const items = [];
  for (const id of sub.favs || []) {
    const x = all[id];
    if (!x) continue;
    if (sub.before > 0) {
      const pre = x.a - sub.before * MIN;
      if (pre > from && pre <= to) items.push({ title: `${x.n} empieza en ${sub.before} min`, body: x.stage, tag: `${id}:pre` });
    }
    if (sub.before > 0 && x.a > from && x.a <= to) items.push({ title: `${x.n} empieza ahora`, body: x.stage, tag: `${id}:go` });
  }
  return items;
}

// Push sense contingut amb VAPID (JWT ES256)
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let keyCache = null;
async function vapidKey(env) {
  if (!keyCache) keyCache = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return keyCache;
}
async function sendPush(env, endpoint) {
  const aud = new URL(endpoint).origin;
  const enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: PAGES })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), new TextEncoder().encode(unsigned));
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { TTL: '900', Urgency: 'high', Authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`, 'Content-Length': '0' },
  });
  return r.status;
}

// Cada minut
async function everyMinute(env) {
  const now = Date.now();
  const [subs, sch, last] = await Promise.all([getSubs(env), schedule(), env.SUBS.get('last', 'json')]);
  const targets = new Set();
  for (const [id, sub] of Object.entries(subs)) if (dueFor(sub, sch.all, now - MIN, now).length) targets.add(id);

  // Canvi de l'organització (horari o avís): es desa i s'avisa a qui ho vulgui
  if (!last) await env.SUBS.put('last', JSON.stringify({ stamp: sch.stamp, notice: sch.notice, at: 0 }));
  else if (last.stamp !== sch.stamp) {
    const newNotice = sch.notice && sch.notice !== last.notice;
    const ev = {
      stamp: sch.stamp, notice: sch.notice, at: now,
      title: newNotice ? 'Aviso de la organización' : 'Cambio de horario',
      body: newNotice ? sch.notice.slice(0, 180) : sch.stamp === 'cartel' ? 'Vuelve el horario del cartel.' : 'La organización ha cambiado el horario.',
    };
    await env.SUBS.put('last', JSON.stringify(ev));
    for (const [id, sub] of Object.entries(subs)) if (sub.changes) targets.add(id);
  }

  let gone = false;
  await Promise.all([...targets].map(async id => {
    try {
      const st = await sendPush(env, subs[id].endpoint);
      if (st === 404 || st === 410) { delete subs[id]; gone = true; }  // el mòbil ja no està subscrit
    } catch (e) {}
  }));
  if (gone) await putSubs(env, subs);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    try {
      // Registrar o actualitzar un mòbil
      if (req.method === 'POST' && url.pathname === '/sub') {
        const b = await req.json();
        const ep = String(b.endpoint || '');
        if (!ep.startsWith('https://') || !PUSH_HOSTS.test(new URL(ep).hostname)) return json({ error: 'endpoint' }, 400, origin);
        const favs = Array.isArray(b.favs) ? b.favs.filter(f => typeof f === 'string' && /^[\w-]{1,40}$/.test(f)).slice(0, 150) : [];
        const before = [0, 5, 10, 15, 20, 30].includes(+b.before) ? +b.before : 10;
        const id = await idOf(ep);
        const subs = await getSubs(env);
        if (Object.keys(subs).length >= 2000 && !subs[id]) return json({ error: 'full' }, 429, origin);
        subs[id] = { endpoint: ep, favs, before, changes: b.changes !== false, at: Date.now() };
        await putSubs(env, subs);
        return json({ ok: true, id }, 200, origin);
      }
      // Donar-se de baixa
      if (req.method === 'POST' && url.pathname === '/unsub') {
        const b = await req.json();
        const id = await idOf(String(b.endpoint || ''));
        const subs = await getSubs(env);
        if (subs[id]) { delete subs[id]; await putSubs(env, subs); }
        return json({ ok: true }, 200, origin);
      }
      // Notificació de prova (des de Configuración)
      if (req.method === 'POST' && url.pathname === '/test') {
        const b = await req.json();
        const id = await idOf(String(b.endpoint || ''));
        const subs = await getSubs(env);
        if (!subs[id]) return json({ error: 'nosub' }, 404, origin);
        await env.SUBS.put('test:' + id, '1', { expirationTtl: 120 });
        const st = await sendPush(env, subs[id].endpoint);
        return json({ ok: st >= 200 && st < 300, status: st }, 200, origin);
      }
      // El service worker del mòbil pregunta què ha de mostrar
      if (req.method === 'GET' && url.pathname === '/now') {
        const id = String(url.searchParams.get('id') || '').slice(0, 64);
        const subs = await getSubs(env);
        const sub = subs[id];
        if (!sub) return json({ items: [] }, 200, origin);
        const now = Date.now();
        const items = [];
        if (await env.SUBS.get('test:' + id)) {
          items.push({ title: 'Midnight · prueba', body: 'Las notificaciones llegan también con el móvil bloqueado ✓', tag: 'prueba' });
          await env.SUBS.delete('test:' + id);
        }
        const sch = await schedule();
        items.push(...dueFor(sub, sch.all, now - 3 * MIN, now));
        const last = await env.SUBS.get('last', 'json');
        if (sub.changes && last && last.at && now - last.at < 4 * MIN) items.push({ title: last.title, body: last.body, tag: 'org-' + last.stamp });
        return json({ items }, 200, origin);
      }
      if (url.pathname === '/') return json({ ok: true, service: 'midnight-push' }, 200, origin);
      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'server' }, 500, origin);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(everyMinute(env));
  },
};
