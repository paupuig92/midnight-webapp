/* ==== FESTIVAL ==== */
// Tot el que canvia d'un festival a un altre és dins d'aquest bloc. Cada festival en té una còpia a
// festivals/<id>/festival.js, i `python3 festival.py <id>` la posa aquí i copia els seus logos a img/.
// ESBORRANY (03-11): branding del cartell de Black Hangar. Falten hores, escenaris i mapa (els ha de passar en Pau).
const FEST = {
  id: 'duro-black-hangar-2026', // també separa els canvis de l'organització (changes.json) d'un festival a un altre
  key: 'duro',                  // prefix de les dades guardades al mòbil (preferits, avisos…): un de diferent per festival
  name: 'Black Hangar',
  banner: 'Black Hangar x Duro · 5 + 6 dic · Can Guitet, Montmeló',  // text alternatiu de img/banner.jpg
  date: [2026, 12, 5],          // PENDENT: són dos dies (dissabte 5 i diumenge 6), l'app ara en fa un
  dayLabel: 'el sábado 05.12',  // «Empieza el sábado 05.12 a las 11:00»
  start: '11:00', end: '23:00',
  // Blanc i negre com el cartell: l'accent és blanc (el vermell d'«ara» i el groc dels meus artistes es queden)
  accent: '#f2f2f2', accentRgb: '242, 242, 242', accentDim: '#7a7c80', accentDeep: '#16171a', accentInk: '#050608',
  theme: { '--bg': '#050608', '--panel': '#0f1013', '--ink': '#f5f5f5', '--muted': '#9a9ca2', '--rule': '#2a2c31', '--line': '#3d4046',
    '--display': '"Archivo", "Helvetica Neue", sans-serif', '--body': '"Archivo", "Helvetica Neue", sans-serif',
    '--title': '"Archivo Black", "Archivo", sans-serif', '--cond': '"Archivo Narrow", "Archivo", sans-serif' },
  // Tipografies: el cartell fa servir una grotesca negra + una mono. No són a la carpeta: de moment, Archivo
  nextHide: { stages: [], imp: [1] },
  impColors: true,
  impSize: true,
  stageColors: false,
  // Logos (opcional), pel nom exacte del cartell. Els dels dos dies del cartell:
  logos: {
    'Universo Makina': 'img/logo-makina.png',
    '240 km/h': 'img/logo-240.png',
  },
  rides: [],
  // PENDENT: escenaris reals. De moment un de sol amb el logo de Black Hangar (img/hangar.png)
  stages: [
    { id: 'hangar', name: 'Black Hangar' },
  ],
  // PENDENT: hores. Cartell per dies (cartel x dias): dissabte 5 = Universo Makina, diumenge 6 = 240 km/h, «y más artistas»
  //   Sábado 5: Pastis and Buenri and Sisu [6 hours set] · Héctor Oaks aka DJ Kaos11 [Bakala set] · Cristian Varela [late 90's – early 00's set] · Carlos Perez & K-Style [Esencia del Norte 00's]
  //   Domingo 6: Adrián Mills · Kuko · Clara Cuvé · Cloudy · Nikolina · Aerea [live]
  //   Sense dia al cartell: Carnada · Anna Jevills · Inés Isla · H1pnos1s · Quince · Giø · Human Error · Føbia · Nhymph
  sets: {
    hangar: [],
  },
};
/* ==== /FESTIVAL ==== */
