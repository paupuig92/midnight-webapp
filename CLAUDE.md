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
| `festivals/<id>/` | Un festival per carpeta: `festival.js` (bloc FEST) + `img/` (banner, logos, fonts, il·lustracions). Ja no hi ha `img/` general. |

## Dades
- Noms i ordre: el cartell (definitiu). Hores exactes i importància: el full de Google https://docs.google.com/spreadsheets/d/1AVNK52llp2q5DbKVEEyUgZIkpxYmw-UW20bCTzUQI48
- Importància per colors: vermell 5 > taronja 4 > groc/ocre 3 > verd 2 > blau 1. Sound System sense color.
- Escenaris: No Es Ruido, Toxik Parties, Pont Aeri, Misa Psicodélika, Migats Sound System + Atracciones (12:00–01:00).
- Canvi d'hora la nit del festival: `T("HH:MM[a|b]")`; les 2:00 surten dues vegades (1ª/2ª).
- Colors fixos: groc = meus artistes, magenta (`--chg`) = canvi, vermell = ara.

## Com funciona
- L'app llegeix `changes.json` cada 60 s → tothom veu els canvis en 1–2 min. Si falla la connexió es queda l'últim horari bo i diu «sin conexión».
- Editor «Organización» (des del 03-11-2026): la contrasenya s'envia al servidor d'avisos (`POST /admin/login`, 10 intents/15 min per IP) → sessió de 12 h → el servidor publica `changes.json`/`tasks.json` amb el seu token (secret `GH_TOKEN`, de `editor-token` o `github-token`). El token ja NO va dins la web. Contrasenya mínim 8 caràcters (`instala.sh` s'atura si no).
- Seguretat: límits per IP a totes les rutes del servidor; CSP amb `<meta>` (build_web.py; si s'afegeix un domini extern cal afegir-lo a `CSP`); la llibreria d'Excel (SheetJS 0.20.3) és a `vendor/` (des del 04-11; abans jsDelivr 0.18.5, amb CVE). Informe: https://claude.ai/artifact/XNtkYypUoSF1ucYDHBYUhh
- Pestanya **Sol** (03-11, per a foto/vídeo, genèrica per a tots els festivals): azimut i altura del sol ara, fletxa amb la brúixola (iPhone: permís en tocar «Activar brújula»), gràfica del dia i hores clau (hora daurada −4°…6°, blava −6°…−4°). Disseny (04-11): una targeta «heroi» (compte enrere + rosa amb la lectura gran al mig: rumb o «Gira X°», arc daurat del camí del sol per fora) + franja de l'horitzó; colors amb les vars del festival, la càmera sempre amb vidre fosc. Tot al mòbil (NOAA), sense xarxa; ubicació a `localStorage` `midnight-sol-v1` (si no, la mitjana dels `geo` del 1r mapa, o Montmeló). Fa servir `now()` (Modo prueba).
  - Títol «El sol de ${FEST.name}». A dalt, compte enrere gran (posta / hora daurada / blava / sortida / «Mañana amanece…»), «Gira X°» + «Mira X° por encima del horizonte», franja de l'horitzó i la rosa (lletres sempre dretes). Brúixola de la targeta calmada (zona morta d'1° + filtre de 250 ms). **AR fixa al món** (03-11): gir = alpha/beta/gamma del giroscopi tal qual, sense filtre (el filtre feia que el dibuix «nedés»); la brúixola només ajusta el nord (`AR.off`, 2,5 s, només amb lectura bona i lluny de la vertical). Mai angles separats per dibuixar: matriu sencera.
  - «Ver con la cámara» (AR): càmera de darrere + camí del sol dibuixat (projecció estenopeica; camp de visió sobre el costat llarg de la imatge de la càmera tal com es veu amb object-fit: cover; per defecte 68° = càmera principal de l'iPhone, lliscador 60–140°, desat a `midnight-sol-fov-v2`; els 90–120° d'abans quadraven pel retard). Instruccions s'amaguen soles als 7 s (botó «i»); les hores que xoquen amb sortida/posta no s'escriuen, lliscador d'hora. Càmera i sensors s'aturen en tancar, canviar de pestanya o anar a fons. Sense càmera: cel dibuixat; sense sensors: vista fixa cap al sol (arrossegar). No ha calgut tocar la CSP (`srcObject` no hi passa).
- **Microanimacions** (04-11, inspirades en bencho.dev; només transform/opacitat, res amb «Reducir movimiento»): `flap()` = el nom de l'artista gira i remena lletres en canviar de set; `roll()` = xifres que rodolen als «quedan» (files, targeta Quedan, Sol); ✓ de Mi plan es dibuixa i ratlla abans de marxar (`planHold`); avisos de l'organització (`toast(…,'org')`) van a la píndola negra de dalt (`island()`); «Guardar y publicar» de l'editor = llisca per publicar (`slideFor`, el botó real queda amagat); estirar avall a dalt de tot = recarregar canvis/tasques. Barra de «quedan» del que sona s'omple cada segon (`liveBars`/`setBar`, scaleX amb transició d'1 s); la graella llisca suau fins a la línia d'«ara» quan entra a la vista (`glideToNow`, IntersectionObserver).
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
- **Cada festival a la seva carpeta `festivals/<id>/`** (`festival.js` + `img/` amb banner.jpg, un `<escenari>.png` per escenari, fonts…). Un festival nou = carpeta nova; no es barreja res (en Pau, 03-11). `build_web.py` agafa les imatges directament de `festivals/<FEST.id>/img/` i les publica a `docs/img/<id>/` (així un mòbil no barreja el banner d'un festival amb el d'un altre).
- Diversos dies: `days: ['Sábado 5', 'Domingo 6']` i hores `2/11:00` (2n dia). Graella amb pestanyes; tasques amb `# Domingo`. Tema: `--mono` opcional per a hores i subtítols.
- `python3 festival.py` (llista) · `python3 festival.py <id>` (el posa a l'app) · `python3 festival.py --desa` (guarda l'actual). Després `./publica-web.sh`.
- `changes.json` porta `fest`: l'app i el servidor ignoren els d'un altre festival (els antics sense `fest` = Bass). Claus del mòbil amb prefix `FEST.key`.
- El servidor d'avisos llegeix dia/hores de `cartel.json`; en canviar de festival esborra els mòbils anteriors. Cal `push/instala.sh` després de publicar un festival nou.
- `festivals/bass-in-the-park-2026/original/` = còpia exacta de tota l'app tal com va funcionar al Bass.
- Comptador «⏳ quedan X h» fins al final (status + barra fina de dalt).

## Millores d'equip (04-11-2026, fil «Proposar i implementar millores»)
- **Tasques de menys de 5 min** (cues): l'app ja no en feia avís (`tkCue`); ara tampoc el servidor (`dueTasks` salta `b - a < 5 min`).
- **Nota per a l'equip** a cada actuació (camp `note` del set a `changes.json`, màx. 120): s'escriu a l'editor («Nota para el equipo»), surt a la fila d'«Ahora suena», a la graella i al text de l'avís (app i servidor).
- **«Actualizado hace X min»** a la línia d'estat (hora real de l'últim `changes.json` bo, `<key>-sync` a localStorage); en vermell si fa ≥ 10 min o sense connexió.
- **Incidències** («Avisar a producción», pestanya Tareas): text + urgent + foto opcional (JPEG reduït al mòbil, < 250 KB). Servidor: taula `inc`, `POST /inc`, `POST /incst` (resolta/reobrir), `GET /inc` (últimes 60, sense foto), `GET /incimg?n=`. Push (≤ 1 min) als mòbils amb «Avisarme de incidencias» (columna `subs.inc`; per defecte Producció). Sense contrasenya, com les ✓. Cal `push/instala.sh`.
- Català: repàs de textos que quedaven en castellà (i18n_ca.py).

## Cámaras · multicàmera (des del 04-11-2026)
- Pestanya pròpia. Dades a `FEST.multicam` (fora de l'objecte FEST, dins el bloc del festival): escenaris, càmeres (`c` color, `pos`, `cam`, `opt`, `acc`, `at` = % sobre la il·lustració, `at3d` = [x, y, z] en metres, `aim` opcional = [direcció°, inclinació°]), `rider`.
- Estat compartit (Montada/Grabando…, SSD, nota) per dia via servidor (`POST/GET /mc`).
- 3D amb three.js 0.170 (`vendor/`, el copia build_web només si hi ha `scene3d:`). Model procedural a `scene3d` (mides del stage plot). Looks «noche» i «plano» (com el PDF). Gestos: 1 dit gira (inèrcia), 2 dits apropen/mouen/giren, doble toc torna.
- Robustesa (04-11): els canvis sense cobertura es guarden al mòbil (`mcOut`, localStorage) i es reenvien sols; només s'envien els camps que canvien i el worker només actualitza aquests (dos mòbils no es trepitgen). `uid` fix per càmera a les dades (no canviar-lo). `lim` = minuts de targeta/bateria → «REC 1 h 52» groc/vermell (columna `since` del worker). Historial: taula `mclog` (500), `GET /mclog`. Pastilla d'un toc a cada fila, «Igual que el sábado», «Ocultar 3D». El REC batega només al número (CSS), el 3D no es redibuixa.
- «Mover cámaras»: qualsevol de l'equip arrossega una càmera pel terra i en tria alçada/direcció/inclinació. Es desa al servidor com una entrada més de `/mc` amb id `<càmera>-pos` i nota `x,y,z,dir,incl` (no cal reinstal·lar el worker). Sense direcció, apunta sola (públic → pantalla; escenari → públic). Con de visió segons l'òptica.

## Momentos i Tiempo (des del 04-11-2026)
- **Momentos** (marques per a l'edició): botó «Marcar momento» dins de l'app Momentos (Apps; des del 05-11 ja no flota a Horarios perquè es tocava sense voler) → hora exacta + escenari + artista que sona; etiqueta (Drop, Público, Artista, Backstage, Fallo) i nota opcionals. Compartits via servidor (`POST/GET /mk`, taula `mk`; cadascú només esborra les seves per `uid` del mòbil). Cal `push/instala.sh` després de publicar. Sense cobertura es desen al mòbil (`<key>-mk-v1`) i s'envien sols.
- Exportació amb timecode d'hora del dia (Madrid), fps 25/24/30/50 i «Ajuste» en s: DaVinci = EDL de marcadors (Timeline › Import › Timeline Markers from EDL), Final Cut = FCPXML 1.10 (projecte amb un gap i els marcadors), CSV amb `;` per a Excel. Només encaixa si les càmeres graven TC hora del dia sincronitzat.
- **Tiempo** (dins d'Apps; estil Windy, NOMÉS PLUJA I NÚVOLS per decisió d'en Pau): mapa gran amb capes Lluvia (radar RainViewer de les últimes 2 h + previsió de pluja a la mateixa barra de temps), Nubes (previsió) i Windy (widget oficial embed.windy.com en iframe). Graella de 7×7 punts d'Open-Meteo (precipitation, cloud_cover, 48 h) interpolada. Resum «Lluvia en ~X min / a las HH / Sin lluvia», taula per hores (pluja, prob., núvols, temp.) i dies del festival. Ubicació = `solWhere()`. Mapa de fons PROPI (05-11; CARTO ara demana clau): `vendor/mapa-base.json` (Natural Earth, domini públic: costa, fronteres, províncies, rius i poblacions del NE peninsular) que build_web.py injecta a `/*MAPA*/`; es pinta en un canvas amb els colors del tema (clar/fosc). Controls del mapa amb les vars del tema. CSP: open-meteo, rainviewer, frame-src embed.windy.com.
  - **Precisió** (05-11, en Pau: «el més precís possible, hem de saber si plou»): la pluja del punt surt del model més fi que cobreix el lloc (`TQ_MOD`: AROME HD 1,3 km → HARMONIE 2/5,5 km → ICON-EU → ECMWF 9 km → UKMO → GFS; el best_match donava ICON-EU 7 km a Catalunya), també als quarts d'hora. Fila «Modelos» = quants dels 7 veuen pluja. «Prob.» = % de les 91 simulacions dels conjunts ECMWF+ICON-EU (`ensemble-api.open-meteo.com`, a la CSP; ~200 KB, màx. 1 cop/h, només es desen recomptes). Dies del festival: % de simulacions amb ≥ 0,5 mm i ≥ 2 mm en l'horari (només quan el dia és a menys de ~15 dies). Mapa: `meteofrance_seamless` amb best_match on no n'hi ha. Tot directe del mòbil a Open-Meteo (gratuït).
- **Apps** (hub, 04-11 tarda, petició d'en Pau): a baix només Horarios · Tareas · Apps · Ajustes. Dins d'Apps (fitxes amb dades en directe), en l'ordre que vol en Pau: Timecode (ample) · Tiempo + Sol · Momentos + Multicams · Mapa (si n'hi ha). Les seccions d'una app porten «‹ Apps» (`.appback`, s'afegeix per JS; `APP_TABS`). Botó «Abrir en Windy» a Tiempo (Windy no té API gratuïta de dades).
- **Timecode** (abans «Claqueta»): timecode d'hora del dia en gran (fps 25/24/30/50), nom de càmera/targeta, destell blanc + pitet 1 kHz just al canvi de segon ×3, pantalla sempre encesa (Wake Lock). Serveix per saber el desfasament de cada càmera i posar-lo a l'«Ajuste» dels Momentos.

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
