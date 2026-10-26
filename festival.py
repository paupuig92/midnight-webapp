#!/usr/bin/env python3
"""Canvia el festival de l'app.

Cada festival viu a festivals/<id>/:
  festival.js  el bloc FEST (nom, dia, hores, colors, escenaris i horari)
  img/         banner.jpg i un logo <id-escenari>.png per escenari

Ús:
  python3 festival.py            mostra quin festival hi ha ara i quins hi ha guardats
  python3 festival.py <id>       posa aquest festival a l'app (index.html + img/)
  python3 festival.py --desa     guarda el festival actual a festivals/<id>/ (abans de canviar-lo)

Després: ./publica-web.sh per publicar-lo.
"""
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent
FESTS = ROOT / "festivals"
APP = ROOT / "index.html"
START, END = "/* ==== FESTIVAL ==== */", "/* ==== /FESTIVAL ==== */"


def block_of(text):
    return text[text.index(START):text.index(END) + len(END)]


def id_of(block):
    return re.search(r"id:\s*'([\w-]+)'", block).group(1)


app = APP.read_text(encoding="utf-8")
cur = block_of(app)
cur_id = id_of(cur)
args = sys.argv[1:]

if not args:
    print("Ara a l'app:", cur_id)
    print("Guardats:", ", ".join(sorted(p.name for p in FESTS.iterdir() if (p / "festival.js").is_file())) or "cap")
    sys.exit()

if args[0] == "--desa":
    d = FESTS / cur_id
    (d / "img").mkdir(parents=True, exist_ok=True)
    (d / "festival.js").write_text(cur + "\n", encoding="utf-8")
    for f in (ROOT / "img").iterdir():
        if f.is_file() and not f.name.startswith("."):
            shutil.copy2(f, d / "img" / f.name)
    print("ok desat a", d.relative_to(ROOT))
    sys.exit()

d = FESTS / args[0]
if not (d / "festival.js").is_file():
    sys.exit(f"No hi ha {d.relative_to(ROOT)}/festival.js")
new = block_of((d / "festival.js").read_text(encoding="utf-8"))
if id_of(new) != args[0]:
    sys.exit(f"L'id de dins ({id_of(new)}) no és el nom de la carpeta ({args[0]})")
# Els logos han d'existir: un per escenari + el banner
stages = re.findall(r"\{\s*id:\s*'([\w-]+)',\s*name:", new)
missing = [n for n in ["banner.jpg", *(s + ".png" for s in stages)] if not (d / "img" / n).is_file()]
if missing:
    print("Compte, falten imatges a", (d / "img").relative_to(ROOT), ":", ", ".join(missing))

APP.write_text(app.replace(cur, new), encoding="utf-8")
img = ROOT / "img"
for f in img.iterdir():  # treu els logos del festival anterior
    try:
        f.unlink()
    except OSError:
        pass
for f in (d / "img").iterdir():
    if f.is_file() and not f.name.startswith("."):
        shutil.copy2(f, img / f.name)
print("ok", cur_id, "→", args[0], "· ara: ./publica-web.sh")
