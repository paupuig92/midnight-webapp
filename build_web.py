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
    t.className = 'toast';
    t.innerHTML = '<div>Hay una versión nueva de la app.</div><button type="button" style="width:auto;border-radius:6px;padding:0 12px;font-weight:700">Actualizar</button>';
    t.querySelector('button').onclick = () => location.reload();
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

# Calendaris: un .ics per actuació a docs/cal/<id>.ics. L'iPhone només obre bé el
# «Añadir al calendario» amb un fitxer de veritat servit pel web (no amb un data: generat a la pàgina).
# Horari = el del cartell (DEFAULT d'index.html) + els canvis de l'organització (docs/changes.json).
import re
from datetime import datetime as _dt, timezone as _tz
block = src[src.index("const DEFAULT = {"):]
block = block[len("const DEFAULT = "):block.index("\n};") + 2]
block = re.sub(r"^\s*//.*$", "", block, flags=re.M)
block = re.sub(r"(\w+):\s*\[", r'"\1": [', block)                 # claus
block = re.sub(r"'((?:[^'\\]|\\.)*)'", lambda m: json.dumps(m.group(1)), block)  # cometes simples
block = re.sub(r",(\s*[\]}])", r"\1", block)                     # comes finals
default = json.loads(block)
STAGE_NAMES = dict(re.findall(r"\{ id: '(\w+)', name: '([^']+)'", src))
sets = {sid: [{"id": f"{sid}-{j}", "a": a, "b": b, "n": n} for j, (a, b, n, *_rest) in enumerate(arr)] for sid, arr in default.items()}
chg = OUT / "changes.json"
if chg.is_file():
    try:
        d = json.loads(chg.read_text(encoding="utf-8"))
        if isinstance(d.get("sets"), dict):
            sets = {sid: [r for r in lst if r.get("n")] for sid, lst in d["sets"].items()}
    except Exception as e:
        print("Avís: changes.json no s'ha pogut llegir:", e)

def T(code):  # igual que T() de la pàgina: hora de Montmeló → UTC (canvi d'hora a les 3:00 del 25)
    m = re.fullmatch(r"(\d{1,2}):(\d{2})([ab]?)", code)
    h, mi, f = int(m[1]), int(m[2]), m[3]
    day, off = (24, 2) if h >= 6 else ((25, 2) if h < 2 or (h == 2 and f == "a") else (25, 1))
    return _dt(2026, 10, day, 0, mi, tzinfo=_tz.utc).timestamp() + (h - off) * 3600

def ics_text(x, sname):
    d = lambda ts: _dt.fromtimestamp(ts, _tz.utc).strftime("%Y%m%dT%H%M%SZ")
    tx = lambda t: str(t).replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")
    a = T(x["a"])
    return "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Midnight//Bass in the Park//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT", f"UID:{x['id']}@midnight-webapp", "DTSTAMP:20261020T000000Z",
        f"DTSTART:{d(a)}", f"DTEND:{d(T(x['b']))}", f"SUMMARY:{tx(x['n'])} · {tx(sname)}",
        "LOCATION:Bass in the Park · Espai Can Guitet\\, Montmeló",
        "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", f"DESCRIPTION:{tx(x['n'])} empieza en 10 min ({tx(sname)})", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR", ""])

cal = OUT / "cal"
if cal.exists():
    shutil.rmtree(cal)
cal.mkdir()
n_cal = 0
for sid, lst in sets.items():
    for x in lst:
        if re.fullmatch(r"[\w-]+", str(x.get("id", ""))):
            (cal / f"{x['id']}.ics").write_bytes(ics_text(x, STAGE_NAMES.get(sid, sid)).encode("utf-8"))
            n_cal += 1
print(f"Calendaris: {n_cal} fitxers a docs/cal/")

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

self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
}});

// Primer la còpia guardada (va sense cobertura) i, si hi ha xarxa, s'actualitza per a la propera vegada
self.addEventListener('fetch', e => {{
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('.ics')) return;  // calendaris: sempre de la xarxa (l'organització els pot haver canviat)
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
  // La pàgina: primer la xarxa (màxim 3 s) perquè surti la versió nova; sense cobertura, la còpia guardada
  if (e.request.mode === 'navigate') {{
    e.respondWith(caches.open(VERSION).then(async cache => {{
      const hit = await cache.match('index.html');
      const net = fetch(e.request, {{ cache: 'no-cache' }}).then(res => {{
        if (res.ok) cache.put('index.html', res.clone());
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
