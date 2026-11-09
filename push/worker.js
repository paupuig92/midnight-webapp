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
//
// Pla GRATUÏT de Cloudflare (04-11-2026): 100.000 peticions al dia per a tot el compte i 100.000 files escrites al dia.
// Per això: els mòbils fan UNA sola pregunta periòdica (GET /live) amb tot el que necessiten; si res no ha canviat, la
// resposta és mínima i no es llegeix la base de dades (memòria cau per parts). Els límits per IP viuen a la memòria (no
// escriuen). El cron llegeix changes.json i tasks.json de l'API de GitHub amb ETag (no gasta peticions de Cloudflare) i
// fora dels dies del festival només treballa cada 5 min. Fre d'emergència: passades SLOW_AT peticions en un dia, /live
// diu als mòbils que preguntin cada 5 min (els avisos push continuen igual).

const CARTEL = /*CARTEL*/null/*CARTEL*/;
// La web de debò (GitHub Pages amb el domini propi): pla B si l'API de GitHub falla, i «sub» dels avisos.
// (Abans era el worker midnight-app, una còpia vella del Bass que ja ningú actualitzava: retirat el 06-11 amb retira-web-vella.sh.)
const PAGES = 'https://visualcrew.midnightgroup.app/';
// Les adreces antigues (github.io i midnight-app) es mantenen perquè els mòbils que la tenien encara puguin parlar amb el servidor
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
// App tancada fora del festival (09-11-2026): CARTEL.open = [primer dia, últim dia] (inclosos, hora de Madrid).
// Sense «open»: 7 dies abans → l'endemà de l'últim dia. Fora d'aquestes dates, l'equip no pot llegir ni escriure res
// (incidències, ✓, càmeres, marques, avisos): només qui porta una sessió d'admin (capçalera x-s). Mateixa regla que l'app.
function wallDay(Y, M, D) {   // les 0:00 (hora de Madrid) d'aquell dia
  const w = Date.UTC(Y, M - 1, D), ok = [w - 2 * 3600000, w - 3600000].filter(c => wallOf(c) === w);
  return ok.length ? ok[0] : w - 3600000;
}
const OPEN = (() => {
  const ymd = s => String(s).split('-').map(Number);
  if (Array.isArray(CARTEL.open) && CARTEL.open.length === 2) { const [a, b] = CARTEL.open.map(ymd); return [wallDay(...a), wallDay(b[0], b[1], b[2] + 1)]; }
  const [Y, M, D] = CARTEL.date;
  return [wallDay(Y, M, D - 7), wallDay(Y, M, D + NDAYS + 1)];
})();
const isOpen = () => Date.now() >= OPEN[0] && Date.now() < OPEN[1];
const GATED = ['/sub', '/test', '/done', '/mc', '/mk', '/inc', '/incst', '/live', '/mclog', '/incimg'];
// Els changes.json d'abans no portaven «fest»: eren del Bass in the Park
const sameFest = c => (c.fest || 'bass-in-the-park-2026') === CARTEL.fest;

