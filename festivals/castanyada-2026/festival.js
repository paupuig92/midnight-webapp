/* ==== FESTIVAL ==== */
// Tot el que canvia d'un festival a un altre és dins d'aquest bloc. Cada festival en té una còpia a
// festivals/<id>/festival.js, i `python3 festival.py <id>` la posa aquí i copia els seus logos a img/.
const FEST = {
  id: 'castanyada-2026',        // també separa els canvis de l'organització (changes.json) d'un festival a un altre
  key: 'cast',                  // prefix de les dades guardades al mòbil (preferits, avisos…): un de diferent per festival
  name: 'La Castanyada',
  banner: 'La Castanyada del Cabró Rock · 31 oct · Montmeló',  // text alternatiu de img/banner.jpg
  date: [2026, 10, 31],         // dia que comença (any, mes, dia). Les hores més d'hora que «start» són de l'endemà
  dayLabel: 'el sábado 31.10',  // «Empieza el sábado 31.10 a las 12:00»
  start: '12:00', end: '05:00',
  accent: '#ff7a1a', accentRgb: '255, 122, 26', accentDim: '#8f430f', accentDeep: '#2e1606', accentInk: '#1a0b02',
  // Colors de base propis (opcional): els del Bass eren verdosos
  theme: { '--bg': '#0a0604', '--panel': '#160e09', '--ink': '#fdf4e3', '--muted': '#c9b29a', '--rule': '#6b3d1c', '--line': '#8a5428',
    '--display': '"Bricolage", "Archivo", sans-serif', '--title': '"Blogh", "Bricolage", sans-serif', '--cond': '"Bricolage Cond", "Bricolage", sans-serif' },
  // Tipografies de la marca (opcional): els fitxers van a img/ amb els logos. Es fan servir a theme (--display, --title, --cond)
  fonts: [
    { family: 'Blogh', file: 'Blogh.otf', weight: '100 900' },  // només té un pes: així no se'n fa una negreta falsa
    { family: 'Bricolage', file: 'Bricolage-Bold.ttf', weight: 700 },
    { family: 'Bricolage', file: 'Bricolage-ExtraBold.ttf', weight: '800 900' },
    { family: 'Bricolage Cond', file: 'Bricolage-SemiCondensed-SemiBold.ttf', weight: '600 900' },
  ],
  // Il·lustracions del kit de marca (opcional, cada clau també): PNG transparents a 2x a img/. Sense deco, l'app queda neta
  deco: {
    // strip: 'img/deco-strip.png',   // garlanda sota la capçalera (en Pau la va treure el 26-10)
    before: 'img/deco-before.png',    // abans de començar
    end: 'img/deco-end.png',          // quan s'ha acabat
    empty: 'img/deco-empty.png',      // «Solo mis artistas» sense cap artista triat
    done: 'img/deco-done.png',        // «Solo mis artistas» quan ja no en queda cap per cobrir
    sheet: 'img/deco-sheet.png',      // full «Mis artistas»
    heads: { ahora: 'img/deco-h-ahora.png', siguiente: 'img/deco-h-siguiente.png', horario: 'img/deco-h-horario.png' },  // icona davant del títol de secció
  },
  // Atraccions: cadascuna amb el seu horari i la seva columna a la graella ([] si no n'hi ha)
  impColors: true,              // la importància (0–5) es veu amb un quadrat de color i número…
  impSize: true,                // …i també per la mida: 5 = concert destacat, 1 = entre concerts
  stageColors: true,            // cada escenari amb el seu color (el quadrat de la importància és una altra forma: no es confonen)
  ridesName: 'Atracciones',
  // img (opcional): il·lustració de l'atracció; si no n'hi ha, surt la sínia
  rides: [
    { name: 'Burro mecànic', from: '12:00', to: '00:00', img: 'img/ride-burro.png' },
    { name: 'Calçot mecànic', from: '12:00', to: '00:00', img: 'img/ride-calcot.png' },
    { name: 'Túnel del Terror', from: '18:30', to: '00:30', img: 'img/ride-tunel.png' },
  ],
  // Logos d'escenari en color (personatges): es veuen amb el nom a sota i sense invertir
  colorLogos: true,
  // Escenaris: el logo és img/<id>.png
  stages: [
    { id: 'principal', name: 'Escenari Principal' },
    { id: 'festa', name: 'Escenari Festa Major' },
    { id: 'photo', name: 'Photocall' },
  ],
  // Horari del cartell: [inici, final, nom, importància 5 (vermell) … 1 (blau), 0 = sense color, subtítol, efectes (FOC, CO2, SPARK, PIRO, CONFETI o un altre)]
  // Les nits que es canvia l'hora: "02:00a" = la 1a vegada que són les 2, "02:00b" = la 2a.
  sets: {
    principal: [
      ['12:30', '13:10', 'Juls', 5],
      ['13:30', '14:10', 'Ven’nus', 5],
      ['14:30', '15:30', '31 FAM', 5],
      ['16:00', '17:15', 'Els Amics de les Arts', 5],
      ['17:45', '19:00', 'Els Pets', 5],
      ['19:30', '20:40', 'La Ludwig Band', 5],
      ['21:10', '22:30', 'Lax’n’Busto', 5, '', ['FOC', 'CONFETI']],
      ['22:30', '23:00', 'DJ K-Zu', 1],
      ['23:00', '00:15', 'Els Catarres', 5],
      ['00:15', '00:45', 'DJ K-Zu', 1],
      ['00:45', '01:55', 'The Tyets', 5],
      ['01:55', '02:25', 'Anna Gisbert', 1],
      ['02:25', '03:35', 'Figa Flawas', 5],
      ['03:35', '04:00', 'Anna Gisbert', 1],
      ['04:00', '05:00', 'Doctor Prats', 5],
    ],
    festa: [
      ['14:10', '14:30', 'Sardanes', 0, 'Cobla Contemporània · Colla Sardanista Riallera'],
      ['15:30', '16:00', 'Sardanes', 0, 'Cobla Contemporània · Colla Sardanista Riallera'],
      ['17:15', '17:45', 'Lo Pau de Ponts', 0],
      ['19:00', '19:30', 'Lo Pau de Ponts', 0, 'Havaneres i cremat popular'],
      ['20:40', '21:10', 'Gran Aplec de la Cultura Catalana', 0, 'Castellers · Bastoners · Gitanes · Gegants'],
    ],
    photo: [
      ['17:40', '18:00', 'Cabronàs', 0],
      ['18:00', '18:20', 'Nena Posseïda', 0],
      ['18:20', '18:40', 'Cabronàs i entitats', 0],
      ['18:40', '19:00', 'Nena Posseïda', 0],
      ['19:00', '19:20', 'Cabronàs i entitats', 0],
      ['19:20', '19:40', 'Nena Posseïda', 0],
      ['19:40', '20:00', 'Cabronàs i entitats', 0],
      ['20:00', '20:20', 'Nena Posseïda', 0],
      ['20:40', '21:00', 'Nena Posseïda', 0],
    ],
  },
};
/* ==== /FESTIVAL ==== */
