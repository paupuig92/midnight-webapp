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
src = src.replace("const BUILD = '';", "const BUILD = '" + datetime.datetime.now().strftime("%d/%m %H:%M") + "';")
head, body = src.split("</style>", 1)
head += "</style>"
# Treu la meta pròpia de l'artifact i el viewport (es posen a sota)
head = "\n".join(l for l in head.splitlines()
                 if 'name="claude:viewport-fit-sides"' not in l and 'name="viewport"' not in l)

page = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#040704">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Midnight">
<meta name="description" content="Horario en directo del Bass in the Park 2026 · Montmeló">
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
</head>
<body>
{body}
<script>
// Sense connexió: guarda l'app al mòbil la primera vegada que s'obre
if ('serviceWorker' in navigator) {{
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {{}});
  // Si s'ha publicat una versió nova mentre l'app estava oberta, s'ofereix recarregar
  navigator.serviceWorker.addEventListener('controllerchange', () => {{
    if (!had) return;
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
(OUT / "index.html").write_text(page, encoding="utf-8")
if (OUT / "img").exists():
    shutil.rmtree(OUT / "img")
shutil.copytree(ROOT / "img", OUT / "img")
# Icona Midnight App (icons/make_icon.swift la genera a partir de la de la Midnight Suite)
for s in (32, 180, 192, 512):
    shutil.copy(ROOT / "icons" / f"icon-{s}.png", OUT / f"icon-{s}.png")
(OUT / ".nojekyll").touch()

# Horari del cartell (DEFAULT i STAGES d'index.html) → docs/cartel.json, per al servidor de notificacions
import re
block = src[src.index("const DEFAULT = {"):]
block = block[len("const DEFAULT = "):block.index("\n};") + 2]
block = re.sub(r"^\s*//.*$", "", block, flags=re.M)
block = re.sub(r"(\w+):\s*\[", r'"\1": [', block)                                  # claus
block = re.sub(r"'((?:[^'\\]|\\.)*)'", lambda m: json.dumps(m.group(1)), block)  # cometes simples
block = re.sub(r",(\s*[\]}])", r"\1", block)                                      # comes finals
STAGE_NAMES = dict(re.findall(r"\{ id: '(\w+)', name: '([^']+)'", src))
defaults = {sid: [{"id": f"{sid}-{j}", "a": a, "b": b, "n": n} for j, (a, b, n, *_r) in enumerate(arr)] for sid, arr in json.loads(block).items()}
(OUT / "cartel.json").write_text(json.dumps({
    "stages": [{"id": k, "name": v} for k, v in STAGE_NAMES.items()],
    "sets": defaults}, ensure_ascii=False), encoding="utf-8")

# Els calendaris (.ics) es van treure el 22-10: a l'iPhone no funcionaven bé
if (OUT / "cal").exists():
    shutil.rmtree(OUT / "cal")

(OUT / "manifest.webmanifest").write_text("""{
  "name": "Midnight App",
  "short_name": "Midnight",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#040704",
  "theme_color": "#040704",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
""", encoding="utf-8")

# Canviar VERSION obliga els mòbils a descarregar la versió nova
version = hashlib.sha1(page.encode()).hexdigest()[:8]
(OUT / "sw.js").write_text(f"""const VERSION = 'bitp-{version}';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'img/banner.jpg', 'img/ner.png', 'img/tox.png', 'img/pont.png', 'img/misa.png', 'img/ss.png'];

// cache: 'reload' salta la cache HTTP de GitHub Pages (10 min): així la versió nova no es guarda amb fitxers vells
self.addEventListener('install', e => {{
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(u => new Request(u, {{ cache: 'reload' }})))).then(() => self.skipWaiting()));
}});

// Notificacions del servidor (també amb el mòbil bloquejat). El push arriba buit: es demana a PUSH_URL/now què mostrar
const PUSH_URL = {json.dumps(push["url"]) if push else "''"};
async function subId() {{
  const s = await self.registration.pushManager.getSubscription();
  if (!s) return '';
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.endpoint)));
  return [...h.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
}}
self.addEventListener('push', e => {{
  e.waitUntil((async () => {{
    let items = [];
    try {{
      const r = await fetch(PUSH_URL + '/now?id=' + await subId(), {{ cache: 'no-store' }});
      items = ((await r.json()).items || []).slice(0, 4);
    }} catch (err) {{}}
    // L'iPhone obliga a mostrar sempre alguna cosa quan arriba un push
    if (!items.length) items = [{{ title: 'Midnight', body: 'Hay novedades en el horario.', tag: 'midnight' }}];
    await Promise.all(items.map(i => self.registration.showNotification(i.title, {{ body: i.body, tag: i.tag, icon: 'icon-192.png', badge: 'icon-192.png' }})));
  }})());
}});
self.addEventListener('notificationclick', e => {{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({{ type: 'window', includeUncontrolled: true }}).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
}});

self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
}});

// Primer la còpia guardada (va sense cobertura) i, si hi ha xarxa, s'actualitza per a la propera vegada
self.addEventListener('fetch', e => {{
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {{
    if (!url.hostname.endsWith('fonts.googleapis.com') && !url.hostname.endsWith('fonts.gstatic.com')) return;  // API de GitHub: directe
  }}
  // Canvis de l'organització: sempre primer la xarxa; sense cobertura, l'última còpia
  if (url.pathname.endsWith('/changes.json')) {{
    e.respondWith(caches.open(VERSION).then(cache => fetch(e.request).then(res => {{
      if (res.ok) cache.put('changes.json', res.clone());
      return res;
    }}).catch(() => cache.match('changes.json').then(r => r || new Response('', {{ status: 504 }})))));
    return;
  }}
  // «Actualizar la app» demana ./?t=…: ha d'anar a la xarxa de debò (si no, mai detectaria que no hi ha connexió)
  if (url.searchParams.has('t')) return;
  // La pàgina: primer la xarxa (màxim 3 s) perquè surti la versió nova; sense cobertura, la còpia guardada
  if (e.request.mode === 'navigate') {{
    e.respondWith(caches.open(VERSION).then(async cache => {{
      const hit = await cache.match('index.html');
      const net = fetch(e.request, {{ cache: 'no-cache' }}).then(res => {{
        // Un portal wifi o una pàgina d'error no s'han de guardar com si fossin l'app
        if (res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) cache.put('index.html', res.clone());
        return res;
      }});
      const slow = new Promise(r => setTimeout(() => r(hit), 3000));
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