const REPO = 'paupuig92/midnight-webapp';
const ADMIN_FILES = ['docs/changes.json', 'docs/tasks.json'];
const SESSION = 12 * 3600000;
const cors = origin => ORIGINS.includes(origin)
  ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, x-s', 'vary': 'origin' }
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
// Seguretat (06-11): també fora « " » i « ` » (un color de càmera amb cometes podia injectar codi a l'app)
const mcText = (s, n) => typeof s === 'string' ? s.replace(/[\u0000-\u001f<>"`]/g, '').trim().slice(0, n) : '';
const MAX_MC = 400;
// Momentos (marques per a l'edició): qualsevol de l'equip toca «Momento» i queda l'hora, l'escenari i l'artista.
// Tots les veuen i les exporten per a DaVinci / Final Cut. Cadascú només esborra les seves (per «uid» del mòbil)
const MK_TAG = ['', 'drop', 'publico', 'artista', 'backstage', 'error'];
const okMkId = id => typeof id === 'string' && /^[\w-]{4,40}$/.test(id);
const MAX_MK = 4000;
// Incidències («Avisar a producción», des del 04-11-2026): qualsevol de l'equip n'envia una (text + foto opcional);
// tothom les veu a la pestanya Tareas i les poden donar per resoltes. Avís push als mòbils amb «Avisarme de incidencias».
const MAX_INC = 300, INC_IMG = 260000;
const okIncImg = s => typeof s === 'string' && s.length <= INC_IMG && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(s); // /9j/ = un JPEG de veritat (FF D8 FF)
function dueInc(sub, list, from, to) {
  if (!sub.inc || !list) return [];
  return list.filter(x => x.at > from && x.at <= to && !x.st).map(x => ({
    title: x.urg ? 'Incidencia URGENTE' : 'Incidencia', body: `${x.who || 'Alguien'}: ${x.txt}`.slice(0, 180), tag: `inc-${x.n}`,
  }));
}
// Límits per IP: [nom, peticions, finestra]. Generosos: a la festa molts mòbils poden compartir IP (4G).
const LIM = {
  sub: ['sub', 20, 10 * MIN], test: ['test', 10, 10 * MIN], now: ['now', 400, 10 * MIN], done: ['done', 200, 10 * MIN],
  doneall: ['doneall', 1500, 10 * MIN], mc: ['mc', 300, 10 * MIN], mcall: ['mcall', 1500, 10 * MIN], mclog: ['mclog', 300, 10 * MIN], inc: ['inc', 20, 10 * MIN], incst: ['incst', 200, 10 * MIN], incall: ['incall', 1500, 10 * MIN], mk: ['mk', 200, 10 * MIN], mkall: ['mkall', 600, 10 * MIN], incimg: ['incimg', 300, 10 * MIN], live: ['live', 600, 10 * MIN], count: ['count', 60, 10 * MIN], login: ['login', 10, 15 * MIN], admin: ['admin', 200, 10 * MIN],
};
const SLOW_AT = 70000;   // peticions al dia (de les 100.000 del pla gratuït) a partir de les quals els mòbils van a poc a poc
const LIVE_PARTS = ['inc', 'mc', 'done', 'mk'];
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
// Codi d'equip (09-11-2026, en Pau): un codi a part de la contrasenya d'admin, que NOMÉS obre l'app fora de dates
// (no deixa editar res). Sessió «c.caducitat.signatura», 14 dies. Si es canvia el codi (APP_CODE), totes deixen de valer.
const APP_SESSION = 14 * 24 * 3600000;
const signApp = (env, exp) => hmacHex(env.SEND_KEY, `app|${exp}|${env.APP_CODE}`);
async function okAppSession(env, s) {
  const m = typeof s === 'string' && s.match(/^c\.(\d{10,16})\.([0-9a-f]{64})$/);
  if (!m || !env.APP_CODE || !env.SEND_KEY) return false;
  const exp = +m[1];
  if (exp < Date.now() || exp > Date.now() + APP_SESSION + MIN) return false;
  return sameText(m[2], await signApp(env, exp));
}
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
      if (Number.isFinite(a)) all[x.id] = { n: String(x.n).trim().slice(0, 80), a, b, stage: names[sid] || sid, note: String(x.note || '').trim().slice(0, 120) };
    }
  }
  const key = Object.keys(all).sort().map(id => `${id}|${all[id].a}|${all[id].b}|${all[id].n}|${all[id].note}`).join('~');
  return { all, key, stamp, notice: typeof notice === 'string' ? notice : '' };
}
// Llegeix un fitxer de docs/. Primer, l'API de GitHub amb el token del servidor i ETag: si no ha canviat, GitHub respon 304
// (no compta al seu límit) i es fa servir la còpia de la memòria. Així el cron no gasta peticions de Cloudflare
// (abans ho llegia del worker midnight-app, que és del mateix compte: 2.880 peticions al dia). Si GitHub falla, la web.
const ghFiles = new Map();
async function readDoc(env, name) {
  if (env.GH_TOKEN) {
    try {
      const c = ghFiles.get(name);
      const r = await fetch(`https://api.github.com/repos/${REPO}/contents/docs/${name}?ref=main`, {
        headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'midnight-push', ...(c ? { 'If-None-Match': c.etag } : {}) },
        signal: AbortSignal.timeout(6000),
      });
      if (r.status === 304 && c) return { status: 200, data: c.data };
      if (r.status === 404) return { status: 404 };
      if (r.ok) {
        const data = await r.json(), etag = r.headers.get('etag');
        if (etag) ghFiles.set(name, { etag, data });
        return { status: 200, data };
      }
    } catch (e) {}
  }
  try {
    const r = await fetch(`${PAGES}${name}?t=${Date.now()}`, { cf: { cacheTtl: 0 }, signal: AbortSignal.timeout(6000) });
    return r.ok ? { status: 200, data: await r.json() } : { status: r.status };
  } catch (e) { return { status: 0 }; }
}
// Llegeix changes.json. Si GitHub no respon bé, torna null (s'usarà l'últim horari bo i no s'avisarà de cap canvi)
async function fetchSchedule(env) {
  try {
    const r = await readDoc(env, 'changes.json');
    if (r.status !== 200) return null;
    const c = r.data;
    if (!c || typeof c !== 'object' || typeof c.updated !== 'string') return null;
    if (!sameFest(c)) return { sets: CARTEL.sets, stamp: 'cartel', notice: '' };  // són d'un altre festival
    return { sets: c.sets && typeof c.sets === 'object' ? c.sets : CARTEL.sets, stamp: c.updated, notice: c.notice, noticeTeam: cleanTeam(c.noticeTeam) };
  } catch (e) { return null; }
}

