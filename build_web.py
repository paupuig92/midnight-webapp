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
import sys

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "docs"

src = (ROOT / "index.html").read_text(encoding="utf-8")

# Editor de l'organització (des del 03-11-2026): la contrasenya i el token de GitHub ja NO van dins la web.
# Viuen només al servidor d'avisos (push/instala.sh els puja com a secrets) i l'app hi entra amb POST /admin/login.
# Aquí només es diu si l'editor està disponible (cal el servidor). Ni el token ni la contrasenya es llegeixen.
CONF = pathlib.Path.home() / ".config" / "midnight-webapp"
# Servidor de notificacions (push/instala.sh escriu push.json). Sense push.json, l'app només avisa amb l'app oberta
push_f = CONF / "push.json"
push = json.loads(push_f.read_text()) if push_f.is_file() else None
src = src.replace("/*PUSH*/null/*PUSH*/", json.dumps({"url": push["url"], "public": push["public"]}) if push else "null")
src = src.replace("/*ADMIN*/null/*ADMIN*/", "true" if push else "null")
# Mapa de fons de la pestanya Tiempo (costa, fronteres, rius i poblacions de Natural Earth, domini públic)
_mapa = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor", "mapa-base.json")
if os.path.exists(_mapa):
    src = src.replace("/*MAPA*/null/*MAPA*/", open(_mapa, encoding="utf-8").read().strip())
# Content-Security-Policy: segona capa per si mai s'hi colés codi estrany. La pàgina només pot parlar amb ella mateixa
# i amb el servidor d'avisos, i només pot carregar lletres de Google Fonts (la llibreria d'Excel ara és a vendor/, a la mateixa web).
# Pestanya Tiempo (04-11): previsió d'Open-Meteo, radar de RainViewer, mapa de fons propi (vendor/mapa-base.json) i el widget de Windy (iframe).
import re
PUSH_ORIGIN = re.match(r"https?://[^/]+", push["url"]).group(0) if push else ""
CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; "
       "img-src 'self' data: blob: https://tilecache.rainviewer.com https://tile.openstreetmap.org " + PUSH_ORIGIN + "; media-src 'self' data: blob:; "
       "connect-src 'self' https://api.open-meteo.com https://analisi.transparenciacatalunya.cat https://api.rainviewer.com " + PUSH_ORIGIN + "; frame-src https://embed.windy.com; "
       "manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'")
print("Notificacions amb el mòbil bloquejat:", "activades (" + push["url"] + ")" if push else "desactivades (falta instal·lar el servidor: push/instala.sh)")
# Data de la versió (surt sota «Actualizar la app»)
import datetime
# La data és la de l'últim canvi dels fitxers de l'app (no l'hora del build): així, si no canvia res,
# la versió és la mateixa i els mòbils no es tornen a baixar l'app ni surt «Hay una versión nueva»
# (les imatges del festival es compten més avall, quan ja se sap quin festival és)
srcs = [ROOT / "index.html", ROOT / "build_web.py", *(ROOT / "icons").glob("icon-*.png")]
stamp_t = max(f.stat().st_mtime for f in srcs if f.is_file())
push_f2 = CONF / "push.json"
if push_f2.is_file():
    stamp_t = max(stamp_t, push_f2.stat().st_mtime)
