#!/usr/bin/env python3
"""Genera la carpeta docs/ (la que publica GitHub Pages) a partir de index.html.

index.html és la versió de l'artifact de Claude: no porta <html>/<head>/<body>
perquè la plataforma els hi posa. Aquí s'hi afegeixen, junt amb la icona,
el manifest i el service worker perquè funcioni sense connexió.

Ús:  python3 build_web.py
"""
import base64
import hashlib
import json
import os
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "docs"

src = (ROOT / "index.html").read_text(encoding="utf-8")

# Editor de l'organització: el token de GitHub va xifrat amb la contrasenya. Ni el token ni la contrasenya es mostren mai.
#   clau        = PBKDF2-SHA256(contrasenya, sal, ITER) → 32 bytes (un sol bloc: costa el mateix a l'iPhone que a qui la vulgui endevinar)
#   comprovació = HMAC-SHA256(clau, "check")
#   flux        = HMAC-SHA256(clau, nonce ‖ comptador); nonce = SHA-256("nonce" ‖ token)[:16], així un token nou mai reutilitza el flux
import hmac
CONF = pathlib.Path.home() / ".config" / "midnight-webapp"
ITER = 1_500_000
tok_f, pw_f, salt_f = CONF / "github-token", CONF / "admin-password", CONF / "admin-salt"
admin = "null"
if tok_f.is_file() and pw_f.is_file():
    tok = tok_f.read_bytes().strip()
    pw = pw_f.read_bytes().strip()
    if not salt_f.is_file():
        salt_f.write_bytes(os.urandom(16))
        salt_f.chmod(0o600)
    salt = salt_f.read_bytes()
    key = hashlib.pbkdf2_hmac("sha256", pw, salt, ITER, dklen=32)
    nonce = hashlib.sha256(b"nonce" + tok).digest()[:16]
    stream = b"".join(hmac.new(key, nonce + i.to_bytes(4, "big"), hashlib.sha256).digest() for i in range((len(tok) + 31) // 32))
    b64 = lambda b: base64.b64encode(b).decode()
    admin = json.dumps({"salt": b64(salt), "iter": ITER, "nonce": b64(nonce),
                        "ct": b64(bytes(a ^ b for a, b in zip(tok, stream))),
                        "check": b64(hmac.new(key, b"check", hashlib.sha256).digest())})
    print("Editor de l'organització: activat")
else:
    print("Editor de l'organització: desactivat (falta", "la contrasenya" if tok_f.is_file() else "el token", "a", CONF, ")")
src = src.replace("/*ADMIN*/null/*ADMIN*/", admin)
# Servidor de notificacions (push/instala.sh escriu push.json). Sense push.json, l'app només avisa amb l'app oberta
push_f = CONF / "push.json"
push = json.loads(push_f.read_text()) if push_f.is_file() else None
src = src.replace("/*PUSH*/null/*PUSH*/", json.dumps({"url": push["url"], "public": push["public"]}) if push else "null")
print("Notificacions amb el mòbil bloquejat:", "activades (" + push["url"] + ")" if push else "desactivades (falta instal·lar el servidor: push/instala.sh)")
# Data de la versió (surt sota «Actualizar la app»)
import datetime
# La data és la de l'últim canvi dels fitxers de l'app (no l'hora del build): així, si no canvia res,
# la versió és la mateixa i els mòbils no es tornen a baixar l'app ni surt «Hay una versión nueva»
srcs = [ROOT / "index.html", ROOT / "build_web.py", *(ROOT / "img").iterdir(), *(ROOT / "icons").glob("icon-*.png")]
stamp_t = max(f.stat().st_mtime for f in srcs if f.is_file())
push_f2 = CONF / "push.json"
if push_f2.is_file():
    stamp_t = max(stamp_t, push_f2.stat().st_mtime)
src = src.replace("const BUILD = '';", "const BUILD = '" + datetime.datetime.fromtimestamp(stamp_t).strftime("%d/%m %H:%M") + "';")
head, body = src.split("</style>", 1)
head += "</style>"
# Treu la meta pròpia de l'artifact i el viewport (es posen a sota)
head = "\n".join(l for l in head.splitlines()
                 if 'name="claude:viewport-fit-sides"' not in l and 'name="viewport"' not in l)

# Dades del festival (bloc FEST d'index.html) → docs/cartel.json, per al servidor de notificacions
import re
def js_to_json(block):
    """Converteix un literal JS senzill (com el bloc FEST) a JSON."""
    block = re.sub(r"^\s*//.*$", "", block, flags=re.M)                               # comentaris de línia
    block = re.sub(r"(?<=[,\[\]{}0-9'\"])[ \t]*//[^\n]*", "", block)                # comentaris al final de línia
    block = re.sub(r"'((?:[^'\\]|\\.)*)'", lambda m: json.dumps(m.group(1)), block)  # cometes simples
    block = re.sub(r'([{,]\s*)(\w+)\s*:', r'\1"\2":', block)                        # claus
    block = re.sub(r",(\s*[\]}])", r"\1", block)                                      # comes finals
    return json.loads(block)
fb = src[src.index("/* ==== FESTIVAL ==== */"):src.index("/* ==== /FESTIVAL ==== */")]
fb = fb[fb.index("const FEST = ") + len("const FEST = "):fb.rindex("};") + 1]
FEST = js_to_json(fb)

# Colors i lletres del festival ja al <head>: si no, el primer instant es veuen els colors per defecte (els del Bass)
def _css(v): return str(v).replace("<", "")
_vars = {"--accent": FEST.get("accent"), "--accent-rgb": FEST.get("accentRgb"), "--accent-dim": FEST.get("accentDim"),
         "--accent-deep": FEST.get("accentDeep"), "--accent-ink": FEST.get("accentInk"), **FEST.get("theme", {})}
BG = _css(FEST.get("theme", {}).get("--bg", "#040704"))
FESTCSS = "<style data-fest>/* colors i lletres del festival */\n" + "".join(
    f'@font-face{{font-family:"{_css(f["family"])}";src:url("img/{_css(f["file"])}");font-weight:{_css(f.get("weight", 400))};font-display:swap}}\n'
    for f in FEST.get("fonts", [])) + ":root{" + ";".join(f"{k}:{_css(v)}" for k, v in _vars.items() if v) + "}</style>"

page = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="{BG}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<!-- «black» i no «black-translucent»: amb la barra translúcida, l'iOS 26 difumina sempre la franja de dalt (no hi ha manera de treure-ho des de la web) -->
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="Midnight">
<meta name="description" content="Horario en directo · Midnight">
<script>/*LANGREDIRECT*/</script>
<script>/* iPhone: Safari no fa cas de user-scalable=no, així es bloqueja la pinça */
document.addEventListener('gesturestart', e => e.preventDefault());</script>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" sizes="32x32" href="icon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<style>
/* El que a l'artifact posa la plataforma */
:root {{ padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }}
body {{ margin: 0; }}
img {{ max-width: 100%; }}
[hidden] {{ display: none !important; }}
</style>
{head}
{FESTCSS}
</head>
<body>
{body}
<script>
// Sense connexió: guarda l'app al mòbil la primera vegada que s'obre
if ('serviceWorker' in navigator) {{
  const had = !!navigator.serviceWorker.controller;
  let reg = null, lastCheck = Date.now(), lastShown = Date.now(), lastTouch = 0;
  navigator.serviceWorker.register('sw.js').then(r => {{ reg = r; }}).catch(() => {{}});
  // Busca versió nova: cada 2 min amb l'app a la vista i en tornar-hi (l'iPhone reprèn l'app sense recarregar-la).
  // Només baixa sw.js (uns pocs KB, i res si no ha canviat): gasta molt poca bateria i dades
  const check = min => {{
    if (document.hidden || !reg || Date.now() - lastCheck < min) return;
    lastCheck = Date.now(); reg.update().catch(() => {{}});
  }};
  setInterval(() => check(110000), 120000);
  document.addEventListener('visibilitychange', () => {{ if (!document.hidden) {{ lastShown = Date.now(); check(30000); }} }});
  for (const ev of ['pointerdown', 'keydown', 'scroll']) addEventListener(ev, () => {{ lastTouch = Date.now(); }}, {{ passive: true }});
  // Si s'ha publicat una versió nova mentre l'app estava oberta: si no l'estàs tocant, es posa al dia sola; si no, s'ofereix
  navigator.serviceWorker.addEventListener('controllerchange', async () => {{
    if (!had) return;
    // La pàgina ja és la nova (s'ha carregat de la xarxa): no cal avisar
    // (controllerchange salta abans que el SW nou esborri la cache vella: es mira la més nova)
    try {{ const ks = (await caches.keys()).filter(k => k.startsWith('bitp-'));
      const r = await (await caches.open(ks[ks.length - 1])).match(/[/]ca([.]html)?$/.test(location.pathname) ? 'ca' : './');
      if (r && (await r.text()).includes("const BUILD = '" + BUILD + "'")) return; }} catch (e) {{}}
    const busy = (typeof dirty !== 'undefined' && dirty) || document.body.classList.contains('locked') || /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {{}}).tagName || '');
    if (!busy && (document.hidden || Date.now() - lastShown < 15000 || Date.now() - lastTouch > 60000)) return location.reload();
    const t = document.createElement('div');
    t.className = 'toast info';
    t.innerHTML = '<div class="msg">Hay una versión nueva de la app.</div><button type="button" class="act">Actualizar</button>';
    t.querySelector('.act').onclick = () => location.reload();
    document.getElementById('toasts').appendChild(t);
  }});
}}
</script>
</body>
</html>
"""

OUT.mkdir(exist_ok=True)
# Català: la mateixa pàgina traduïda (i18n_ca.py). Qui ha triat català s'hi redirigeix des d'index.html
import re as _re
import importlib.util as _iu
_spec = _iu.spec_from_file_location("i18n_ca", ROOT / "i18n_ca.py"); i18n_ca = _iu.module_from_spec(_spec); _spec.loader.exec_module(i18n_ca)
page_ca = i18n_ca.translate(page).replace('<html lang="es">', '<html lang="ca">').replace("/*LANGREDIRECT*/", "")
page = page.replace("/*LANGREDIRECT*/", "try { if (localStorage.getItem('midnight-lang') === 'ca') location.replace('ca' + location.hash); } catch (e) {}")
# Avís de textos que semblen en castellà i no s'han traduït (cal afegir-los a i18n_ca.py)
_body = page_ca[page_ca.index("<body>"):]
_left = sorted(set(_re.findall(r"[^<>`'\"\n]{0,30}(?:ción|ñ|¿|¡|\bmóvil|\bpara\b|\bhorario|\bquedan|\bmis\b|\btus\b|\bcon\b)[^<>`'\"\n]{0,30}", _body)))
_left = [x for x in _left if "//" not in x and "Montmeló" not in x and "horario" not in x and "Configuración)" not in x and "Organización:" not in x]
if _left:
    print("Compte, textos potser sense traduir al català:", *_left[:15], sep="\n  ")
(OUT / "index.html").write_text(page, encoding="utf-8")
(OUT / "ca.html").write_text(page_ca, encoding="utf-8")
# Cloudflare Pages: la pàgina, el service worker i els canvis sempre es comproven (versions noves a l'instant); GitHub Pages ho ignora
(OUT / "_headers").write_text("""/
  Cache-Control: no-cache