// Tasques: { list: [{ id, a, b, t, p: [qui] }] } (a i b ja en ms; p = les persones a qui toca, ja resoltes per l'app)
async function fetchTasks(env) {
  try {
    const r = await readDoc(env, 'tasks.json');
    if (r.status === 404) return { list: [], stamp: 'none' };
    if (r.status !== 200) return null;
    const c = r.data;
    if (!c || typeof c !== 'object' || c.fest !== CARTEL.fest || !Array.isArray(c.list)) return { list: [], stamp: 'none' };
    const list = c.list.filter(x => x && okTaskId(x.id) && Number.isFinite(x.a) && typeof x.t === 'string' && Array.isArray(x.p))
      .slice(0, 2000).map(x => ({ id: x.id, a: x.a, b: Number.isFinite(x.b) ? x.b : 0, t: x.t.slice(0, 120), p: x.p.filter(k => cleanYo(k)) }));
    return { list, stamp: String(c.updated || '') };
  } catch (e) { return null; }
}
function dueTasks(sub, list, from, to) {
  const items = [];
  if (!sub.yo || !(sub.tb > 0) || !list) return items;
  for (const x of list) {
    if (!x.p.includes(sub.yo)) continue;
    // Cues (tasques de menys de 5 min, com tkCue() de l'app): surten a la llista però no s'avisen (recuperat el 04-11)
    if (x.b > x.a && x.b - x.a < 5 * MIN) continue;
    const pre = x.a - sub.tb * MIN;
    if (pre > from && pre <= to) items.push({ title: `Tarea · en ${sub.tb} min`, body: x.t, tag: `tk-${x.id}@${x.a}:pre` });
    if (x.a > from && x.a <= to) items.push({ title: 'Tarea · ahora', body: x.t, tag: `tk-${x.id}@${x.a}:go` });
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
    if (pre > from && pre <= to) items.push({ title: `${x.n} · en ${sub.before} min`, body: x.note ? `${x.stage} · ${x.note}` : x.stage, tag: `${id}@${x.a}:pre` });
    if (x.a > from && x.a <= to) items.push({ title: `${x.n} · empieza ahora`, body: x.note ? `${x.stage} · ${x.note}` : x.stage, tag: `${id}@${x.a}:go` });
  }
  return items;
}

