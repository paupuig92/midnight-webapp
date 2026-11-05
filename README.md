# Midnight App

Web app interna de Midnight Group per a l'equip dels festivals (iPhone, s'afegeix a la pantalla d'inici). La UI és en castellà.

Què fa: qui punxa ara a cada escenari i què ve després, avisos i canvis de l'organització en 1–3 min, tasques de l'equip («Mi plan»), incidències, i les eines de vídeo: Multicams (estat de cada càmera, 3D), Momentos (marques amb timecode per a l'edició), Timecode, Sol i Tiempo.

- Web: https://visualcrew.midnightgroup.app (GitHub Pages, `main` → `docs/`)
- Servidor d'avisos: Cloudflare Workers (`push/`), pla gratuït.

## Fitxers
- `index.html` — tota l'app (font única).
- `festivals/<id>/` — un festival per carpeta: `festival.js` (dades, colors, escenaris, horari) + `img/`.
- `festival.py` — tria quin festival va a l'app (`python3 festival.py` llista, `python3 festival.py <id>` el posa).
- `build_web.py` — genera `docs/` (HTML complet, manifest, `sw.js`, icones, CSP).
- `publica-web.sh` — build + commit + push. Així es publica.
- `push/worker.js` + `push/instala.sh` — servidor d'avisos i com s'instal·la.
- `i18n_ca.py` — versió en català (`docs/ca.html`).

Tot el detall tècnic i les regles de treball són a `CLAUDE.md`.
