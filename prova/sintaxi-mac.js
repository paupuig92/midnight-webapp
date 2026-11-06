// El fa servir prova/sintaxi.py al Mac quan no hi ha node: llegeix cada fitxer amb el motor de Safari (JavaScriptCore).
// Només el llegeix (new Function no executa res). Escriu «MAL <número> <error>» per cada fitxer amb un error d'escriptura.
ObjC.import('Foundation');
function run(argv) {
  const out = [];
  argv.forEach((f, i) => {
    const s = $.NSString.stringWithContentsOfFileEncodingError(f, $.NSUTF8StringEncoding, null);
    try { new Function(ObjC.unwrap(s)); } catch (e) { out.push('MAL ' + i + ' ' + e.name + ': ' + e.message); }
  });
  return out.join('\n');
}
