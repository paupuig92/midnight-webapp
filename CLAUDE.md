# Midnight App (web app interna de l'equip als festivals de Midnight Group)

Parla en català amb en Pau, curt i clar. **La UI de l'app és en castellà.**

**On es treballa:** ☁️+💻 repo GitHub `paupuig92/midnight-webapp`. Es pot preparar al núvol (i publicar després des del Mac amb `publica-commit.sh`), però `publica-web.sh` i `push/instala.sh` només funcionen al Mac (secrets a `~/.config/midnight-webapp/`).

Web app per a iPhone (s'afegeix a la pantalla d'inici) que mostra qui punxa ara a cada escenari, l'hora en gran i una línia d'«ara» a la graella.
Midnight Group fa uns 12 festivals l'any: l'app és genèrica i cada festival viu a `festivals/<id>/` (colors, escenaris i horari a l'objecte `FEST`).
Festival actual a l'app: **Duro / Black Hangar**, 5–6 des. 2026, Espai Can Guitet (Montmeló), 11:00–23:00, oberta a l'equip del 30-11 al 8-12. Anteriors: Bass in the Park (24-10), La Castanyada (31-10). `python3 festival.py` diu quin hi ha.

## On és
- Web: https://visualcrew.midnightgroup.app (repo `paupuig92/midnight-webapp`, públic; Pages = `main` /docs; l'adreça github.io vella redirigeix)
- Artifact de Claude: https://claude.ai/artifact/Pkv7ffjrYcHsyXCdvwwvdd (republicar amb l'Artifact tool sobre `index.html`)
- Servidor d'avisos: https://midnight-push.midnightgroup.workers.dev (Cloudflare Workers, pla GRATUÏT; en Pau no vol pagar)

## Fitxers
| Fitxer | Què és |
|---|---|
| `index.html` | Tota l'app (HTML+CSS+JS, format artifact sense `<html>/<head>`). Font única. |
| `build_web.py` | Genera `docs/`: HTML complet, manifest, `sw.js` (offline + push), `cartel.json` (dades del festival per al servidor), CSP i config de push. Talla l'app en compartiments (vegeu Robustesa). |
| `publica-web.sh` | Build + **prova** (`prova/sintaxi.py`; i `prova/prova.js` si el Mac té node+Playwright) + commit + `pull --rebase` + push amb el token. **Així es publica.** Si la prova falla, no publica. |
| `publica-commit.sh` | Publica des del Mac una versió preparada al núvol: baixa `index.html`, `i18n_ca.py` i el `festival.js` d'un commit i fa `publica-web.sh`. Només per a canvis que no toquen build_web/worker/vendor. |
| `festival.py` | Llista els festivals, posa un festival a l'app (`festival.py <id>`) o desa l'actual (`--desa`). |
| `i18n_ca.py` | Textos en català → `docs/ca.html`. |
| `prova/sintaxi.py` | Comprova que tot el JavaScript es pot llegir (al Mac, amb el motor de Safari). |
| `prova/servidor.mjs` | Prova del servidor d'avisos en un Cloudflare simulat (miniflare): login, passi del mòbil, mòbils falsos, fotos. |
| `prova/horari.mjs` | Prova de punta a punta: l'app a Chromium parlant amb el servidor simulat (horari i tasques pel servidor, canvi en 1 min, servidor caigut). `npm i --no-save miniflare@3 playwright` + `python3 -I build_web.py` abans. |
| `prova/prova.js` | Prova a Chromium (iPhone, sense xarxa externa): arrencada, rellotge, graella i totes les pestanyes sense errors. `--trenca=<part>` (`--sintaxi`) trenca una app a propòsit i comprova que el nucli continua; `--trenca=nucli` comprova la pantalla «Reparar»; `--pagina=ca`; `--captures=dir`. **Passar-la (i les `--trenca`) abans de demanar publicar.** |
| `.github/workflows/prova-app.yml` | GitHub torna a fer la prova cada cop que canvia la web publicada; si falla, correu a en Pau. |
| `docs/changes.json` / `docs/tasks.json` | Canvis de l'organització (horari complet + «Aviso para todos»). L'escriu l'editor de l'app via API de GitHub. |
| `push/worker.js` | Servidor: Durable Object SQLite (`Store`) amb els mòbils; cron cada minut; enviament en lots de 40 (`SELF` + `SEND_KEY`). S'atura sol una hora després del final de l'últim dia (`END`, calculat de `cartel.json`). |
| `push/instala.sh` | Instal·la/actualitza el servidor via API de Cloudflare (sense wrangler). |
| `push/claus.sh` | Claus VAPID (ja fetes). |
| `push/retira-web-vella.sh` | (06-11) Retira el worker vell `midnight-app` (còpia del Bass): redirigeix a visualcrew i esborra el service worker dels mòbils que el tenien. Un sol cop, amb l'OK d'en Pau. |
| `icons/make_icon.swift` | Icona vermella «MIDNIGHT APP» (com la de Midnight Suite). |
| `festivals/<id>/` | Un festival per carpeta: `festival.js` (bloc FEST) + `img/` (banner, logos, fonts, il·lustracions). Ja no hi ha `img/` general. |

## Com funciona
- L'app llegeix `changes.json` cada 3 min (cada minut en mode pantalla/TV, i en tornar a primer pla o estirar avall) i `tasks.json` cada 2 min → tothom veu els canvis en pocs minuts. Si falla la connexió es queda l'últim horari bo i diu «sin conexión».
- Editor «Organización» (des del 03-11-2026): la contrasenya s'envia al servidor d'avisos (`POST /admin/login`, 10 intents/15 min per IP) → sessió de 12 h → el servidor publica `changes.json`/`tasks.json` amb el seu token (secret `GH_TOKEN`, de `editor-token` o `github-token`). El token ja NO va dins la web. Contrasenya mínim 8 caràcters (`instala.sh` s'atura si no).
- Seguretat: límits per IP a totes les rutes del servidor; CSP amb `<meta>` (build_web.py; si s'afegeix un domini extern cal afegir-lo a `CSP`); la llibreria d'Excel (SheetJS 0.20.3) és a `vendor/` (des del 04-11; abans jsDelivr 0.18.5, amb CVE). Informe: https://claude.ai/artifact/XNtkYypUoSF1ucYDHBYUhh
- Notificacions amb el mòbil bloquejat (iOS 16.4+, app a la pantalla d'inici): push sense contingut; el SW demana `/now`. Textos dels avisos (worker i sw.js) en castellà, com la UI (05-11). Avisos dels meus artistes (X min abans) i dels canvis/avisos de l'organització. Provat i funcionant el 22-10.
- On viu (revisat 06-11): GitHub = codi + web (Pages, `main` /docs). Cloudflare = només el domini (CNAME visualcrew → paupuig92.github.io, núvol gris) i el servidor d'avisos. El pla B del servidor si l'API de GitHub falla és la mateixa web (`PAGES` = visualcrew), ja no el worker `midnight-app`. Ja no hi ha `docs/_headers` (GitHub Pages l'ignora). Orígens acceptats pel servidor (11-11): només visualcrew i github.io (fora midnight-app i localhost). La prova de GitHub va amb Node 22.
- Estat del servidor: `curl https://midnight-push.midnightgroup.workers.dev/` (nombre de mòbils). Detall: `/debug` amb capçalera `x-send-key` (llegir la clau des del fitxer amb un script, mai mostrar-la).

## Robustesa (06-11-2026, fil «Valorar estructura de l'app i fer-la robusta»)
- **Compartiments**: `build_web.py` talla el `<script>` gran per les marques `// ==== NOM ====` … `// ==== /NOM ====` i posa cada app en un `<script data-part>` propi (sol, multi, momentos, tiempo, timecode, incidencias). Si una peta en arrencar, només s'atura aquella. Les marques no es poden treure ni duplicar (el build s'atura). `index.html` continua sent la font única (l'artifact el fa servir tal qual).
- Cada part acaba amb `PART_OK.add('<nom>')`. **El nucli mai crida una app directament**: `safe('<nom>', () => …)` o `part('<nom>') && …` (showTab, appsPaint, apTick, livePull). Codi que necessiten dues apps va al nucli (p. ex. `mkHMS`). Una app nova = marques noves a `PARTS` de build_web.py + `PART_OK.add` + crides amb `safe`.
- **Xarxa de seguretat** (`<script>` propi abans del principal): `appErr()` desa els errors al mòbil (`midnight-err-v1`, 30 últims, res al servidor) → Ajustes «Errores de la app» (captura + «Reparar la app»). Vigilant: si el rellotge (`APP_BEAT` a `tick()`) no batega en 10 s → pantalla «La app no ha arrancado bien · Reparar la app» (`appFix`: desregistra el SW, esborra les caches menys `midnight-meta` i recarrega; localStorage es manté) i «Seguir igualmente».
- `livePull` amb `finally` (abans, un error deixava `liveBusy` encallat i /live parava per a tothom).

## App tancada fora del festival (09-11-2026, en Pau)
- `FEST.open = ['AAAA-MM-DD', 'AAAA-MM-DD']` (primer i últim dia inclosos, hora de Madrid; Duro: 30-11 → 8-12). Sense `open`: 7 dies abans → l'endemà de l'últim dia. Va també a `cartel.json` (`open`) per al servidor.
- Fora de dates l'app mostra «La app se abre el…» (`gatePaint`, `#gate`) amb la contrasenya d'organització; amb sessió d'admin (`ADM_S`, 12 h, només a la memòria) s'obre. És la cortina: el pany és al servidor (`GATED` a worker.js: /sub, /test, /done, /mc, /mk, /inc, /incst, /live, /mclog, /incimg tornen 403 `closed` sense capçalera `x-s` amb sessió vàlida). L'horari (changes.json a Pages) continua sent públic.
- `fetchT` afegeix `x-s` a les crides al servidor si hi ha sessió. Les fotos d'incidència (`<img>`) no poden portar capçalera: fora de dates hi va `?s=` (només /incimg). Desar al Llavero: usuari invisible fix «Midnight · Organización» (`.kc-user`) als dos formularis de contrasenya.
- `prova/prova.js` posa el rellotge al 1r dia del festival; `--tancat` comprova la cortina.
- **Codi d'equip** (09-11, en Pau): codi a part de la contrasenya d'admin que NOMÉS obre l'app fora de dates (no edita res). Secret `APP_CODE` del fitxer `~/.config/midnight-webapp/app-code` (opcional, ≥ 6 caràcters, diferent de l'admin; `instala.sh` s'atura si no). La pantalla fa `POST /gate/login` (mateixos límits que el login d'admin): codi d'equip → sessió `c.<exp>.<sig>` de 14 dies, desada al mòbil (`<key>-gate-v1`); contrasenya d'admin → sessió d'admin de 12 h (només a la memòria). Canviar el codi invalida totes les sessions d'equip. Una sessió d'equip mai serveix per a `/admin/*`.
- Separació entre festivals (09-11): build_web s'atura si el `key` ja és d'un altre festival de `festivals/`; `/live` porta `fest` i l'app ignora un servidor d'un altre festival (web publicada sense `instala.sh`); la ubicació del Sol/Tiempo (`midnight-sol-v1`) es desa amb `fest` i no passa d'un festival a un altre; `FEST.geo = [lat, lon]` opcional = recinte si no hi ha mapa (abans de Montmeló).
- Auditoria de seguretat 06-11: https://claude.ai/artifact/LsT9yW1puobBf8VnMS8W1a (color de càmera sense injecció, clau secreta de Momentos `mkUid` + prefix públic `mkPub`, límits per IP més baixos i IPv6 per /64, límit global de login).

## Auditoria de ciberseguretat (18-11-2026, fil «Auditar ciberseguretat de l'app»)
- Informe: https://claude.ai/artifact/PsnW6XTqyviXzyRnHw9fYr
- **Passi del mòbil**: en entrar bé un cop (`/admin/login` o `/gate/login`) el servidor torna `k` i l'app el desa (`midnight-dev-v1`) i l'envia als logins següents. Amb passi, el mòbil no depèn del límit global (100 intents FALLATS/hora, `login:all`); el límit per adreça (10/15 min) continua. El passi no obre res. Canviar la contrasenya o el codi l'invalida.
- **Mòbils falsos**: `subs.ok = 1` quan el servei de push ha acceptat algun avís (cron o `/test`). Amb la taula plena (600), un mòbil nou fa fora el més vell sense verificar; els verificats no es toquen.
- `/incimg` torna `nosniff` i memòria cau privada. `instala.sh` ja no enllaça el KV vell `midnight-push-subs` (es pot esborrar).
- `publica-web.sh` s'atura si a la carpeta hi ha fitxers nous que no són de l'app o documents/arxius/claus (el repositori és públic); `.gitignore` els exclou. `publica-commit.sh` comprova que el commit és d'una branca del repositori (GitHub també serveix commits de forks).
- `prova/servidor.mjs`: prova del servidor en un Cloudflare simulat (`npm i --no-save miniflare@3 && node prova/servidor.mjs`). **Passar-la si es toca `push/worker.js`.**
- Riscos acceptats per en Pau (no reobrir sense motiu nou): amb l'app oberta el servidor accepta qualsevol que en sàpiga l'adreça (fotos d'incidència per número, incidències falses); noms i tasques públics a `tasks.json`.
- Pendent de decisió: posar el servidor sota domini propi + regla gratuïta de límit de peticions de Cloudflare (workers.dev no en té).

## Web a Cloudflare Pages + repositori privat (18-11-2026, fil «Moure la web a Cloudflare Pages») — EN CURS
Decisió d'en Pau (18-11): fer-ho abans del Duro, per fases, cadascuna amb el seu OK. Estat: **fase 1 PUBLICADA el 18-11 (main eaa22b2), encara a GitHub Pages.** `push.midnightgroup.app` enllaçat i responent (18-11).
- **Horari i tasques pel servidor**: l'app demana `GET <servidor>/doc/changes.json` i `/doc/tasks.json` (públics, límit per IP). El servidor en guarda una còpia al Durable Object: la refresca de GitHub (amb token i ETag) com a molt cada 90 s (`DOC_FRESH`), de pas a cada cron, i **a l'instant** quan l'editor publica (`/admin/commit`; durant 2 min no fa cas de GitHub si encara torna el d'abans, `DOC_HOLD`). `/live` porta `d: { c, t }` (empremta de cada fitxer; `/doc` la porta a la capçalera `x-doc`): l'app només torna a baixar un fitxer quan l'empremta canvia (`docQuiet`), i igualment un cop cada 15 min. Sense `/live` (app tancada, sense parts) continua mirant cada 3 / 2 min.
- **Pla B**: si el servidor no respon (o és la versió vella: 404 que no és `nodoc`), l'app llegeix `changes.json`/`tasks.json` de la mateixa web com abans, però no aplica mai una còpia MÉS VELLA que la que ja té (`docOlder`). Per això **Cloudflare Pages ha de continuar reconstruint també amb els commits de l'editor** (no excloure'ls a «build watch paths»; límit gratuït 500 builds/mes).
- `publica-commit.sh` baixa amb `git` i el token (ja no de raw.githubusercontent, que no serveix repos privats). `publica-web.sh` salta sol el pas «activa GitHub Pages» si el repo és privat. `build_web.py` torna a generar `docs/_headers` (Cloudflare Pages: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`).
- **Domini propi del servidor**: `instala.sh` intenta enllaçar `push.midnightgroup.app` i només el posa a `push.json` si respon; si no, tot segueix amb workers.dev. workers.dev es manté (mòbils amb la versió vella); la regla gratuïta de límit de peticions (1 regla, 10 s, per IP) només protegeix del tot quan workers.dev s'apagui (després del Duro).
- Revisió de seguretat del canvi (18-11): res greu. Arreglat després (cal `instala.sh`): la còpia de la web (pla B del servidor) mai trepitja una de més nova; si no es pot llegir, no es torna a provar abans de 30 s (`DOC_RETRY`); l'editor no pot publicar un fitxer de més de 400 KB.
- **Projecte de Cloudflare Pages creat el 18-11**: `midnight-webapp` → https://midnight-webapp.pages.dev (repo connectat, branca `main`, carpeta `docs`, sense build, previsualitzacions de branques DESACTIVADES). Provat al Chrome d'en Pau: totes les pàgines 200, `_headers` aplicat, el servidor accepta l'origen. `build_web.py` genera `docs/404.html` (sense ell, Pages torna l'app amb 200 a qualsevol adreça inexistent). El connector de Cloudflare d'aquí pot llegir Pages però no escriure-hi: els canvis es fan al tauler (Chrome d'en Pau).
- Fases que falten: (2, la resta) projecte de Cloudflare Pages connectat al repo (carpeta `docs/`, sense build), provar a `midnight-webapp.pages.dev` (ja és a `ORIGINS`; si el nom surt diferent, canviar-lo) i passar-hi `visualcrew` (núvol taronja); (3) repo privat uns dies després; (4) regla de límit de peticions.
- **Tornada enrere**: abans de fer privat el repo, tornar el CNAME `visualcrew` a `paupuig92.github.io` (núvol gris). Després: repo públic + reactivar Pages + CNAME (15–60 min pel certificat). No treure `docs/CNAME`.
- No provat de veritat (només sintaxi/lògica): `instala.sh` (zsh + Cloudflare) i `publica-commit.sh` amb token. `~/.local/bin/publica-midnight` del Mac (fora del repo) baixa de raw.githubusercontent: deixarà de funcionar amb el repo privat → fer servir `./publica-commit.sh`.

## Regles
- **Abans de publicar (`publica-web.sh` o `push/instala.sh`) SEMPRE preguntar a en Pau** (28-10-2026).
- **Secrets mai es llegeixen, mostren ni copien**: `~/.config/midnight-webapp/*` (github-token, admin-password, admin-salt, cloudflare-token, vapid.json, send-key, push.json). Els scripts els fan servir; jo no.
- Mai demanar la contrasenya d'admin; en Pau desa secrets amb `read -rs`.
- **Mai fer proves escrivint el `docs/changes.json` real** sense preguntar (un cop vaig trepitjar un canvi de l'organització).
- Per canviar l'app: editar `index.html` → `./publica-web.sh` → republicar l'artifact. Si es toca `push/worker.js` → `push/instala.sh`.
- GitHub Pages: ~10 publicacions/hora → l'organització ha d'agrupar canvis.
- Si una acció es denega, no buscar drecera: dir-ho a en Pau.
- Descartat: calendari .ics (no anava a l'iPhone), ubicació en temps real, pagar Cloudflare.

## Detall de cada app → `DETALL-APPS.md`
Sol, microanimacions, Cámaras/multicàmera, Momentos, Tiempo, Timecode, Apps, Mi plan/tasques, millores d'equip, dades d'exemple i decisions descartades (fotos de perfil...). **Llegeix-lo només quan toquis una d'aquestes apps.**

## Festivals (des del 26-10-2026)
- Tot el que canvia d'un festival a un altre és al bloc `/* ==== FESTIVAL ==== */` d'`index.html` (objecte `FEST`: id, key, nom, dia, inici/final, colors, `rides` opcional, escenaris, horari).
- **Cada festival a la seva carpeta `festivals/<id>/`** (`festival.js` + `img/` amb banner.jpg, un `<escenari>.png` per escenari, fonts…). Un festival nou = carpeta nova; no es barreja res (en Pau, 03-11). `build_web.py` agafa les imatges directament de `festivals/<FEST.id>/img/` i les publica a `docs/img/<id>/` (així un mòbil no barreja el banner d'un festival amb el d'un altre).
- Diversos dies: `days: ['Sábado 5', 'Domingo 6']` i hores `2/11:00` (2n dia). Graella amb pestanyes; tasques amb `# Domingo`. Tema: `--mono` opcional per a hores i subtítols.
- `python3 festival.py` (llista) · `python3 festival.py <id>` (el posa a l'app) · `python3 festival.py --desa` (guarda l'actual). Després `./publica-web.sh`.
- `changes.json` porta `fest`: l'app i el servidor ignoren els d'un altre festival (els antics sense `fest` = Bass). Claus del mòbil amb prefix `FEST.key`.
- El servidor d'avisos llegeix dia/hores de `cartel.json`; en canviar de festival esborra els mòbils anteriors. Cal `push/instala.sh` després de publicar un festival nou.
- La còpia `festivals/bass-in-the-park-2026/original/` es va esborrar el 05-11 (queda a l'historial de git: commit df40369).
- Comptador «⏳ quedan X h» fins al final (status + barra fina de dalt).

## Pendent
- Després de cada festival: revisar que el cron del servidor s'atura (`END`), esborrar les dades dels mòbils, revocar tokens caducats (vegeu memòria «seguretat-app»).
- Retocs petits de UI que van quedar: microtextos, vista horitzontal, Organización darrere un enllaç.
