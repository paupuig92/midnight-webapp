/* ==== FESTIVAL ==== */
// Tot el que canvia d'un festival a un altre és dins d'aquest bloc. Cada festival en té una còpia a
// festivals/<id>/festival.js, i `python3 festival.py <id>` la posa aquí i copia els seus logos a img/.
// ESBORRANY (03-11): branding del cartell i horari d'en Pau. Falten importàncies, mapa i confirmar dies.
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
  stageColors: true,
  colorLogos: true,             // logos d'escenari amb el nom a sota, sense invertir
  rides: [],
  // Escenaris (horari d'en Pau, 03-11): el logo és img/<id>.png
  stages: [
    { id: 'makina', name: 'Universo Makina' },
    { id: 'km240', name: '240 km/h' },
  ],
  // Horari: [inici, final, nom, importància 5 (vermell) … 1 (blau), 0 = sense color, subtítol]
  // El final és l'inici del següent; l'últim, les 23:00. PENDENT: importàncies (de moment 0) i si és un dia o dos
  sets: {
    makina: [
      ['11:00', '12:30', 'Nhymph', 0],
      ['12:30', '13:30', 'Anna Jevills', 0],
      ['13:30', '14:30', 'Cristian Varela', 0, 'Late 90’s – early 00’s set'],
      ['14:30', '15:30', 'Carlos Perez & K-Style', 0, 'Esencia del Norte 00’s'],
      ['15:30', '17:00', 'Héctor Oaks aka DJ Kaos11', 0, 'Bakala set'],
      ['17:00', '23:00', 'Pastis & Buenri & Sisu', 0, '6 hours set'],
    ],
    km240: [
      ['11:00', '12:00', 'Føbia', 0],
      ['12:00', '13:00', 'Anna Jevills', 0],
      ['13:00', '14:00', 'Inés Isla', 0],
      ['14:00', '15:00', 'H1pnos1s b2b Quince', 0],
      ['15:00', '16:00', 'Giø', 0],
      ['16:00', '17:00', 'Human Error', 0],
      ['17:00', '18:00', 'Carnada', 0],
      ['18:00', '19:00', 'Adrián Mills', 0],
      ['19:00', '20:00', 'Cloudy', 0],
      ['20:00', '21:00', 'Aerea', 0, 'Live'],
      ['21:00', '22:00', 'Clara Cuvé', 0],
      ['22:00', '23:00', 'Kuko b2b Nikolina', 0],
    ],
  },
};
/* ==== /FESTIVAL ==== */