/ca
  Cache-Control: no-cache
/*.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/changes.json
  Cache-Control: no-store
/tasks.json
  Cache-Control: no-store
/cartel.json
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
/img/*
  Cache-Control: public, max-age=3600
""", encoding="utf-8")
if (OUT / "img").exists():
    shutil.rmtree(OUT / "img")
shutil.copytree(ROOT / "img", OUT / "img")
# Icona Midnight App (icons/make_icon.swift la genera a partir de la de la Midnight Suite)
for s in (32, 180, 192, 512):
    shutil.copy(ROOT / "icons" / f"icon-{s}.png", OUT / f"icon-{s}.png")
(OUT / ".nojekyll").touch()

# Dades del festival → docs/cartel.json, per al servidor de notificacions
defaults = {sid: [{"id": f"{sid}-{j}", "a": a, "b": b, "n": n} for j, (a, b, n, *_r) in enumerate(arr)] for sid, arr in FEST["sets"].items()}
(OUT / "cartel.json").write_text(json.dumps({
    "fest": FEST["id"], "name": FEST["name"], "date": FEST["date"], "start": FEST["start"], "end": FEST["end"],
    "stages": [{"id": st["id"], "name": st["name"]} for st in FEST["stages"]],
    "sets": defaults}, ensure_ascii=False), encoding="utf-8")
print("Festival:", FEST["name"], "·", "-".join(str(x) for x in FEST["date"]), FEST["start"], "→", FEST["end"])

# Els calendaris (.ics) es van treure el 22-10: a l'iPhone no funcionaven bé
if (OUT / "cal").exists():
    shutil.rmtree(OUT / "cal")

(OUT / "manifest.webmanifest").write_text("""{
  "name": "Midnight App",
  "short_name": "Midnight",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "BG",
  "theme_color": "BG",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
""".replace("BG", BG), encoding="utf-8")

# Fonts: només les que fa servir el festival (al img/ hi poden quedar fitxers vells)
_fontfiles = {f["file"] for f in FEST.get("fonts", [])}
# Canviar VERSION obliga els mòbils a descarregar la versió nova
version = hashlib.sha1((page + page_ca).encode()).hexdigest()[:8]
(OUT / "sw.js").write_text(f"""const VERSION = 'bitp-{version}';
const FILES = ['./', 'ca', 'manifest.webmanifest', 'icon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  {json.dumps(sorted("img/" + f.name for f in (ROOT / "img").iterdir() if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp") or f.name in _fontfiles))[1:-1]}];

// cache: 'reload' salta la cache HTTP de GitHub Pages (10 min): així la versió nova no es guarda amb fitxers vells
self.addEventListener('install', e => {{
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(u => new Request(u, {{ cache: 'reload' }})))).then(() => self.skipWaiting()));
}});

// Notificacions del servidor (també amb el mòbil bloquejat). El push arriba buit: es demana a PUSH_URL/now què mostrar.
// 'midnight-meta' (no s'esborra en actualitzar l'app): què s'ha mostrat ja (per no repetir) i si s'ha demanat una prova.
const PUSH_URL = {json.dumps(push["url"]) if push else "''"};
const PUSH_KEY = {json.dumps(push["public"]) if push else "''"};
const META = 'midnight-meta';
async function metaGet(k, d) {{ try {{ const r = await (await caches.open(META)).match(k); return r ? await r.json() : d; }} catch (e) {{ return d; }} }}
async function metaPut(k, v) {{ try {{ await (await caches.open(META)).put(k, new Response(JSON.stringify(v))); }} catch (e) {{}} }}
async function subId() {{
  const s = await self.registration.pushManager.getSubscription();
  if (!s) return '';
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.endpoint)));
  return [...h.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
}}
self.addEventListener('push', e => {{
  e.waitUntil((async () => {{
    let items = [], got = false;
    // Prova demanada des de Configuración (la pàgina hi deixa la marca abans de demanar-la)
    const test = await metaGet('test', 0);
    if (test && Date.now() - test < 3 * 60000) {{
      items.push({{ title: 'Midnight · prova', body: 'Les notificacions arriben també amb el mòbil bloquejat ✓', tag: 'prueba-' + test }});
      await metaPut('test', 0);
    }}
    try {{
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 8000);
      const r = await fetch(PUSH_URL + '/now?id=' + await subId(), {{ cache: 'no-store', signal: ac.signal }});
      clearTimeout(tm);
      if (r.ok) {{ items.push(...((await r.json()).items || []).slice(0, 6)); got = true; }}
    }} catch (err) {{}}
    // No repetir el que ja s'ha mostrat (el servidor torna tot el dels últims 15 min)
    const shown = await metaGet('shown', []);
    let fresh = items.filter(i => !shown.includes(i.tag));
    await metaPut('shown', [...shown, ...fresh.map(i => i.tag)].slice(-200));
    // L'iPhone obliga a mostrar sempre alguna cosa quan arriba un push
    if (!fresh.length) fresh = [items.length ? items[items.length - 1]
      : {{ title: 'Midnight', body: got ? 'Obre l’app per veure el teu horari.' : 'Sense connexió: obre l’app per veure el teu horari.', tag: 'midnight' }}];
    await Promise.all(fresh.slice(0, 4).map(i => self.registration.showNotification(i.title, {{ body: i.body, tag: i.tag, icon: 'icon-192.png', badge: 'icon-192.png' }})));
  }})());
}});
// Si el navegador renova la subscripció, es torna a registrar (el servidor conserva els artistes del registre vell)
self.addEventListener('pushsubscriptionchange', e => {{
  e.waitUntil((async () => {{
    try {{
      const pad = '='.repeat((4 - PUSH_KEY.length % 4) % 4), raw = atob((PUSH_KEY + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const sub = e.newSubscription || await self.registration.pushManager.subscribe({{ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) }});
      await fetch(PUSH_URL + '/sub', {{ method: 'POST', headers: {{ 'content-type': 'application/json' }}, body: JSON.stringify({{ endpoint: sub.endpoint, old: e.oldSubscription ? e.oldSubscription.endpoint : '' }}) }});
    }} catch (err) {{}}
  }})());
}});
self.addEventListener('notificationclick', e => {{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({{ type: 'window', includeUncontrolled: true }}).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
}});

self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== META).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
}});

// Primer la còpia guardada (va sense cobertura) i, si hi ha xarxa, s'actualitza per a la propera vegada
self.addEventListener('fetch', e => {{
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {{
    if (!url.hostname.endsWith('fonts.googleapis.com') && !url.hostname.endsWith('fonts.gstatic.com')) return;  // API de GitHub: directe
  }}
  // Canvis de l'organització i tasques de l'equip: sempre primer la xarxa; sense cobertura, l'última còpia
  const live = ['changes.json', 'tasks.json'].find(f => url.pathname.endsWith('/' + f));
  if (live) {{
    e.respondWith(caches.open(VERSION).then(cache => fetch(e.request).then(res => {{
      if (res.ok) cache.put(live, res.clone());
      return res;
    }}).catch(() => cache.match(live).then(r => r || new Response('', {{ status: 504 }})))));
    return;
  }}
  // «Actualizar la app» demana ./?t=…: ha d'anar a la xarxa de debò (si no, mai detectaria que no hi ha connexió)
  if (url.searchParams.has('t')) return;
  // La pàgina: primer la xarxa (màxim 1,5 s) perquè surti la versió nova; sense cobertura o si falla, la còpia guardada
  if (e.request.mode === 'navigate') {{
    // Cada idioma, la seva còpia. Adreces sense «.html» (Cloudflare Pages redirigeix ca.html → ca; GitHub serveix totes dues)
    const page = /[/]ca([.]html)?$/.test(url.pathname) ? 'ca' : './';
    e.respondWith(caches.open(VERSION).then(async cache => {{
      const hit = await cache.match(page);
      const net = fetch(e.request, {{ cache: 'no-cache' }}).then(res => {{
        // Un portal wifi o una pàgina d'error no s'han de guardar com si fossin l'app
        if (res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) cache.put(page, res.clone());
        else if (hit) return hit;   // un error del servidor (404, 5xx) no ha de guanyar a la còpia guardada
        return res;
      }});
      const slow = new Promise(r => setTimeout(() => r(hit), 1500));
      try {{ return (await Promise.race([net, hit ? slow : net])) || await net; }}
      catch (err) {{ return hit || Response.error(); }}
    }}));
    return;
  }}
  // La resta (imatges, fonts…): primer la còpia guardada i s'actualitza en segon pla
  e.respondWith(caches.open(VERSION).then(async cache => {{
    const hit = await cache.match(e.request, {{ ignoreSearch: true }});
    const net = fetch(e.request, {{ cache: 'no-cache' }}).then(res => {{
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    }}).catch(() => hit);
    return hit || net;
  }}));
}});
""", encoding="utf-8")

print("Fet:", OUT)
