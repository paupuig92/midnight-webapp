/* ==== FESTIVAL ==== */
// Tot el que canvia d'un festival a un altre és dins d'aquest bloc. Cada festival en té una còpia a
// festivals/<id>/festival.js, i `python3 festival.py <id>` la posa aquí i copia els seus logos a img/.
// ESBORRANY (03-11): branding del cartell i horari d'en Pau (2 dies, 1 escenari). Falten importàncies i mapa.
const FEST = {
  id: 'duro-black-hangar-2026', // també separa els canvis de l'organització (changes.json) d'un festival a un altre
  key: 'duro',                  // prefix de les dades guardades al mòbil (preferits, avisos…): un de diferent per festival
  name: 'Black Hangar',
  banner: 'Black Hangar x Duro · 5 + 6 dic · Can Guitet, Montmeló',  // text alternatiu de img/banner.jpg
  date: [2026, 12, 5],          // primer dia
  // Diversos dies (opcional): un nom per dia, seguits a partir de «date». Cada dia de «start» a «end». A l'horari, «2/11:00» = 2n dia
  days: ['Sábado 5', 'Domingo 6'],
  start: '11:00', end: '23:00',
  // Blanc i negre com el cartell: l'accent és blanc (el vermell d'«ara» i el groc dels meus artistes es queden)
  accent: '#f2f2f2', accentRgb: '242, 242, 242', accentDim: '#7a7c80', accentDeep: '#16171a', accentInk: '#050608',
  theme: { '--bg': '#050608', '--panel': '#0f1013', '--ink': '#f5f5f5', '--muted': '#9a9ca2', '--rule': '#2a2c31', '--line': '#3d4046',
    '--display': '"Nimbus", "Helvetica Neue", sans-serif', '--body': '"Nimbus", "Helvetica Neue", sans-serif',
    '--title': '"Nimbus", "Helvetica Neue", sans-serif', '--cond': '"Nimbus Cond", "Nimbus", sans-serif' },
  // Tipografia de la marca: Nimbus Sans L (branding de Duro 5 i el full «duro-festival-tipografies»)
  fonts: [
    { family: 'Nimbus', file: 'NimbusSanL-Regu.woff2', weight: '300 500' },
    { family: 'Nimbus', file: 'NimbusSanL-Bold.woff2', weight: '600 900' },
    { family: 'Nimbus Cond', file: 'NimbusSanL-BoldCond.woff2', weight: '400 900' },
  ],
  nextHide: { stages: [], imp: [1] },
  impColors: true,
  impSize: true,
  rides: [],
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
/* ==== /FESTIVAL ==== */