src = src.replace("const BUILD = '';", "const BUILD = '" + datetime.datetime.fromtimestamp(stamp_t).strftime("%d/%m %H:%M") + "';")
head, body = src.split("</style>", 1)
head += "</style>"
# Compartiments (06-11-2026): cada app (Sol, Multicams, Momentos, Tiempo, Timecode, Incidencias) va en un <script> propi.
# Si una peta en arrencar, el navegador només atura aquell bloc: rellotge, horaris, canvis i avisos (el nucli) continuen.
# El codi és el mateix (comparteixen variables com abans); només es talla per les marques «// ==== NOM ====» i «// ==== /NOM ====».
PARTS = [("SOL", "sol"), ("MULTICÁMARA", "multi"), ("MOMENTOS", "momentos"), ("TIEMPO", "tiempo"), ("CLAQUETA", "timecode"), ("INCIDENCIAS", "incidencias")]
for marca, nom in PARTS:
    a, z = "\n// ==== " + marca + " ====", "\n// ==== /" + marca + " ===="
    if body.count(a) != 1 or body.count(z) != 1:
        sys.exit(f"ERROR: no trobo les marques de «{marca}» a index.html (// ==== {marca} ==== … // ==== /{marca} ====). No s'ha generat res.")
    i = body.index(a); j = body.index("\n", body.index(z) + 1)
    body = body[:i] + f'\n</script>\n<script data-part="{nom}">' + body[i:j] + "\n</script>\n<script>" + body[j:]
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
# (09-11-2026) Cada festival ha de tenir un «key» propi: el mòbil hi desa preferits, tasques, avisos, marques…
# Si dos festivals (p. ex. el Duro 2026 i el Duro 2027) en comparteixen un, les dades del vell sortirien al nou.
for _f in sorted((ROOT / "festivals").glob("*/festival.js")):
    _m = re.search(r"^\s*id:\s*'([^']+)'[\s\S]*?^\s*key:\s*'([^']+)'", _f.read_text(encoding="utf-8"), re.M)
    if _m and _m.group(1) != FEST["id"] and _m.group(2) == FEST["key"]:
        sys.exit(f"ERROR: el festival «{FEST['id']}» fa servir key: '{FEST['key']}', que ja és de «{_m.group(1)}» ({_f.parent.name}). Posa-li un key nou (p. ex. '{FEST['key']}27'). No s'ha generat res.")
# Logos, banner i fonts: a festivals/<id>/img/ (cada festival a la seva carpeta, des del 03-11). Si no hi és, img/ (com abans)
IMG = ROOT / "festivals" / FEST["id"] / "img"
if not IMG.is_dir():
    IMG = ROOT / "img"
print("Imatges:", IMG.relative_to(ROOT))

# Archivo (Google Fonts) és la lletra per defecte: si el festival en porta de pròpies (theme --display i --body), no es baixa.
# Una connexió externa menys abans de la primera pintada (rendiment, 04-11-2026)
_first = lambda v: (v or "").split(",")[0].strip().strip('"\'').lower()
_th = FEST.get("theme", {})
if _th.get("--display") and _th.get("--body") and "archivo" not in (_first(_th.get("--display")), _first(_th.get("--body")), _first(_th.get("--title")), _first(_th.get("--cond")), _first(_th.get("--mono"))):
    head = "\n".join(l for l in head.splitlines() if "fonts.googleapis.com" not in l and "fonts.gstatic.com" not in l)
    CSP = CSP.replace(" https://fonts.googleapis.com", "").replace(" https://fonts.gstatic.com", "")
    print("Lletres: només les del festival (sense Google Fonts)")

# Colors i lletres del festival ja al <head>: si no, el primer instant es veuen els colors per defecte (els del Bass)
def _css(v): return str(v).replace("<", "")
_vars = {"--accent": FEST.get("accent"), "--accent-rgb": FEST.get("accentRgb"), "--accent-dim": FEST.get("accentDim"),
         "--accent-deep": FEST.get("accentDeep"), "--accent-ink": FEST.get("accentInk"), **FEST.get("theme", {})}
BG = _css(FEST.get("theme", {}).get("--bg", "#040704"))
FESTCSS = "<style data-fest>/* colors i lletres del festival */\n" + "".join(
    f'@font-face{{font-family:"{_css(f["family"])}";src:url("img/{_css(f["file"])}");font-weight:{_css(f.get("weight", 400))};{"font-stretch:" + _css(f["stretch"]) + ";" if f.get("stretch") else ""}font-display:swap}}\n'
    for f in FEST.get("fonts", [])) + ":root{" + ";".join(f"{k}:{_css(v)}" for k, v in _vars.items() if v) + "}" + (
    # Mode clar (FEST.light, opcional): els seus colors ja al <head>, i un script mínim que posa el tema triat abans de pintar res
    'html[data-theme="light"]{' + ";".join(f"{k}:{_css(v)}" for k, v in FEST["light"].items() if v) + ";color-scheme:light}" if FEST.get("light") else "") + "</style>"
