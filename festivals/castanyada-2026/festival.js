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
  theme: { '--bg': '#0a0604', '--panel': '#160e09', '--ink': '#fdf4e3', '--muted': '#c9b29a', '--rule': '#6b3d1c', '--line': '#8a5428' },
  // Columna extra que no és un escenari (null si no n'hi ha)
  rides: { name: 'Atracciones', from: '12:00', to: '00:00' },
  // Escenaris: el logo és img/<id>.png
  stages: [
    { id: 'principal', name: 'Escenari Principal' },
    { id: 'festa', name: 'Escenari Festa Major' },
    { id: 'photo', name: 'Photocall' },
  ],
  // Horari del cartell: [inici, final, nom, importància 5 (vermell) … 1 (blau), 0 = sense color, subtítol]
  // Les nits que es canvia l'hora: "02:00a" = la 1a vegada que són les 2, "02:00b" = la 2a.
  sets: {
    principal: [
      ['12:30', '13:10', 'Juls', 0],
      ['13:30', '14:10', 'Ven’nus', 0],
      ['14:30', '15:30', '31 FAM', 0],
      ['16:00', '17:15', 'Els Amics de les Arts', 0],
      ['17:45', '19:00', 'Els Pets', 0],
      ['19:30', '20:40', 'La Ludwig Band', 0],
      ['21:10', '22:30', 'Lax’n’Busto', 0],
      ['22:30', '23:00', 'DJ K-Zu', 0],
      ['23:00', '00:15', 'Els Catarres', 0],
      ['00:15', '00:45', 'DJ K-Zu', 0],
      ['00:45', '01:55', 'The Tyets', 0],
      ['01:55', '02:25', 'Anna Gisbert', 0],
      ['02:25', '03:35', 'Figa Flawas', 0],
      ['03:35', '04:00', 'Anna Gisbert', 0],
      ['04:00', '05:00', 'Doctor Prats', 0],
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
