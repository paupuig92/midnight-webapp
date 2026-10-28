# Midnight App · Bass in the Park (web app d'horari en directe)

Parla en català amb en Pau, curt i clar. **La UI de l'app és en castellà.**

Web app per a iPhone (s'afegeix a la pantalla d'inici) que mostra qui punxa ara a cada escenari, l'hora en gran i una línia d'«ara» a la graella.
Festival: Bass in the Park, 24.10.2026, Montmeló (Espai Can Guitet), 12:00–05:00. Midnight Group en fa uns 12 l'any: l'app ha de poder servir per a altres festivals (el verd és només d'aquest; color a l'objecte `FEST`).

## On és
- Web: https://paupuig92.github.io/midnight-webapp/ (repo `paupuig92/midnight-webapp`, Pages = `main` /docs)
- Artifact de Claude: https://claude.ai/artifact/Pkv7ffjrYcHsyXCdvwwvdd (republicar amb l'Artifact tool sobre `index.html`)
- Servidor d'avisos: https://midnight-push.midnightgroup.workers.dev (Cloudflare Workers, pla GRATUÏT; en Pau no vol pagar)

## Fitxers
| Fitxer | Què és |
|---|---|
| `index.html` | Tota l'app (HTML+CSS+JS, format artifact sense `<html>/<head>`). Font única. |
| `build_web.py` | Genera `docs/`: HTML complet, manifest, `sw.js` (offline + push), `cartel.json`, token xifrat de l'editor, config de push. |
| `publica-web.sh` | Build + commit + `pull --rebase` + push amb el token. **Així es publica.** |
| `docs/changes.json` | Canvis de l'organització (horari complet + «Aviso para todos»). L'escriu l'editor de l'app via API de GitHub. |
| `push/worker.js` | Servidor: Durable Object SQLite (`Store`) amb els mòbils; cron cada minut; enviament en lots de 40 (`SELF` + `SEND_KEY`). S'atura sol després del 25-10 6:00 (`END`). |
| `push/instala.sh` | Instal·la/actualitza el servidor via API de Cloudflare (sense wrangler). |
| `push/claus.sh` | Claus VAPID (ja fetes). |
| `icons/make_icon.swift` | Icona vermella «MIDNIGHT APP» (com la de Midnight Suite). |
| `img/` | Logos dels escenaris (PNG transparents d'en Pau). |

## Dades
- Noms i ordre: el cartell (definitiu). Hores exactes i importància: el full de Google https://docs.google.com/spreadsheets/d/1AVNK52llp2q5DbKVEEyUgZIkpxYmw-UW20bCTzUQI48
- Importància per colors: vermell 5 > taronja 4 > groc/ocre 3 > verd 2 > blau 1. Sound System sense color.
- Escenaris: No Es Ruido, Toxik Parties, Pont Aeri, Misa Psicodélika, Migats Sound System + Atracciones (12:00–01:00).
- Canvi d'hora la nit del festival: `T("HH:MM[a|b]")`; les 2:00 surten dues vegades (1ª/2ª).
- Colors fixos: groc = meus artistes, magenta (`--chg`) = canvi, vermell = ara.

## Com funciona
- L'app llegeix `changes.json` cada 60 s → tothom veu els canvis en 1–2 min. Si falla la connexió es queda l'últim horari bo i diu «sin conexión».
- Editor «Organización»: contrasenya → desxifra el token de GitHub incrustat (PBKDF2 + HMAC) → publica `changes.json` en un commit.
- Notificacions amb el mòbil bloquejat (iOS 16.4+, app a la pantalla d'inici): push sense contingut; el SW demana `/now`. Avisos dels meus artistes (X min abans) i dels canvis/avisos de l'organització. Provat i funcionant el 22-10.
- Estat del servidor: `curl https://midnight-push.midnightgroup.workers.dev/` (nombre de mòbils). Detall: `/debug` amb capçalera `x-send-key` (llegir la clau des del fitxer amb un script, mai mostrar-la).

## Regles
- **Abans de publicar (`publica-web.sh` o `push/instala.sh`) SEMPRE preguntar a en Pau** (28-10-2026).
- **Secrets mai es llegeixen, mostren ni copien**: `~/.config/midnight-webapp/*` (github-token, admin-password, admin-salt, cloudflare-token, vapid.json, send-key, push.json). Els scripts els fan servir; jo no.
- Mai demanar la contrasenya d'admin; en Pau desa secrets amb `read -rs`.
- **Mai fer proves escrivint el `docs/changes.json` real** sense preguntar (un cop vaig trepitjar un canvi de l'organització).
- Per canviar l'app: editar `index.html` → `./publica-web.sh` → republicar l'artifact. Si es toca `push/worker.js` → `push/instala.sh`.
- GitHub Pages: ~10 publicacions/hora → l'organització ha d'agrupar canvis.
- Si una acció es denega, no buscar drecera: dir-ho a en Pau.
- Descartat: calendari .ics (no anava a l'iPhone), ubicació en temps real, pagar Cloudflare.

## Festivals (des del 26-10-2026)
- Tot el que canvia d'un festival a un altre és al bloc `/* ==== FESTIVAL ==== */` d'`index.html` (objecte `FEST`: id, key, nom, dia, inici/final, colors, `rides` opcional, escenaris, horari).
- Cada festival guardat a `festivals/<id>/` (`festival.js` + `img/` amb banner.jpg i un `<escenari>.png` per escenari).
- `python3 festival.py` (llista) · `python3 festival.py <id>` (el posa a l'app) · `python3 festival.py --desa` (guarda l'actual). Després `./publica-web.sh`.
- `changes.json` porta `fest`: l'app i el servidor ignoren els d'un altre festival (els antics sense `fest` = Bass). Claus del mòbil amb prefix `FEST.key`.
- El servidor d'avisos llegeix dia/hores de `cartel.json`; en canviar de festival esborra els mòbils anteriors. Cal `push/instala.sh` després de publicar un festival nou.
- `festivals/bass-in-the-park-2026/original/` = còpia exacta de tota l'app tal com va funcionar al Bass.
- Comptador «⏳ quedan X h» fins al final (status + barra fina de dalt).

## Mi plan · tasques de l'equip (des del 28-10-2026)
- L'organització escriu l'equip i les tasques a Organización → **Tareas** (contrasenya) → publica `docs/tasks.json` (mateix commit per API que changes.json). Porta `fest`.
- Equip: `Nom: grup1, grup2`. Tasques: `18:30 Text @Nom @grup @todos`, `18:30-19:00 …`, línia només amb `@Marc` = per a les de sota, o enganxar d'Excel (hora⇥tasca⇥qui). 6:00–12:00 = muntatge del mateix dia; de matinada = l'endemà.
- Cadascú tria **«Soy…»** a Configuración (sense codi, decisió d'en Pau: no passa res si algú veu la feina d'un altre). Secció «Mi plan» a dalt: el que va tard, el que toca i les 6 següents; ✓ per marcar.
- ✓ al mòbil + servidor d'avisos (`POST/GET /done`, taula `done`) → **Vista global** a Organización (persona × hora, verd fet / vermell tard).
- Avisos de tasques: `subs.yo` + `subs.tb` (Configuración → «Avisarme de mis tareas»); el cron llegeix `tasks.json`. Cal `push/instala.sh` després de publicar el worker.

## Pendent
- Post-festival (24-10 ja passat): treure el cron del servidor, esborrar les dades dels mòbils, revocar els tokens de GitHub i Cloudflare (el de Cloudflare caduca sol ~21-11).
- Per al proper festival: fer l'app genèrica (dades i colors per festival), canviar `END` del servidor.
- Retocs petits de UI que van quedar: microtextos, vista horitzontal, Organización darrere un enllaç.