LIGHT_BG = _css(FEST["light"].get("--bg", "#ffffff")) if FEST.get("light") else ""
TEMA_JS = ("<script>/* tema (Ajustes → Tema): Claro / Oscuro / Sistema; per defecte, fosc */ try { var t = localStorage.getItem(" + json.dumps(FEST["key"] + "-tema-v1")
           + "), l = t === 'light' || (t === 'system' && matchMedia('(prefers-color-scheme: light)').matches); document.documentElement.dataset.theme = l ? 'light' : 'dark';"
           + " if (l) { document.documentElement.style.colorScheme = 'light'; document.querySelector('meta[name=\"theme-color\"]').content = " + json.dumps(LIGHT_BG) + "; } } catch (e) {}</script>") if FEST.get("light") else ""

page = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="{BG}">
{TEMA_JS}
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
# Les imatges de cada festival van a docs/img/<id>/: si dos festivals tenen un fitxer amb el mateix nom (banner.jpg),
# un mòbil amb la còpia vella guardada no pot ensenyar la del festival anterior (va passar el 03-11 amb la Castanyada)
IMGURL = f"img/{FEST['id']}/"
_imgref = re.compile(r"""(?<=["'(`])img/""")
page, page_ca = _imgref.sub(IMGURL, page), _imgref.sub(IMGURL, page_ca)
(OUT / "index.html").write_text(page, encoding="utf-8")
(OUT / "ca.html").write_text(page_ca, encoding="utf-8")
# (06-11) Ja no es genera docs/_headers: GitHub Pages l'ignora. La CSP va amb <meta> i l'app demana changes/tasks amb ?t= i no-store.
if (OUT / "img").exists():
    shutil.rmtree(OUT / "img")
shutil.copytree(IMG, OUT / "img" / FEST["id"], ignore=shutil.ignore_patterns(".*"))
# Llibreries de vendor/: la d'Excel (editor de l'organització) sempre; three.js (vista 3D de «Cámaras») només si el festival en fa servir (FEST.multicam[].scene3d)
USES3D = "scene3d:" in src
if (OUT / "vendor").exists():
    shutil.rmtree(OUT / "vendor")
shutil.copytree(ROOT / "vendor", OUT / "vendor", ignore=shutil.ignore_patterns(".*", "mapa-base.json", *(() if USES3D else ("three-*",))))  # el mapa ja va dins de l'index.html
# Icona Midnight App (icons/make_icon.swift la genera a partir de la de la Midnight Suite)
for s in (32, 180, 192, 512):
    shutil.copy(ROOT / "icons" / f"icon-{s}.png", OUT / f"icon-{s}.png")
(OUT / ".nojekyll").touch()

# Avís de l'hora daurada (pestanya Sol, 04-11-2026): per a cada dia del festival, l'instant en què el sol baixa de 6° a la tarda
# (comença l'hora daurada) i la posta, a la ubicació del festival (mitjana dels punts GPS del 1r mapa; si no, Montmeló).
# Mateixa fórmula de la NOAA que l'app. El servidor d'avisos només llegeix aquests instants (no calcula res)
def sol_alerts(F):
    import math
    from zoneinfo import ZoneInfo
    g = next((m["geo"] for m in F.get("maps") or [] if m.get("geo")), None)
    lat, lon = (sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)) if g else (41.5536, 2.2492)
    R = math.pi / 180
    def alt(ms):
        T = (ms / 86400000 + 2440587.5 - 2451545) / 36525
        L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
        M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
        e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
        C = math.sin(M * R) * (1.914602 - T * (0.004817 + 0.000014 * T)) + math.sin(2 * M * R) * (0.019993 - 0.000101 * T) + math.sin(3 * M * R) * 0.000289
        om = 125.04 - 1934.136 * T
        lam = L0 + C - 0.00569 - 0.00478 * math.sin(om * R)
        eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * math.cos(om * R)
        dec = math.asin(math.sin(eps * R) * math.sin(lam * R)) / R
        yy = math.tan(eps / 2 * R) ** 2
        eqt = 4 / R * (yy * math.sin(2 * L0 * R) - 2 * e * math.sin(M * R) + 4 * e * yy * math.sin(M * R) * math.cos(2 * L0 * R) - .5 * yy * yy * math.sin(4 * L0 * R) - 1.25 * e * e * math.sin(2 * M * R))
        ha = ((ms / 60000 + eqt + 4 * lon) % 1440) / 4 - 180
        return math.asin(math.sin(lat * R) * math.sin(dec * R) + math.cos(lat * R) * math.cos(dec * R) * math.cos(ha * R)) / R
    def down(a, b, h):  # primer minut (entre a i b) en què el sol baixa de h graus
        t = a
        while t < b:
            if alt(t) >= h > alt(t + 60000): return t + 60000
            t += 60000
        return None
    out, tz = [], ZoneInfo("Europe/Madrid")
    y, mo, d = F["date"]
    for i in range(max(1, len(F.get("days") or []))):
        day = datetime.datetime(y, mo, d, 12, 0, tzinfo=tz) + datetime.timedelta(days=i)
        a = int(day.timestamp() * 1000)
        g0 = down(a, a + 10 * 3600000, 6)
        st = down(g0 or a, a + 10 * 3600000, -0.833)
        if g0 and st:
            out.append({"t": g0, "set": datetime.datetime.fromtimestamp(st / 1000, tz).strftime("%H:%M")})
    return out

