/* ==== FESTIVAL ==== */
// Tot el que canvia d'un festival a un altre és dins d'aquest bloc. Cada festival en té una còpia a
// festivals/<id>/festival.js, i `python3 festival.py <id>` la posa aquí i copia els seus logos a img/.
const FEST = {
  id: 'bass-in-the-park-2026',  // també separa els canvis de l'organització (changes.json) d'un festival a un altre
  key: 'bitp',                  // prefix de les dades guardades al mòbil (preferits, avisos…): un de diferent per festival
  name: 'Bass in the Park',
  banner: 'Bass in the Park · 24.10.2026 · de 12 h a 5:00 h · Montmeló, Espai Can Guitet',  // text alternatiu de img/banner.jpg
  date: [2026, 10, 24],         // dia que comença (any, mes, dia). Les hores més d'hora que «start» són de l'endemà
  dayLabel: 'el sábado 24.10',  // «Empieza el sábado 24.10 a las 12:00»
  start: '12:00', end: '05:00',
  accent: '#3dff2b', accentRgb: '61, 255, 43', accentDim: '#1d6b15', accentDeep: '#0f2a0c', accentInk: '#041204',
  // Columna extra que no és un escenari (null si no n'hi ha)
  rides: { name: 'Atracciones', from: '12:00', to: '01:00' },
  // Escenaris: el logo és img/<id>.png
  stages: [
    { id: 'ner', name: 'No Es Ruido' },
    { id: 'tox', name: 'Toxik Parties' },
    { id: 'pont', name: 'Pont Aeri' },
    { id: 'misa', name: 'Misa Psicodélika' },
    { id: 'ss', name: 'Migats Sound System' },
  ],
  // Horari del cartell: [inici, final, nom, importància 5 (vermell) … 1 (blau), 0 = sense color, subtítol]
  // Les nits que es canvia l'hora: "02:00a" = la 1a vegada que són les 2, "02:00b" = la 2a.
  sets: {
    ner: [
      ['12:00', '13:00', 'Girls on Decks', 1],
      ['13:00', '14:00', 'Arcex', 1],
      ['14:00', '15:00', 'Selecta', 2],
      ['15:00', '16:00', 'Skudero & Xavi Metralla', 3],
      ['16:00', '17:00', 'The Saints', 3],
      ['17:00', '18:00', 'Yoshiko', 4],
      ['18:00', '19:00', 'Xavistyle', 4],
      ['19:00', '19:20', 'Cache Oficial', 3],
      ['19:20', '20:00', 'Jarfaiter', 3],
      ['20:00', '21:00', 'Carlos Perez B2B K-Style', 3],
      ['21:00', '22:00', 'Amygdala', 3],
      ['22:00', '23:00', 'Carnada B2B Quince', 4],
      ['23:00', '00:00', 'Gea', 3],
      ['00:00', '01:00', 'DJ Pastis B2B DJ Sisu', 5],
      ['01:00', '02:00a', 'Toni Massama', 3],
      ['02:00a', '02:00b', 'Kitus & Frosty', 3],
      ['02:00b', '03:00', 'The Whistlers', 3],
      ['03:00', '04:00', 'Tha Playah', 3],
      ['04:00', '05:00', 'Papero B2B More', 3],
    ],
    tox: [
      ['12:00', '14:00', '4BD3', 1],
      ['14:00', '15:30', 'Seve', 1],
      ['15:30', '17:00', 'Pau Miau', 1],
      ['17:00', '18:30', 'Kodi VS Black Mamba', 1],
      ['18:30', '20:00', 'Rozz Rigo', 1],
      ['20:00', '21:00', 'Kou2tatane', 1],
      ['21:00', '22:00', 'Miss Pixie', 1],
      ['22:00', '23:00', 'Ling Ling', 3],
      ['23:00', '00:00', 'Stiwie', 2],
      ['00:00', '01:00', 'Apre VS Choko', 2],
      ['01:00', '02:00a', 'Diprosopiks', 2, 'Neurotribe vs Koko'],
      ['02:00a', '02:00b', 'Teka', 2],
      ['02:00b', '03:00', 'Farfacid', 3],
      ['03:00', '05:00', 'Radze VS Brain Impact VS Jan Vercauteren', 3],
    ],
    misa: [
      ['12:00', '13:30', 'Afroditta B2B Kosmonow', 2],
      ['13:30', '15:00', 'Chaac B2B Lightwormie', 2],
      ['15:00', '16:30', 'Jandri', 2],
      ['16:30', '18:00', 'Mr Frisson', 2],
      ['18:00', '19:30', 'Hypatia', 2],
      ['19:30', '21:00', 'Zeridium', 2],
      ['21:00', '22:30', 'Guapa Lee', 2],
      ['22:30', '00:00', 'Hëdera', 2],
    ],
    pont: [
      ['12:00', '13:00', 'Merlin', 1],
      ['13:00', '14:00', 'Kcho', 1],
      ['14:00', '15:00', 'Soriano VS Fløres', 1],
      ['15:00', '16:00', 'Merti B2B Altrax', 1],
      ['16:00', '17:00', 'Skudero B2B Dvrk Oktopus', 3],
      ['17:00', '18:00', 'Xavi Metralla B2B DJ Sisu', 5],
      ['18:00', '19:00', 'DJ Sonic', 2],
      ['19:00', '20:00', 'D-Vstor', 2],
      ['20:00', '21:00', 'Wakan', 3],
      ['21:00', '22:00', 'Kitus & Frosty', 3],
      ['22:00', '23:00', 'Lia Jensen', 3],
      ['23:00', '00:00', 'Marti VS Celi', 1],
      ['00:00', '01:00', 'More', 3],
    ],
    ss: [
      ['12:00', '14:00', 'Migats Sound System', 2],
      ['14:00', '15:00', 'Redland Sound System', 0],
      ['15:00', '16:00', 'Migats Sound System', 0],
      ['16:00', '17:00', 'Lion on Top Sound System', 0],
      ['17:00', '18:00', 'Redland Sound System', 0],
      ['18:00', '20:00', 'Migats Sound System', 0],
      ['20:00', '21:00', 'Redland Sound System', 0],
      ['21:00', '22:00', 'Migats Sound System', 0],
      ['22:00', '23:00', 'Peivol', 0],
      ['23:00', '00:00', 'Al·le', 0],
    ],
  },
};
/* ==== /FESTIVAL ==== */