// Hora daurada (pestanya Sol): CARTEL.sol = per a cada dia del festival, quan comença (t) i l'hora de la posta (set). sub.sol = minuts abans (0 = no)
function dueSol(sub, from, to) {
  const items = [];
  if (!(sub.sol > 0)) return items;
  for (const x of CARTEL.sol || []) {
    const pre = x.t - sub.sol * MIN;
    if (pre > from && pre <= to) items.push({ title: `Hora dorada · en ${sub.sol} min`, body: `Puesta de sol a las ${x.set}.`, tag: `sol@${x.t}` });
  }
  return items;
}
const cleanSol = v => [0, 10, 20, 30, 45].includes(+v) ? +v : 0;

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
// Dies del festival (des de 18 h abans de l'inici, pel muntatge): cada minut. Abans: cada 5 min (només avisos de l'organització)
const BUSY_FROM = T(CARTEL.start) - 18 * 3600000;
async function everyMinute(env, now) {
  if (now > END) return;
  if (now < BUSY_FROM && Math.floor(now / MIN) % 5) return;
  const [fresh, tasks] = await Promise.all([fetchSchedule(env), fetchTasks(env)]);
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
    this.sql.exec(`CREATE TABLE IF NOT EXISTS inc (n INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, who TEXT NOT NULL, txt TEXT NOT NULL, urg INTEGER NOT NULL, img TEXT NOT NULL, st TEXT NOT NULL, sby TEXT NOT NULL, sat INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS mk (id TEXT PRIMARY KEY, uid TEXT NOT NULL, t INTEGER NOT NULL, s TEXT NOT NULL, n TEXT NOT NULL, k TEXT NOT NULL, note TEXT NOT NULL, who TEXT NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec('DROP TABLE IF EXISTS av');  // fotos de perfil (05-11, mig dia): tretes el mateix dia per decisió d'en Pau
    this.sql.exec(`CREATE TABLE IF NOT EXISTS mclog (n INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, st TEXT NOT NULL, ssd TEXT NOT NULL, who TEXT NOT NULL, at INTEGER NOT NULL)`);
    // Columnes noves (tasques): qui és el mòbil i quants minuts abans vol l'avís de les seves tasques
    const cols = this.sql.exec('PRAGMA table_info(subs)').toArray().map(c => c.name);
    if (!cols.includes('yo')) this.sql.exec("ALTER TABLE subs ADD COLUMN yo TEXT NOT NULL DEFAULT ''");
    if (!cols.includes('tb')) this.sql.exec('ALTER TABLE subs ADD COLUMN tb INTEGER NOT NULL DEFAULT 10');
    // Equip del mòbil (prod / mkt / video / foto): els avisos de l'organització poden anar només a un equip
    if (!cols.includes('team')) this.sql.exec("ALTER TABLE subs ADD COLUMN team TEXT NOT NULL DEFAULT ''");
    // Vol rebre les incidències (per defecte, Producció)
    if (!cols.includes('inc')) this.sql.exec('ALTER TABLE subs ADD COLUMN inc INTEGER NOT NULL DEFAULT 0');
    if (!cols.includes('sol')) this.sql.exec('ALTER TABLE subs ADD COLUMN sol INTEGER NOT NULL DEFAULT 0');
    // Festival nou: s'esborren els mòbils i l'horari del festival anterior (els preferits d'un no valen per a l'altre)
    if (this.get('fest') !== CARTEL.fest) {
      this.sql.exec('DELETE FROM subs');
      this.sql.exec('DELETE FROM done');
      this.sql.exec('DELETE FROM mc');
      this.sql.exec('DELETE FROM mclog');
      this.sql.exec('DELETE FROM inc');
      this.sql.exec('DELETE FROM mk');
      this.sql.exec("DELETE FROM kv WHERE k <> 'imported'");
      this.put('fest', CARTEL.fest);
    }
    // Per trobar de pressa les incidències noves (sense índex, el cron llegia totes les files cada minut)
    this.sql.exec('CREATE INDEX IF NOT EXISTS inc_at ON inc (at)');
    this.sql.exec('DROP TABLE IF EXISTS rl');   // els límits per IP ara són a la memòria
    this.rl = new Map();
    // /live: «ver» canvia amb cada canvi de dades; «cache» guarda la resposta de cada part fins que canvia
    this.boot = Date.now().toString(36); this.ver = 0; this.cache = {};
    // Comptador de peticions del dia (UTC, com el pla gratuït). Es desa cada 100 per no gastar escriptures
    const q = this.get('quota') || {};
    this.qDay = q.day || ''; this.qN = q.n || 0;
    this.ready = state.blockConcurrencyWhile(() => this.importOld());
  }
  touch(part) { this.ver++; delete this.cache[part]; }
  // Límit d'una taula sense llegir-la sencera: MAX(rowid) és una sola fila i mai és més petit que el nombre de files
  full(table, max) {
    if (this.sql.exec(`SELECT MAX(rowid) AS m FROM ${table}`).one().m < max) return false;
    return this.sql.exec(`SELECT COUNT(*) AS n FROM ${table}`).one().n >= max;
  }
  quota() {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== this.qDay) { this.qDay = day; this.qN = 0; }
    if (++this.qN % 100 === 0) this.put('quota', { day, n: this.qN });
    return this.qN;
  }
  part(name) {
    if (this.cache[name]) return this.cache[name];
    let v;
    if (name === 'mk') v = this.sql.exec('SELECT id, uid, t, s, n, k, note, who FROM mk ORDER BY t').toArray();
    else if (name === 'mc') {
      v = {};
      for (const r of this.sql.exec('SELECT id, st, ssd, note, who, at, since FROM mc').toArray()) v[r.id] = { st: r.st, ssd: r.ssd, note: r.note, who: r.who, at: r.at, since: r.since };
    } else if (name === 'inc') {
      v = this.sql.exec("SELECT n, at, who, txt, urg, img <> '' AS img, st, sby, sat FROM inc ORDER BY n DESC LIMIT 60").toArray()
        .map(r => ({ ...r, urg: !!r.urg, img: !!r.img }));
    } else if (name === 'done') {
      v = {};
      for (const r of this.sql.exec('SELECT who, id, at FROM done').toArray()) (v[r.who] = v[r.who] || {})[r.id] = r.at;
    }
    return (this.cache[name] = v);
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
  upsert(id, endpoint, favs, before, changes, at, yo = '', tb = 10, team = '', inc = 0, sol = 0) {
    this.sql.exec(`INSERT INTO subs (id, endpoint, favs, before, changes, at, yo, tb, team, inc, sol) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, favs = excluded.favs, before = excluded.before, changes = excluded.changes, at = excluded.at, yo = excluded.yo, tb = excluded.tb, team = excluded.team, inc = excluded.inc, sol = excluded.sol`,
      id, endpoint, JSON.stringify(favs), before, changes ? 1 : 0, at, yo, tb, team, inc ? 1 : 0, sol);
  }
  // Límit de peticions (finestra fixa): true si encara en queden
  // A la memòria del Durable Object (n'hi ha un de sol): no escriu res a la base de dades. Si es reinicia, es comença de zero
  hit(k, max, win) {
    const now = Date.now();
    if (this.rl.size > 5000) for (const [key, r] of this.rl) if (r.reset <= now) this.rl.delete(key);
    const r = this.rl.get(k);
    if (!r || r.reset <= now) { this.rl.set(k, { n: 1, reset: now + win }); return true; }
    if (r.n >= max) return false;
    r.n++;
    return true;
  }
  incSince(t) { return this.sql.exec('SELECT n, at, who, txt, urg, st FROM inc WHERE at > ?', t).toArray(); }
  row(id) {
    const r = this.sql.exec('SELECT * FROM subs WHERE id = ?', id).toArray()[0];
    return r ? { ...r, favs: JSON.parse(r.favs), changes: !!r.changes } : null;
  }
  async fetch(req) {
    await this.ready;
    const url = new URL(req.url);
    const b = req.method === 'POST' ? await req.json() : {};
    const used = this.quota();
    if (Array.isArray(b._rl)) {
      const [k, max, win] = b._rl;
      if (!this.hit(String(k).slice(0, 80), +max, +win)) return json({ error: 'slow' }, 429);
      if (url.pathname === '/rl') return json({ ok: true });
    }
    if (url.pathname === '/sub') {
      const id = await idOf(b.endpoint);
      let { favs, before, changes, yo, tb, team, inc, sol } = b;
      if (b.old && b.old !== b.endpoint) {
        const oldId = await idOf(b.old), prev = this.row(oldId);
        // Renovació de la subscripció (pushsubscriptionchange): conserva les preferències del registre vell
        if (prev && favs === undefined) ({ favs, before, changes, yo, tb, team, inc, sol } = prev);
        this.sql.exec('DELETE FROM subs WHERE id = ?', oldId);
      }
      const cur = this.row(id);
      const nf = cleanFavs(favs), nb = cleanBefore(before), nc = changes !== false;
      // Un mòbil antic (sense «yo») conserva el que ja hi havia
      const ny = yo === undefined ? (cur ? cur.yo : '') : cleanYo(yo), nt = tb === undefined ? (cur ? cur.tb : 10) : cleanBefore(tb);
      const ne = team === undefined ? (cur ? cur.team || '' : '') : cleanTeam(team);
      // Un mòbil sense la versió nova (no envia «inc»): Producció rep les incidències
      const ni = inc === undefined ? (cur ? cur.inc || 0 : ne === 'prod' ? 1 : 0) : inc ? 1 : 0;
      const ns = sol === undefined ? (cur ? cur.sol || 0 : 0) : cleanSol(sol);
      if (cur && cur.endpoint === b.endpoint && JSON.stringify(cur.favs) === JSON.stringify(nf) && cur.before === nb && cur.changes === nc && cur.yo === ny && cur.tb === nt && (cur.team || '') === ne && (cur.inc || 0) === ni && (cur.sol || 0) === ns) return json({ ok: true, id, same: true });
      if (!cur && this.sql.exec('SELECT COUNT(*) AS n FROM subs').one().n >= MAX_SUBS) return json({ error: 'full' }, 429);
      this.upsert(id, b.endpoint, nf, nb, nc, Date.now(), ny, nt, ne, ni, ns);
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
        if (this.full('done', MAX_DONE)) return json({ error: 'full' }, 429);
        this.sql.exec('INSERT INTO done (who, id, at) VALUES (?, ?, ?) ON CONFLICT(who, id) DO NOTHING', who, b.id, Date.now());
      } else this.sql.exec('DELETE FROM done WHERE who = ? AND id = ?', who, b.id);
      this.touch('done');
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
      if (!st && !ssd && !note) { this.sql.exec('DELETE FROM mc WHERE id = ?', b.id); this.touch('mc'); return json({ ok: true }); }
      if (!this.sql.exec('SELECT id FROM mc WHERE id = ?', b.id).toArray().length && this.full('mc', MAX_MC)) return json({ error: 'full' }, 429);
      this.sql.exec('INSERT INTO mc (id, st, ssd, note, who, at, since) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET st = excluded.st, ssd = excluded.ssd, note = excluded.note, who = excluded.who, at = excluded.at, since = excluded.since',
        b.id, st, ssd, note, who, now, since);
      this.touch('mc');
      return json({ ok: true, mc: { st, ssd, note, who, at: now, since } });
    }
    // Un Momento: es crea o es canvia (etiqueta, nota). del = s'esborra (només el mòbil que el va fer)
    if (url.pathname === '/mk') {
      if (!okMkId(b.id) || !okMkId(b.uid)) return json({ error: 'bad' }, 400);
      // Seguretat (06-11): uid és la clau secreta del mòbil; es guarda (i es mostra) només el seu resum
      const hid = 'h' + (await hmacHex('mk', b.uid)).slice(0, 24);
      const old = this.sql.exec('SELECT uid FROM mk WHERE id = ?', b.id).toArray()[0];
      if (old && old.uid !== hid && old.uid !== b.uid) return json({ error: 'bad' }, 400);
      if (b.del) { this.sql.exec('DELETE FROM mk WHERE id = ?', b.id); this.touch('mk'); return json({ ok: true }); }
      const t = +b.t;
      if (!Number.isFinite(t) || Math.abs(t - Date.now()) > 400 * 86400000) return json({ error: 'bad' }, 400);
      if (!old && this.full('mk', MAX_MK)) return json({ error: 'full' }, 429);
      this.sql.exec('INSERT INTO mk (id, uid, t, s, n, k, note, who, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET t = excluded.t, s = excluded.s, n = excluded.n, k = excluded.k, note = excluded.note, who = excluded.who, at = excluded.at',
        b.id, hid, Math.round(t), mcText(b.s, 40), mcText(b.n, 120), MK_TAG.includes(b.k) ? b.k : '', mcText(b.note, 140), mcText(b.who, 30), Date.now());
      this.touch('mk');
      return json({ ok: true });
    }
    if (url.pathname === '/mkall') return json({ mk: this.part('mk') });
    if (url.pathname === '/mcall') return json({ mc: this.part('mc') });
    // Una sola pregunta periòdica de l'app: p = les parts que vol (inc, mc, done, mk), v = la versió que ja té.
    // Si no ha canviat res, només torna { v } (sense llegir la base de dades)
    if (url.pathname === '/live') {
      const want = String(b.p || '').split(',').filter(x => LIVE_PARTS.includes(x));
      const v = `${this.boot}.${this.ver}`, out = { v, fest: CARTEL.fest };  // fest: l'app ignora un servidor d'un altre festival
      if (used > SLOW_AT) out.slow = 1;
      if (b.v === v) return json(out);
      for (const k of want) out[k] = this.part(k);
      return json(out);
    }
    if (url.pathname === '/mclogall') {
      return json({ log: this.sql.exec('SELECT id, st, ssd, who, at FROM mclog ORDER BY n DESC LIMIT 80').toArray() });
    }
    // Incidències: una de nova (text obligatori; foto JPEG petita opcional)
    if (url.pathname === '/inc') {
      const txt = mcText(b.txt, 300), who = mcText(b.who, 30), img = okIncImg(b.img) ? b.img : '';
      if (!txt) return json({ error: 'bad' }, 400);
      const now = Date.now();
      this.sql.exec('INSERT INTO inc (at, who, txt, urg, img, st, sby, sat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', now, who, txt, b.urg ? 1 : 0, img, '', '', 0);
      this.sql.exec('DELETE FROM inc WHERE n <= (SELECT MAX(n) - ? FROM inc)', MAX_INC);
      this.touch('inc');
      return json({ ok: true, n: this.sql.exec('SELECT MAX(n) AS n FROM inc').one().n, at: now });
    }
    // Resolta (st = 'ok') o tornar-la a obrir (st = '')
    if (url.pathname === '/incst') {
      const n = Math.floor(+b.n);
      if (!(n > 0)) return json({ error: 'bad' }, 400);
      const st = b.st === 'ok' ? 'ok' : '';
      this.sql.exec('UPDATE inc SET st = ?, sby = ?, sat = ? WHERE n = ?', st, st ? mcText(b.who, 30) : '', st ? Date.now() : 0, n);
      this.touch('inc');
      return json({ ok: true });
    }
    // Les últimes 60 (sense la foto: va a part, només si algú l'obre)
    if (url.pathname === '/incall') return json({ inc: this.part('inc') });
    // La foto com a JPEG de veritat (no JSON): el mòbil la guarda a la memòria cau i no la torna a demanar mai més
    if (url.pathname === '/incimg') {
      const r = this.sql.exec('SELECT img FROM inc WHERE n = ?', Math.floor(+url.searchParams.get('n')) || 0).toArray()[0];
      if (!r || !r.img) return new Response('', { status: 404 });
      const bin = atob(r.img.slice(r.img.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=31536000, immutable' } });
    }
    // Vista global: totes les ✓ ({ qui: { tasca: hora } })
    if (url.pathname === '/doneall') return json({ done: this.part('done') });

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
      if (b.tasks) {
        if (this.tasksStamp === undefined) this.tasksStamp = (this.get('tasks') || {}).stamp;
        if (b.tasks.stamp !== this.tasksStamp) { this.put('tasks', b.tasks); this.tasksStamp = b.tasks.stamp; }
      }
      const tasks = (b.tasks || this.get('tasks') || {}).list || [];
      if (fresh) {
        const s = this.get('sets');
        if (!s || s.stamp !== fresh.stamp) this.put('sets', { sets: fresh.sets, stamp: fresh.stamp, notice: fresh.notice, noticeTeam: fresh.noticeTeam || '' });
      }
      const targets = new Map();
      const incs = this.incSince(now - MIN);
      for (const sub of this.sql.exec('SELECT * FROM subs').toArray()) {
        const s = { ...sub, favs: JSON.parse(sub.favs), changes: !!sub.changes };
        if (dueFor(s, sch.all, now - MIN, now).length || dueTasks(s, tasks, now - MIN, now).length || dueInc(s, incs, now - MIN, now).length || dueSol(s, now - MIN, now).length) targets.set(s.id, s.endpoint);
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
            title: newNotice ? 'Aviso de la organización' : 'Cambio de horario',
            body: newNotice ? sch.notice.slice(0, 180) : 'La organización ha cambiado el horario.',
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
      const items = [...dueFor(sub, sch.all, b.now - 15 * MIN, b.now), ...dueTasks(sub, (this.get('tasks') || {}).list, b.now - 15 * MIN, b.now), ...dueInc(sub, this.incSince(b.now - 15 * MIN), b.now - 15 * MIN, b.now), ...dueSol(sub, b.now - 15 * MIN, b.now)];
      const last = this.get('last');
      if (sub.changes && last && last.at && !last.silent && b.now - last.at < 15 * MIN) {
        if (!last.team || sub.team === last.team) items.push({ title: last.title, body: last.body, tag: 'org-' + last.stamp });
        else if (last.sched) items.push({ title: 'Cambio de horario', body: 'La organización ha cambiado el horario.', tag: 'org-' + last.stamp });
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
    // Seguretat (06-11): amb IPv6 cada mòbil/servidor té milers d'adreces; el límit es compta per bloc /64
    const ip0 = req.headers.get('cf-connecting-ip') || 'x';
    const ip = ip0.includes(':') ? ip0.split(':').slice(0, 4).join(':') + '::/64' : ip0;
    const lim = name => ({ _rl: [`${LIM[name][0]}:${ip}`, LIM[name][1], LIM[name][2]] });
    // Les crides de l'app no poden ser enormes
    const body = async () => {
      const t = await req.text();
      if (t.length > 600000) throw Object.assign(new Error('big'), { big: true });
      return JSON.parse(t || '{}');
    };
    try {
      // Fora de les dates del festival: només l'admin
      if (GATED.includes(url.pathname) && !isOpen()) {
        const s = req.headers.get('x-s') || (url.pathname === '/incimg' && url.searchParams.get('s'));  // una <img> no pot portar capçaleres: la foto, amb ?s=
        if (!(await okSession(env, s)) && !(await okAppSession(env, s))) return json({ error: 'closed', open: OPEN[0] }, 403, origin);
      }
      // Pantalla «La app se abre el…»: un sol camp. El codi d'equip dona una sessió que només obre l'app;
      // la contrasenya d'admin, la sessió d'admin de sempre. Mateixos límits que el login d'admin (per IP + global)
      if (req.method === 'POST' && url.pathname === '/gate/login') {
        const b = await body(), pw = String(b.pw || '');
        const rl = await callStore(env, '/rl', lim('login'));
        if (rl.error) return json(rl, 429, origin);
        const rlg = await callStore(env, '/rl', { _rl: ['login:all', 100, 60 * MIN] });
        if (rlg.error) return json(rlg, 429, origin);
        if (env.APP_CODE && await sameText(pw, env.APP_CODE)) { const exp = Date.now() + APP_SESSION; return json({ session: `c.${exp}.${await signApp(env, exp)}`, role: 'team', exp }, 200, origin); }
        if (env.ADMIN_PW && await sameText(pw, env.ADMIN_PW)) { const exp = Date.now() + SESSION; return json({ session: `${exp}.${await sign(env, exp)}`, role: 'admin', exp }, 200, origin); }
        return json({ error: 'pw' }, 401, origin);
      }
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
      // Momentos (marques per a l'edició)
      if (req.method === 'POST' && url.pathname === '/mk') {
        const r = await callStore(env, '/mk', { ...(await body()), ...lim('mk') });
        return json(r, errStatus(r), origin);
      }
      if (req.method === 'GET' && url.pathname === '/mk') { const r = await callStore(env, '/mkall', lim('mkall')); return json(r, errStatus(r), origin); }
      if (req.method === 'GET' && url.pathname === '/mc') { const r = await callStore(env, '/mcall', lim('mcall')); return json(r, errStatus(r), origin); }
      if (req.method === 'GET' && url.pathname === '/mclog') { const r = await callStore(env, '/mclogall', lim('mclog')); return json(r, errStatus(r), origin); }
      // Incidències («Avisar a producción»)
      if (req.method === 'POST' && (url.pathname === '/inc' || url.pathname === '/incst')) {
        const r = await callStore(env, url.pathname, { ...(await body()), ...lim(url.pathname.slice(1)) });
        return json(r, errStatus(r), origin);
      }
      if (req.method === 'GET' && url.pathname === '/inc') { const r = await callStore(env, '/incall', lim('incall')); return json(r, errStatus(r), origin); }
      // La foto: el Durable Object ja dona el JPEG; aquí només es passa (el límit es mira abans)
      if (req.method === 'GET' && url.pathname === '/incimg') {
        const rl = await callStore(env, '/rl', lim('incimg'));
        if (rl.error) return json(rl, 429, origin);
        const r = await store(env).fetch('https://store/incimg?n=' + encodeURIComponent(String(url.searchParams.get('n') || '').slice(0, 12)));
        return new Response(r.body, { status: r.status, headers: { 'content-type': 'image/jpeg', 'cache-control': r.status === 200 ? 'public, max-age=31536000, immutable' : 'no-store', ...cors(origin) } });
      }
      // Una sola pregunta periòdica (incidències, càmeres, ✓, momentos)
      if (req.method === 'GET' && url.pathname === '/live') {
        const r = await callStore(env, '/live', { p: String(url.searchParams.get('p') || '').slice(0, 40), v: String(url.searchParams.get('v') || '').slice(0, 40), ...lim('live') });
        return json(r, errStatus(r), origin);
      }
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
          // A més del límit per IP, un límit global: 100 intents/hora entre tothom (frena qui canvia d'IP)
          const rlg = await callStore(env, '/rl', { _rl: ['login:all', 100, 60 * MIN] });
          if (rlg.error) return json(rlg, 429, origin);
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