# Dades del festival → docs/cartel.json, per al servidor de notificacions
defaults = {sid: [{"id": f"{sid}-{j}", "a": a, "b": b, "n": n} for j, (a, b, n, *_r) in enumerate(arr)] for sid, arr in FEST["sets"].items()}
(OUT / "cartel.json").write_text(json.dumps({
    "fest": FEST["id"], "name": FEST["name"], "date": FEST["date"], "start": FEST["start"], "end": FEST["end"],
    "days": max(1, len(FEST.get("days") or [])),  # festivals de diversos dies: les hores «2/11:00» són del 2n dia
    "stages": [{"id": st["id"], "name": st["name"]} for st in FEST["stages"]],
    "sets": defaults,
    "open": FEST.get("open"),  # dates en què l'app és oberta per a l'equip (fora, només admin); None = 7 dies abans → l'endemà
    "sol": sol_alerts(FEST)}, ensure_ascii=False), encoding="utf-8")
print("Festival:", FEST["name"], "·", "-".join(str(x) for x in FEST["date"]), FEST["start"], "→", FEST["end"], f"· {len(FEST.get('days') or [])} dies" if FEST.get("days") else "")

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
# (també les imatges: si canvia el banner amb el mateix nom, els mòbils l'han de tornar a baixar)
_imgs = sorted(f for f in IMG.iterdir() if f.is_file() and not f.name.startswith("."))
version = hashlib.sha1((page + page_ca).encode() + b"".join(f.name.encode() + f.read_bytes() for f in _imgs)).hexdigest()[:8]
(OUT / "sw.js").write_text(f"""const VERSION = 'bitp-{version}';
const FILES = ['./', 'ca', 'manifest.webmanifest', 'icon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  {json.dumps(sorted(IMGURL + f.name for f in _imgs if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp") or f.name in _fontfiles) + (["vendor/three-0.170.0.module.min.js"] if USES3D else []))[1:-1]}];

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
      items.push({{ title: 'Midnight · prueba', body: 'Las notificaciones llegan también con el móvil bloqueado ✓', tag: 'prueba-' + test }});
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
      : {{ title: 'Midnight', body: got ? 'Abre la app para ver tu horario.' : 'Sin conexión: abre la app para ver tu horario.', tag: 'midnight' }}];
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
  // Vídeos (el banner): directe de la xarxa. L'iPhone els demana a trossos (Range) i una còpia sencera de la cache no la reprodueix; sense xarxa es veu el pòster
  if (url.pathname.endsWith('.mp4')) return;
  // La pàgina: la còpia guardada a l'acte (s'obre a l'instant, amb o sense cobertura) i es refresca en segon pla.
  // Les versions noves arriben pel sw.js nou (es mira cada vegada que s'obre l'app): es posa al dia sola o surt «Actualizar» (04-11-2026)
  // Sense còpia (primera vegada): la xarxa
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
      if (hit) {{ e.waitUntil(net.catch(() => {{}})); return hit; }}
      try {{ return await net; }}
      catch (err) {{ return Response.error(); }}
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
