#!/usr/bin/env python3
"""Comprovació ràpida abans de publicar (06-11-2026): cap error d'escriptura al JavaScript de la web generada.

Agafa cada <script> de docs/index.html i docs/ca.html, i també docs/sw.js, i els fa llegir a un motor de JavaScript:
  · node --check, si n'hi ha
  · si no, el de Safari que porta tot Mac (osascript -l JavaScript): és el mateix motor que l'iPhone
Surt amb codi 1 si algun no es pot llegir (publica-web.sh llavors no publica). Si no troba cap motor, avisa i surt amb 0.
Ús:  python3 -I prova/sintaxi.py
"""
import pathlib, re, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
JXA = ROOT / "prova" / "sintaxi-mac.js"

trossos = []
for f in ("index.html", "ca.html"):
    html = (DOCS / f).read_text(encoding="utf-8")
    for n, m in enumerate(re.finditer(r"<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>", html, re.S)):
        if 'type="application/json"' in m.group(1) or "module" in m.group(1):
            continue
        part = re.search(r'data-part="([^"]+)"', m.group(1))
        trossos.append((f"{f} · bloc {n + 1}" + (f" ({part.group(1)})" if part else ""), m.group(2)))
trossos.append(("sw.js", (DOCS / "sw.js").read_text(encoding="utf-8")))

tmp = pathlib.Path(tempfile.mkdtemp())
fitxers = []
for i, (nom, codi) in enumerate(trossos):
    p = tmp / f"t{i}.js"; p.write_text(codi, encoding="utf-8"); fitxers.append((nom, p))

dolents = []
if shutil.which("node"):
    motor = "node"
    for nom, p in fitxers:
        r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
        if r.returncode:
            linia = next((l for l in r.stderr.splitlines() if "Error" in l), r.stderr.strip()[:200])
            dolents.append(f"{nom}: {linia}")
elif shutil.which("osascript"):
    motor = "Safari (osascript)"
    r = subprocess.run(["osascript", "-l", "JavaScript", str(JXA), *[str(p) for _, p in fitxers]], capture_output=True, text=True)
    for l in (r.stdout + r.stderr).splitlines():
        m = re.match(r"(?:.*?)MAL (\d+) (.*)", l)
        if m:
            dolents.append(f"{fitxers[int(m.group(1))][0]}: {m.group(2)}")
    if r.returncode and not dolents:
        dolents.append("no s'ha pogut fer la comprovació: " + (r.stderr.strip() or r.stdout.strip())[:300])
else:
    print("AVÍS: no hi ha cap motor de JavaScript (node o osascript): no s'ha comprovat la sintaxi.")
    sys.exit(0)
shutil.rmtree(tmp, ignore_errors=True)
if dolents:
    print("ERROR d'escriptura al JavaScript (" + motor + "):\n  - " + "\n  - ".join(dolents))
    sys.exit(1)
print(f"ok sintaxi: {len(fitxers)} blocs de JavaScript sense errors ({motor})")
