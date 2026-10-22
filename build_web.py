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

# Editor de l'organització: el token de GitHub va xifrat amb la contrasenya.
# PBKDF2-SHA256(contrasenya, sal) dona len(token)+32 bytes: els primers fan XOR amb el token
# i els últims 32 serveixen per comprovar la contrasenya. Ni el token ni la contrasenya es mostren mai.
CONF = pathlib.Path.home() / ".config" / "midnight-webapp"
ITER = 1_000_000
tok_f, pw_f, salt_f = CONF / "github-token", CONF / "admin-password", CONF / "admin-salt"
admin = "null"
if tok_f.is_file() and pw_f.is_file():
    tok = tok_f.read_bytes().strip()
    pw = pw_f.read_bytes().strip()
    if not salt_f.is_file():
        salt_f.write_bytes(os.urandom(16))
        salt_f.chmod(0o600)
    salt = salt_f.read_bytes()
    pad = hashlib.pbkdf2_hmac("sha256", pw, salt, ITER, dklen=len(tok) + 32)
    b64 = lambda b: base64.b64encode(b).decode()
    admin = json.dumps({"salt": b64(salt), "iter": ITER, "len": len(tok),
                        "ct": b64(bytes(a ^ b for a, b in zip(tok, pad))), "check": b64(pad[len(tok):])})
    print("Editor de l'organització: activat")
else:
    print("Editor de l'organització: desactivat (falta", "la contrasenya" if tok_f.is_file() else "el token", "a", CONF, ")")
src = src.replace("/*ADMIN*/null/*ADMIN*/", admin)
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
<meta name="apple-mobile-web-app-title" content="Bass Park">
<meta name="description" content="Horario en directo del Bass in the Park 2026 · Montmeló">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-512.png">
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {{}});
</script>
</body>
</html>
"""

OUT.mkdir(exist_ok=True)
(OUT / "index.html").write_text(page, encoding="utf-8")
if (OUT / "img").exists():
    shutil.rmtree(OUT / "img")
shutil.copytree(ROOT / "img", OUT / "img")
(OUT / ".nojekyll").touch()

(OUT / "manifest.webmanifest").write_text("""{
  "name": "Bass in the Park",
  "short_name": "Bass Park",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#040704",
  "theme_color": "#040704",
  "icons": [
    { "src": "icon-180.png", "sizes": "180x180", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
""", encoding="utf-8")

# Canviar VERSION obliga els mòbils a descarregar la versió nova
version = hashlib.sha1(page.encode()).hexdigest()[:8]
(OUT / "sw.js").write_text(f"""const VERSION = 'bitp-{version}';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png',
  'img/banner.jpg', 'img/ner.png', 'img/tox.png', 'img/pont.png', 'img/misa.png', 'img/ss.png'];

self.addEventListener('install', e => {{
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
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
  e.respondWith(caches.open(VERSION).then(async cache => {{
    const hit = await cache.match(e.request, {{ ignoreSearch: true }});
    const net = fetch(e.request).then(res => {{
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    }}).catch(() => hit);
    return hit || net;
  }}));
}});
""", encoding="utf-8")

print("Fet:", OUT)
