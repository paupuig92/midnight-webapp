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
- L'app llegeix `changes.json` cada 3 min (cada minut en mode pantalla/TV, i en tornar a primer pla o estirar avall) i `tasks.json` cada 2 min → tothom veu els canvis en pocs minuts. Si falla la connexió es queda l'últim horari bo i diu «sin conexión».
- Editor «Organización» (des del 03-11-2026): la contrasenya s'envia al servidor d'avisos (`POST /admin/login`, 10 intents/15 min per IP) → sessió de 12 h → el servidor publica `changes.json`/`tasks.json` amb el seu token (secret `GH_TOKEN`, de `editor-token` o `github-token`). El token ja NO va dins la web. Contrasenya mínim 8 caràcters (`instala.sh` s'atura si no).
- Seguretat: límits per IP a totes les rutes del servidor; CSP amb `<meta>` (build_web.py; si s'afegeix un domini extern cal afegir-lo a `CSP`); la llibreria d'Excel (SheetJS 0.20.3) és a `vendor/` (des del 04-11; abans jsDelivr 0.18.5, amb CVE). Informe: https://claude.ai/artifact/XNtkYypUoSF1ucYDHBYUhh
- Pestanya **Sol** (03-11, per a foto/vídeo, genèrica per a tots els festivals): azimut i altura del sol ara, fletxa amb la brúixola (iPhone: permís en tocar «Activar brújula»), gràfica del dia i hores clau (hora daurada −4°…6°, blava −6°…−4°). Disseny (04-11): una targeta «heroi» (compte enrere + rosa amb la lectura gran al mig: rumb o «Gira X°», arc daurat del camí del sol per fora) + franja de l'horitzó; colors amb les vars del festival, la càmera sempre amb vidre fosc. Tot al mòbil (NOAA), sense xarxa; ubicació a `localStorage` `midnight-sol-v1` (si no, la mitjana dels `geo` del 1r mapa, o Montmeló). Fa servir `now()` (Modo prueba).
  - «Cámaras y contraluz» (orientació de l'escenari + hores de sol de cara per càmera) es va treure el 05-11 (en Pau: «es pot eliminar»).
  - Títol «El sol de ${FEST.name}». A dalt, compte enrere gran (posta / hora daurada / blava / sortida / «Mañana amanece…»), «Gira X°» + «Mira X° por encima del horizonte», franja de l'horitzó i la rosa (lletres sempre dretes). Brúixola de la targeta calmada (zona morta d'1° + filtre de 250 ms). **AR fixa al món** (03-11): gir = alpha/beta/gamma del giroscopi tal qual, sense filtre (el filtre feia que el dibuix «nedés»); la brúixola només ajusta el nord (`AR.off`, 2,5 s, només amb lectura bona i lluny de la vertical). Mai angles separats per dibuixar: matriu sencera.
  - «Ver con la cámara» (AR): càmera de darrere + camí del sol dibuixat (projecció estenopeica; camp de visió sobre el costat llarg de la imatge de la càmera tal com es veu amb object-fit: cover; per defecte 68° = càmera principal de l'iPhone, lliscador 60–140°, desat a `midnight-sol-fov-v2`; els 90–120° d'abans quadraven pel retard). Instruccions s'amaguen soles als 7 s (botó «i»); les hores que xoquen amb sortida/posta no s'escriuen, lliscador d'hora. Càmera i sensors s'aturen en tancar, canviar de pestanya o anar a fons. Sense càmera: cel dibuixat; sense sensors: vista fixa cap al sol (arrossegar). No ha calgut tocar la CSP (`srcObject` no hi passa).
- **Microanimacions** (04-11, inspirades en bencho.dev; només transform/opacitat, res amb «Reducir movimiento»): `flap()` = el nom de l'artista gira i remena lletres en canviar de set; `roll()` = xifres que rodolen als «quedan» (files, targeta Quedan, Sol); ✓ de Mi plan es dibuixa i ratlla abans de marxar (`planHold`); avisos de l'organització (`toast(…,'org')`) van a la píndola negra de dalt (`island()`); «Guardar y publicar» de l'editor = llisca per publicar (`slideFor`, el botó real queda amagat); estirar avall a dalt de tot = recarregar canvis/tasques. Barra de «quedan» del que sona s'omple cada segon (`liveBars`/`setBar`, scaleX amb transició d'1 s); la graella llisca suau fins a la línia d'«ara» quan entra a la vista (`glideToNow`, IntersectionObserver).
- Notificacions amb el mòbil bloquejat (iOS 16.4+, app a la pantalla d'inici): push sense contingut; el SW demana `/now`. Textos dels avisos (worker i sw.js) en castellà, com la UI (05-11). Avisos dels meus artistes (X min abans) i dels canvis/avisos de l'organització. Provat i funcionant el 22-10.
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
- La còpia `festivals/bass-in-the-park-2026/original/` es va esborrar el 05-11 (queda a l'historial de git: commit df40369).
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
- Robustesa (04-11): els canvis sense cobertura es guarden al mòbil (`mcOut`, localStorage) i es reenvien sols; només s'envien els camps que canvien i el worker només actualitza aquests (dos mòbils no es trepitgen). `uid` fix per càmera a les dades (no canviar-lo). `lim` = minuts de targeta/bateria → «REC 1 h 52» groc/vermell (columna `since` del worker). Historial: taula `mclog` (500), `GET /mclog`. Pastilla d'un toc a cada fila, «Igual que el sábado», «Ocultar 3D». La llista «Material» (checklist local) es va treure el 05-11 (decisió d'en Pau). El REC batega només al número (CSS), el 3D no es redibuixa.
- «Mover cámaras»: qualsevol de l'equip arrossega una càmera pel terra i en tria alçada/direcció/inclinació. Es desa al servidor com una entrada més de `/mc` amb id `<càmera>-pos` i nota `x,y,z,dir,incl` (no cal reinstal·lar el worker). Sense direcció, apunta sola (públic → pantalla; escenari → públic). Con de visió segons l'òptica.

## Momentos i Tiempo (des del 04-11-2026)
- **Momentos** (marques per a l'edició): botó «Marcar momento» dins de l'app Momentos (Apps; des del 05-11 ja no flota a Horarios perquè es tocava sense voler) → hora exacta + escenari + artista que sona; etiqueta (Drop, Público, Artista, Backstage, Fallo) i nota opcionals. Compartits via servidor (`POST/GET /mk`, taula `mk`; cadascú només esborra les seves per `uid` del mòbil). Cal `push/instala.sh` després de publicar. Sense cobertura es desen al mòbil (`<key>-mk-v1`) i s'envien sols.
- Exportació amb timecode d'hora del dia (Madrid), fps 25/24/30/50 i «Ajuste» en s: DaVinci = EDL de marcadors (Timeline › Import › Timeline Markers from EDL), Final Cut = FCPXML 1.10 (projecte amb un gap i els marcadors), CSV amb `;` per a Excel. Només encaixa si les càmeres graven TC hora del dia sincronitzat.
- **Tiempo** (dins d'Apps; estil Windy, NOMÉS PLUJA I NÚVOLS per decisió d'en Pau): mapa gran amb capes Lluvia (radar RainViewer de les últimes 2 h + previsió de pluja a la mateixa barra de temps), Nubes (previsió) i Windy (widget oficial embed.windy.com en iframe). Graella de 7×7 punts d'Open-Meteo (precipitation, cloud_cover, 48 h) interpolada. Resum «Lluvia en ~X min / a las HH / Sin lluvia», taula per hores (pluja, prob., núvols, temp.) i dies del festival. Ubicació = `solWhere()`. Mapa de fons PROPI (05-11; CARTO ara demana clau): `vendor/mapa-base.json` (Natural Earth, domini públic: costa, fronteres, províncies, rius i poblacions del NE peninsular) que build_web.py injecta a `/*MAPA*/`; es pinta en un canvas amb els colors del tema (clar/fosc). Controls del mapa amb les vars del tema. CSP: open-meteo, rainviewer, tile.openstreetmap.org, frame-src embed.windy.com.
  - **Mapa, 05-11 tarda** (petició d'en Pau): capa de **carreteres** = rajoles d'OpenStreetMap (gratuïtes, sense clau, ús lleuger; atribució «© OpenStreetMap» al mapa i a la nota) a sobre del mapa propi, que queda de reserva si no arriben; botó de carretera sota el zoom (`tqRoads`, `midnight-tiempo-osm`); en tema fosc s'inverteixen amb CSS. **Zoom amb dos dits** (touch events, escala CSS mentre es pessiga i redibuixa al nivell més proper; roda del ratolí a l'ordinador), zoom 6–11 (`TQ_ZMAX`). Botó **«Ahora»** sota les capes: para la reproducció i torna la barra a l'últim radar / l'hora actual. Fotogrames del radar: els 3 últims i el següent al que es mostra es carreguen de seguida (abans, amb `lazy`, quedaven rajoles buides en canviar de fotograma). Una rajola que falla s'esborra. **Radar del mapa amb rajoles de 256 px del zoom 7** (ampliades amb CSS). La **franja sense pluja** (05-11) era la regla global `img { max-width: 100% }`: retallava cada rajola (512 px CSS) a l'amplada del mapa i deixava un forat just sobre el festival; ara `#tqRad img` i `#tqOsm img` porten `max-width: none` (provat amb rajoles falses de colors). També feia que el zoom semblés estrany. El pessic s'amplia des del punt del festival (el mapa no es desplaça) i n'hi ha prou amb ×1,3 per canviar de nivell; es frenen els `gesture*` d'iOS perquè no s'ampliï la pàgina.
  - **Precisió** (05-11, en Pau: «el més precís possible, hem de saber si plou»): la pluja del punt surt del model més fi que cobreix el lloc (`TQ_MOD`: AROME HD 1,3 km → HARMONIE 2/5,5 km → ICON-EU → ECMWF 9 km → UKMO → GFS; el best_match donava ICON-EU 7 km a Catalunya), també als quarts d'hora. «Prob.» = la d'Open-Meteo. Mapa: `meteofrance_seamless` amb best_match on no n'hi ha. Tot directe del mòbil a Open-Meteo (gratuït). **Tret el 05-11 a la tarda** (en Pau: «Meteocat + la més precisa»): la fila «Modelos» i el conjunt de 91 simulacions (ensemble, ~200 KB/h); no tornar-ho a proposar.
  - **Pluja en temps real** (05-11): targeta de radar a dalt de Tiempo (`tqLive`). Llegeix els píxels dels 3 últims fotogrames de RainViewer (zoom 7, ~0,9 km/px, paleta Universal Blue → dBZ amb `TQ_UB`; pluja ≥ 15 dBZ) en ±55 km del punt: «Llueve ahora en el recinto» + intensitat, o «Lluvia a X km al NO», moviment (comparant el de fa 20 min amb l'últim) i «Llega en ~X min / Puede parar» extrapolant en línia recta (aproximat, fins a 2 h; comptat des d'ara, no des de l'hora del radar). Mini radar amb anells de 10/25 km i fletxa. El resum i la fitxa d'Apps fan cas del radar si té < 40 min. Es refresca amb el rellotge de 5 min de Tiempo (via `tqRadar`); l'API gratuïta de RainViewer ja no dona nowcast ni zoom > 7.
  - **Sense xarxa** (05-11): si Open-Meteo o Meteocat fallen, no es torna a provar fins passats 2 min (`tqFail`/`tqPlFail`, `TQ_RETRY`); abans `appsPaint()`↔`tqFetch()` reintentaven sense parar (~1 petició/s).
  - **Pluviòmetres de Meteocat** (05-11, idea d'en Pau): pluja MESURADA a les 3 estacions XEMA més properes (≤ 20 km, només a Catalunya): «última hora» i «hoy». Dades obertes de la Generalitat (`analisi.transparenciacatalunya.cat`, Socrata, sense clau, CORS obert, a la CSP): estacions `yqwd-vj5e` (desades 7 dies a `midnight-xema-est-v1`) i lectures `nzvn-apee` (variable 35 = mm per 30 min, hora UTC, ~20–60 min de retard). Cada 15 min com a molt (`tqPlFetch`). L'API oficial de Meteocat (previsions, radar) demana clau i hauria de passar pel servidor: descartat de moment.
- **Apps** (hub, 04-11 tarda, petició d'en Pau): a baix només Horarios · Tareas · Apps · Ajustes. Dins d'Apps (fitxes amb dades en directe), en l'ordre que vol en Pau: Timecode (ample) · Tiempo + Sol · Momentos + Multicams · Mapa (si n'hi ha). Les seccions d'una app porten «‹ Apps» (`.appback`, s'afegeix per JS; `APP_TABS`). Botó «Abrir en Windy» a Tiempo (Windy no té API gratuïta de dades).
- **Timecode** (abans «Claqueta»): timecode d'hora del dia en gran (fps 25/24/30/50), nom de càmera/targeta, destell blanc + pitet 1 kHz just al canvi de segon ×3, pantalla sempre encesa (Wake Lock). Serveix per saber el desfasament de cada càmera i posar-lo a l'«Ajuste» dels Momentos.

## Mi plan · tasques de l'equip (des del 28-10-2026)
- L'organització escriu l'equip i les tasques a Organización → **Tareas** (contrasenya) → publica `docs/tasks.json` (mateix commit per API que changes.json). Porta `fest`.
- Equip: `Nom: grup1, grup2`. Tasques: `18:30 Text @Nom @grup @todos`, `18:30-19:00 …`, línia només amb `@Marc` = per a les de sota, o enganxar d'Excel (hora⇥tasca⇥qui). 6:00–12:00 = muntatge del mateix dia; de matinada = l'endemà. Diversos dies: `# Domingo` a sobre o `2/10:30` davant l'hora (05-11, com als sets).
- Cadascú tria **«Soy…»** a Configuración (sense codi, decisió d'en Pau: no passa res si algú veu la feina d'un altre). Secció «Mi plan» a dalt: el que va tard, el que toca i les 6 següents; ✓ per marcar.
- ✓ al mòbil + servidor d'avisos (`POST/GET /done`, taula `done`) → **Vista global** a Organización (persona × hora, verd fet / vermell tard).
- Avisos de tasques: `subs.yo` + `subs.tb` (Configuración → «Avisarme de mis tareas»); el cron llegeix `tasks.json`. Cal `push/instala.sh` després de publicar el worker.

## Fotos de perfil
- Fetes el 05-11 al matí i **tretes el mateix dia** (en Pau: «ens les petem»): el worker fa `DROP TABLE av`; a l'app queda només la inicial dins la rodona (`faceIn`). No tornar-ho a proposar.

## Pendent
- Després de cada festival: revisar que el cron del servidor s'atura (`END`), esborrar les dades dels mòbils, revocar tokens caducats (vegeu memòria «seguretat-app»).
- Retocs petits de UI que van quedar: microtextos, vista horitzontal, Organización darrere un enllaç.
