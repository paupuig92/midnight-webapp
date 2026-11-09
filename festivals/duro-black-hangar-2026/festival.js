/* ==== FESTIVAL ==== */
// Tot el que canvia d'un festival a un altre és dins d'aquest bloc. Cada festival en té una còpia a
// festivals/<id>/festival.js, i `python3 festival.py <id>` la posa aquí i copia els seus logos a img/.
// ESBORRANY (03-11): branding del cartell i horari d'en Pau (2 dies, 1 escenari). Falten importàncies i mapa.
const FEST = {
  id: 'duro-black-hangar-2026', // també separa els canvis de l'organització (changes.json) d'un festival a un altre
  key: 'duro',                  // prefix de les dades guardades al mòbil (preferits, avisos…): un de diferent per festival
  name: 'Black Hangar',
  banner: 'Black Hangar x Duro · 5 + 6 dic · Can Guitet, Montmeló',  // text alternatiu de img/banner.jpg
  bannerVideo: 'img/banner.mp4',  // la cúpula del cartell animat (black-hangar-cartell-anim.mov) que s'encén, 2 s en bucle; img/banner.jpg n'és el pòster
  date: [2026, 12, 5],          // primer dia
  // App oberta per a l'equip (09-11): del primer a l'últim dia (inclosos). Fora d'aquestes dates, només l'admin.
  // Sense «open»: 7 dies abans → l'endemà de l'últim dia
  open: ['2026-11-30', '2026-12-08'],
  geo: [41.5536, 2.2492],       // on és el recinte (Sol i Tiempo, si no hi ha mapa): Espai Can Guitet, Montmeló
  // Diversos dies (opcional): un nom per dia, seguits a partir de «date». Cada dia de «start» a «end». A l'horari, «2/11:00» = 2n dia
  days: ['Sábado 5', 'Domingo 6'],
  start: '11:00', end: '23:00',
  // Blanc i negre com el cartell: l'accent és blanc (el vermell d'«ara» i el groc dels meus artistes es queden)
  accent: '#f2f2f2', accentRgb: '242, 242, 242', accentDim: '#7a7c80', accentDeep: '#16171a', accentInk: '#050608',
  theme: { '--bg': '#050608', '--panel': '#0f1013', '--ink': '#f5f5f5', '--muted': '#9a9ca2', '--rule': '#2a2c31', '--line': '#3d4046',
    '--display': '"Nimbus", "Helvetica Neue", sans-serif', '--body': '"Nimbus", "Helvetica Neue", sans-serif',
    '--title': '"Anybody", "Nimbus", "Helvetica Neue", sans-serif', '--cond': '"Nimbus Cond", "Nimbus", sans-serif',
    '--mono': '"Martian Mono", ui-monospace, monospace' },
  // Mode clar (opcional; cadascú tria a Ajustes → Tema): blanc trencat i negre, com el panell del 240 km/h del cartell.
  // Els significats es mantenen: vermell = ara, groc = meus (més fosc perquè es vegi sobre blanc), lila = canvi
  light: { '--bg': '#ececea', '--panel': '#fafaf8', '--ink': '#0b0c0e', '--muted': '#55585f', '--rule': '#cdced1', '--line': '#9fa1a6',
    '--accent': '#0b0c0e', '--accent-rgb': '11, 12, 14', '--accent-dim': '#8e9095', '--accent-deep': '#dcdde0', '--accent-ink': '#fafaf8',
    '--now': '#e0162b', '--fav': '#f2b200', '--fav-ink': '#8f6300', '--chg': '#8a6bff' },
  // Tipografia de la marca: Nimbus Sans L (branding de Duro 5 i el full «duro-festival-tipografies»)
  fonts: [
    { family: 'Nimbus', file: 'NimbusSanL-Regu.woff2', weight: '300 500' },
    { family: 'Nimbus', file: 'NimbusSanL-Bold.woff2', weight: '600 900' },
    { family: 'Nimbus Cond', file: 'NimbusSanL-BoldCond.woff2', weight: '400 900' },
    { family: 'Anybody', file: 'Anybody.woff2', weight: '100 900', stretch: '50% 150%' },  // textos grans; Google Fonts, OFL (Anybody-OFL.txt). La Nickel Gothic del cartell és de pagament
    { family: 'Martian Mono', file: 'MartianMono.woff2', weight: '100 800' },  // Google Fonts, llicència OFL (MartianMono-OFL.txt)
  ],
  nextHide: { stages: [], imp: [1] },
  impColors: true,
  impSize: true,
  rides: [],
  // Logos de cada dia (dissabte Universo Makina, diumenge 240 km/h): a les pestanyes de dia i a la targeta «Quedan»; al final, el de Black Hangar
  deco: { days: ['img/logo-makina.png', 'img/logo-240.png'], end: 'img/logo-blackhangar.png' },
  colorLogos: true,             // el logo de l'escenari és blanc: sobre fons fosc i amb el nom a sota
  // Un sol escenari: el logo és img/hangar.png. Dissabte Universo Makina, diumenge 240 km/h (img/logo-makina.png i logo-240.png, per si calen)
  stages: [
    { id: 'hangar', name: 'Black Hangar' },
  ],
  // Horari (en Pau, 03-11): [inici, final, nom, importància 5 (vermell) … 1 (blau), 0 = sense color, subtítol]
  // El final és l'inici del següent; l'últim, les 23:00. PENDENT: importàncies (de moment 0)
  sets: {
    hangar: [
      // Sábado 5 · Universo Makina
      ['11:00', '12:30', 'Nhymph', 0],
      ['12:30', '13:30', 'Anna Jevills', 0],
      ['13:30', '14:30', 'Cristian Varela', 0, 'Late 90’s – early 00’s set'],
      ['14:30', '15:30', 'Carlos Perez & K-Style', 0, 'Esencia del Norte 00’s'],
      ['15:30', '17:00', 'Héctor Oaks aka DJ Kaos11', 0, 'Bakala set'],
      ['17:00', '23:00', 'Pastis & Buenri & Sisu', 0, '6 hours set'],
      // Domingo 6 · 240 km/h
      ['2/11:00', '2/12:00', 'Føbia', 0],
      ['2/12:00', '2/13:00', 'Anna Jevills', 0],
      ['2/13:00', '2/14:00', 'Inés Isla', 0],
      ['2/14:00', '2/15:00', 'H1pnos1s b2b Quince', 0],
      ['2/15:00', '2/16:00', 'Giø', 0],
      ['2/16:00', '2/17:00', 'Human Error', 0],
      ['2/17:00', '2/18:00', 'Carnada', 0],
      ['2/18:00', '2/19:00', 'Adrián Mills', 0],
      ['2/19:00', '2/20:00', 'Cloudy', 0],
      ['2/20:00', '2/21:00', 'Aerea', 0, 'Live'],
      ['2/21:00', '2/22:00', 'Clara Cuvé', 0],
      ['2/22:00', '2/23:00', 'Kuko b2b Nikolina', 0],
    ],
  },
};
// Estil del cartell (FEST.css): creus «+» a les cantonades, fons de punts, etiquetes en mono amb «↓», línies blanques fines,
// la cúpula de reixa a la targeta «Quedan» (blava el dissabte, com el cartell d'Universo Makina) i el terra de llum a baix.
// Res no es mou (bateria). img/deco-dome.webp i deco-floor.webp surten dels carrusels i del cartell per dies.
// Compte: fora de l'objecte FEST (build_web.py només llegeix l'objecte) i sense «}» seguit de «;» aquí dins.
FEST.css = `
:root { --plus: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2711%27 height=%2711%27%3E%3Cpath d=%27M5.5 0v11M0 5.5h11%27 stroke=%27%23fff%27 stroke-width=%271.3%27/%3E%3C/svg%3E");
  --plus-dim: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2711%27 height=%2711%27%3E%3Cpath d=%27M5.5 0v11M0 5.5h11%27 stroke=%27%23fff%27 stroke-opacity=%27.55%27 stroke-width=%271.2%27/%3E%3C/svg%3E");
  --hair: rgba(255, 255, 255, .2); --r-card: 3px; --r-btn: 3px; --mk-blue: #1d2fb4; }
/* fons de punts finíssims, com el del cartell */
body { background-image: radial-gradient(circle, rgba(255, 255, 255, .075) .8px, transparent 1.2px); background-size: 16px 16px; }
/* seccions: línia blanca fina amb una creu a cada punta; títol amb fletxa en mono */
.wrap > section:not(.admin):not(.tools) { padding-top: 20px;
  background: var(--plus) 0 0 no-repeat, var(--plus) 100% 0 no-repeat, linear-gradient(var(--hair), var(--hair)) 0 5px / 100% 1px no-repeat; }
.wrap > section h2 { letter-spacing: -.005em; }
.wrap > section h2::after { content: " ↓"; font: 300 .72em/1 var(--mono); color: var(--muted); letter-spacing: 0; vertical-align: .08em; }
.wrap > section .shead h2::after, #horario > h2::after { white-space: nowrap; }
/* etiquetes petites en mono, com «11:00 A 23:00 H» del cartell */
.brandline { font-family: var(--mono); font-weight: 500; font-size: 10px; letter-spacing: .06em; }
.brandline b { font-weight: 700; }
.brandline .mwho { font-family: var(--body); letter-spacing: 0; }
.clock { letter-spacing: -.045em; }
.clock small { font: 400 .2em var(--mono); letter-spacing: 0; margin-left: .3em; }
.row .sn, .mascot .mk, .upnext li.grp, .upnext .where, .blk .t, .legend { font-family: var(--mono); }
.row .sn { font-size: 10px; font-weight: 500; letter-spacing: .06em; }
.mascot .mk { font-size: 10px; font-weight: 500; letter-spacing: .08em; color: var(--ink); }
.mascot .mk::after { content: " ↓"; color: var(--muted); }
.upnext li.grp b { font-family: var(--mono); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.upnext li.grp span { color: var(--muted); font-size: 11px; }
/* «Ahora suena»: targeta quadrada amb vora blanca fina, creus i una mica de llum des de dalt (el feix del cartell) */
.row.live { border-radius: var(--r-card);
  background: var(--plus-dim) left 5px top 5px / 8px no-repeat, var(--plus-dim) right 5px top 5px / 8px no-repeat,
    radial-gradient(90% 120% at 82% -20%, rgba(255, 255, 255, .11), transparent 62%), var(--panel);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .26), inset 3px 0 0 var(--sc, transparent); }
.row .bar { height: 2px; }
/* «Quedan»: la cúpula de reixa dels carrusels; dissabte, el blau d'Universo Makina; diumenge, grafit com el 240 km/h */
.mascot { position: relative; border-radius: var(--r-card); overflow: hidden; box-shadow: inset 0 0 0 1px var(--hair);
  background: var(--plus) left 6px top 6px / 9px no-repeat, var(--plus) right 6px top 6px / 9px no-repeat,
    var(--plus) left 6px bottom 6px / 9px no-repeat, var(--plus) right 6px bottom 6px / 9px no-repeat,
    url("img/deco-dome.webp") center top / 100% auto no-repeat, var(--panel); padding: 22px 18px 18px; }
[data-day="0"] .mascot { box-shadow: inset 0 0 0 1px rgba(140, 160, 255, .35);
  background: var(--plus) left 6px top 6px / 9px no-repeat, var(--plus) right 6px top 6px / 9px no-repeat,
    var(--plus) left 6px bottom 6px / 9px no-repeat, var(--plus) right 6px bottom 6px / 9px no-repeat,
    url("img/deco-dome.webp") center top / 100% auto no-repeat,
    radial-gradient(130% 110% at 100% 0%, #2a3fd6 0%, #1426a0 38%, #0a1258 72%, #070b30 100%); }
[data-day="0"] .mascot .msub, [data-day="0"] .mascot .mbig small, [data-day="0"] .mascot .mk::after { color: #c3cbff; }
[data-day="0"] .mprog { background: rgba(255, 255, 255, .18); }
[data-day="1"] .mascot { background: var(--plus) left 6px top 6px / 9px no-repeat, var(--plus) right 6px top 6px / 9px no-repeat,
    var(--plus) left 6px bottom 6px / 9px no-repeat, var(--plus) right 6px bottom 6px / 9px no-repeat,
    url("img/deco-dome.webp") center top / 100% auto no-repeat,
    radial-gradient(circle, rgba(255, 255, 255, .13) .8px, transparent 1.2px) 0 0 / 9px 9px, linear-gradient(160deg, #24262c, #121317 70%); }
.mascot img { width: 112px; height: 62px; }
.mascot.during img { width: 84px; height: 48px; }
.mascot .mbig { letter-spacing: -.02em; }
.mascot.during .mbig { font-size: 28px; }
.mprog { height: 6px; border-radius: 0; }
.mprog i { border-radius: 0; }
/* pestanyes de dia: el logo de cada dia, etiqueta en mono; dissabte en blau */
.gdays { gap: 8px; }
.gdays button { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 64px; padding: 8px 10px;
  border-radius: var(--r-card); border: 1px solid var(--hair); font: 500 10px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.gdays .dlogo { height: 26px; width: auto; margin: 0; opacity: .55; }
.gdays button[aria-selected="true"] { color: var(--ink); border-color: rgba(255, 255, 255, .7); background: rgba(255, 255, 255, .08); }
.gdays button[aria-selected="true"] .dlogo { opacity: 1; }
.gdays button[data-d="0"][aria-selected="true"] { border-color: #6f82ff; background: linear-gradient(160deg, #1d2fb4, #0b1460); }
/* graella: cantonades rectes, el concert d'ara encès com la reixa de llum */
.tlbox { border-width: 1px; border-color: var(--hair); border-radius: var(--r-card); }
.blk { border-radius: 2px; }
.blk.on { box-shadow: 0 0 0 1px rgba(255, 255, 255, .55), 0 0 16px rgba(255, 255, 255, .22); }
/* al final de cada pàgina, el terra de reixa de llum amb el feix (del cartell) */
.wrap::after { content: ""; display: block; height: 170px; margin: -8px calc(-1 * max(16px, env(safe-area-inset-right, 0px))) -40px; pointer-events: none;
  background: linear-gradient(to bottom, transparent, rgba(236, 240, 255, .85)) 71% 0 / 2px 54% no-repeat, url("img/deco-floor.webp") center bottom / cover no-repeat; }
/* Textos grans en Anybody Black (alternativa gratuïta a la Nickel Gothic del cartell): rellotge, títols, «Quedan» i l'artista que sona */
.row .dj { font-family: var(--title); font-stretch: 112%; letter-spacing: -.01em; }
.clock, .minibar .mclock { font-stretch: 112%; }
h2 { font-stretch: 115%; }
`;
// Mode clar (FEST.lightCss, només amb FEST.light): el mateix cartell en blanc. Creus i punts negres, logos blancs invertits a negre,
// el banner invertit (fons clar, logo negre), la cúpula i el terra en versió fosca (img/deco-*-light.webp). El dissabte segueix blau
FEST.lightCss = `
html[data-theme="light"] { --plus: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2711%27 height=%2711%27%3E%3Cpath d=%27M5.5 0v11M0 5.5h11%27 stroke=%27%230b0c0e%27 stroke-width=%271.3%27/%3E%3C/svg%3E");
  --plus-dim: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2711%27 height=%2711%27%3E%3Cpath d=%27M5.5 0v11M0 5.5h11%27 stroke=%27%230b0c0e%27 stroke-opacity=%27.5%27 stroke-width=%271.2%27/%3E%3C/svg%3E");
  --plus-w: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2711%27 height=%2711%27%3E%3Cpath d=%27M5.5 0v11M0 5.5h11%27 stroke=%27%23fff%27 stroke-width=%271.3%27/%3E%3C/svg%3E");
  --hair: rgba(11, 12, 14, .22); }
html[data-theme="light"] body { background-image: radial-gradient(circle, rgba(11, 12, 14, .16) .8px, transparent 1.2px); }
/* logos blancs (escenari, dies, final): en negre. El banner (vídeo negre): invertit, queda una targeta blanca amb el logo negre */
html[data-theme="light"] img[src*="hangar.png"], html[data-theme="light"] img[src*="logo-"] { filter: invert(1); }
html[data-theme="light"] .banner, html[data-theme="light"] .tvinfo > video, html[data-theme="light"] .tvinfo > img { filter: invert(1); box-shadow: 0 0 0 1px rgba(255, 255, 255, .22); }  /* (invertida: una vora fosca fina) */
html[data-theme="light"] .row.live { background: var(--plus-dim) left 5px top 5px / 8px no-repeat, var(--plus-dim) right 5px top 5px / 8px no-repeat,
    radial-gradient(90% 120% at 82% -20%, rgba(11, 12, 14, .06), transparent 62%), var(--panel);
  box-shadow: inset 0 0 0 1px rgba(11, 12, 14, .3), inset 3px 0 0 var(--sc, transparent); }
/* «Quedan»: dissabte blau com el cartell (amb text i logo blancs); diumenge, blanc de punts com el panell del 240 km/h */
html[data-theme="light"] .mascot { background: var(--plus) left 6px top 6px / 9px no-repeat, var(--plus) right 6px top 6px / 9px no-repeat,
    var(--plus) left 6px bottom 6px / 9px no-repeat, var(--plus) right 6px bottom 6px / 9px no-repeat,
    url("img/deco-dome-light.webp") center top / 100% auto no-repeat, var(--panel); }
html[data-theme="light"][data-day="0"] .mascot { --ink: #f5f5f5; --muted: #c3cbff; color: var(--ink); box-shadow: none;
  background: var(--plus-w) left 6px top 6px / 9px no-repeat, var(--plus-w) right 6px top 6px / 9px no-repeat,
    var(--plus-w) left 6px bottom 6px / 9px no-repeat, var(--plus-w) right 6px bottom 6px / 9px no-repeat,
    url("img/deco-dome.webp") center top / 100% auto no-repeat,
    radial-gradient(130% 110% at 100% 0%, #2a3fd6 0%, #1426a0 38%, #0a1258 72%, #070b30 100%); }
html[data-theme="light"][data-day="0"] .mascot img { filter: none; }
html[data-theme="light"][data-day="0"] .mprog { background: rgba(255, 255, 255, .22); }
html[data-theme="light"][data-day="0"] .mprog i { background: #fff; }
html[data-theme="light"][data-day="1"] .mascot { box-shadow: inset 0 0 0 1px rgba(11, 12, 14, .28);
  background: var(--plus) left 6px top 6px / 9px no-repeat, var(--plus) right 6px top 6px / 9px no-repeat,
    var(--plus) left 6px bottom 6px / 9px no-repeat, var(--plus) right 6px bottom 6px / 9px no-repeat,
    url("img/deco-dome-light.webp") center top / 100% auto no-repeat,
    radial-gradient(circle, rgba(11, 12, 14, .2) .8px, transparent 1.2px) 0 0 / 9px 9px, linear-gradient(160deg, #ffffff, #f0f0ee 70%); }
/* pestanyes de dia */
html[data-theme="light"] .gdays button[aria-selected="true"]:not([data-d="0"]) { border-color: rgba(11, 12, 14, .75); background: var(--panel); }
html[data-theme="light"] .gdays button[data-d="0"][aria-selected="true"] { color: #fff; }
html[data-theme="light"] .gdays button[data-d="0"][aria-selected="true"] .dlogo { filter: none; }
/* graella: el concert d'ara amb vora negra */
html[data-theme="light"] .blk.on { box-shadow: 0 0 0 1px rgba(11, 12, 14, .7), 0 0 14px rgba(11, 12, 14, .18); }
/* terra de reixa i feix: en fosc sobre clar */
html[data-theme="light"] .wrap::after { background: linear-gradient(to bottom, transparent, rgba(11, 12, 14, .7)) 71% 0 / 2px 54% no-repeat, url("img/deco-floor-light.webp") center bottom / cover no-repeat; }
`;
// Multicámara (opcional, pestanya «Cámaras»): on va cada càmera, amb què, i què cal de corrent i àudio.
// Per escenari: cams = { c: color, pos: posició, cam, opt: òptica, acc: [accessoris; «2x Brazo grande» = 2] }
//               rider = { z: zona, n: quantes, what: què (es suma a «Material»), where: on, c: [colors de les càmeres], ok: qui ho ha confirmat }
//               note = avís (p. ex. arnès i casc)
// Exemple: { c: 'morado', pos: 'Cabina', cam: 'Black Micro G2', opt: '6mm', acc: ['Slider', '2x Brazo grande'] }
//          { z: 'Cabina', n: 1, what: 'Regleta de 3', where: 'en cabina', c: ['morado'], ok: 'Uri' }
// Colors: morado, rojo, amarillo, naranja, verde, azul, negro. Amb diversos dies, l'estat (grabando, SSD…) va per dia.
// Compte: build_web.py busca el final de FEST amb la clau i el punt i coma, no els escriguis junts aquí.
// plan (opcional) = imatge de l'escenari (img/…, p. ex. la il·lustració isomètrica) i a cada càmera at: [x %, y %] = on va a la imatge.
// carpa-3d.webp: il·lustració feta amb Nano Banana 2.1 (Higgsfield) a partir de la vista isomètrica del stage plot (04-11).
// days (opcional) = només aquests dies (1 = dissabte, 2 = diumenge). Sense days, tots els dies.
// Dissabte (Universo Makina, 05-11, en Pau): triple cabina al mig de la pista (la plataforma de x = 0) → cenital, 2 generals i 1 general tancada.
//   Posicions i càmeres PROVISIONALS: l'equip les mou i les completa des de l'app («Editar cámaras»).
// Diumenge: les 4 del primer Duro (PROVISIONALS, en Pau encara no sap les d'aquest).
FEST.multicam = [
  { stage: 'Black Hangar', plan: 'img/carpa-3d.webp',
    cams: [
      { uid: 'makina-cenital', days: [1], c: 'azul', pos: 'Cenital cabina', cam: 'Black Micro G2', opt: '6mm', acc: ['Brazo grande'], at3d: [0, 0, 8], aim: [0, -90] },
      { uid: 'makina-general-1', days: [1], c: 'naranja', pos: 'General 1', cam: '', opt: '', at3d: [-3.5, -2.5, 3], aim: [35, -18] },
      { uid: 'makina-general-2', days: [1], c: 'verde', pos: 'General 2', cam: '', opt: '', at3d: [3.5, 2.5, 3], aim: [-145, -18] },
      { uid: 'makina-general-cerrada', days: [1], c: 'rojo', pos: 'General cerrada', cam: '', opt: '', at3d: [7, 0, 2.6], aim: [180, -8] },
      { uid: 'black-hangar-cabina', days: [2], c: 'verde', pos: 'Cabina', cam: 'Black Micro G2', opt: '6mm', acc: ['Trípode'], at: [79, 38], at3d: [-18.6, 0, 2.6] },
      { uid: 'black-hangar-cabina-cenital', days: [2], c: 'azul', pos: 'Cabina cenital', cam: 'Black Micro G2', opt: '6mm', acc: ['Brazo grande'], at: [80.7, 19.4], at3d: [-24, 0, 10.6] },
      { uid: 'black-hangar-foh-abierta', days: [2], c: 'naranja', pos: 'FOH abierta', cam: 'DJI Action 6', opt: '', acc: ['Brazo mediano'], at: [19.3, 75], at3d: [27.4, -2.8, 2.4] },
      { uid: 'black-hangar-foh-cerrada', days: [2], c: 'rojo', pos: 'FOH cerrada', cam: 'Black Studio', opt: '50mm', acc: ['Brazo grande'], at: [25.9, 79.3], at3d: [29.6, 2.8, 2.4] },
    ],
    // uid = identificador fix (no el canviïs: hi van lligats l'estat i la posició). lim = minuts a mà (si no, surt de MC_MODELS segons el model; gb = mida de targeta/SSD en GB).
    // 3D (three.js, es gira amb el dit). Metres: x al llarg (escenari a -x, FOH a +x), y d'un costat a l'altre, z amunt.
    // Mides del stage plot (vistes de dalt i frontal): carpa 64×32 m, 13 m d'alt (perfil de cúpula a mc3dBuild, o tent.prof). Cada càmera: at3d: [x, y, z]
    scene3d: {
      tent: { len: 64, wid: 32, h: 13 },
      stage: { x0: -26, x1: -16, wid: 22, h: 1.6 },
      screen: { x: -24.5, wid: 15.3, z0: 2.7, h: 5.7 },
      booth: { x: -18.6, l: 3.4, w: 1.3, h: 1.1 },
      barrier: { x: -13.8, wid: 28.8 },
      triangles: [[-16, 'ambar'], [-8, 'ambar'], [0, 'blanco'], [8, 'ambar'], [16, 'ambar']],
      platform: { x: 0, s: 3.5, h: 0.7 },
      foh: { x0: 27.5, x1: 31.5, wid: 7.4 },
    },
    rider: [] },
];
/* ==== /FESTIVAL ==== */
