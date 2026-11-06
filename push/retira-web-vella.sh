#!/bin/zsh
# Retira la còpia vella de la web (worker «midnight-app» de Cloudflare, encara amb el Bass in the Park).
# Hi posa un worker petit que:
#   - a sw.js respon amb un service worker que s'esborra sol i buida la memòria del mòbil
#     (si no, els iPhone que hi tenien l'app seguirien veient el Bass sense connexió);
#   - a la resta, redirigeix a https://visualcrew.midnightgroup.app (mateix camí).
# Fa servir el token de ~/.config/midnight-webapp/cloudflare-token (no es mostra mai).
# Només cal executar-lo un cop. Per desfer-ho: tornar a pujar la web vella (no cal: és a l'historial de git).
set -e
CONF=~/.config/midnight-webapp
NAME=midnight-app
[[ -s $CONF/cloudflare-token ]] || { echo "Falta el token de Cloudflare a $CONF/cloudflare-token"; exit 1; }
PRIV=$(mktemp -d); trap 'rm -rf "$PRIV"' EXIT
print -r -- "Authorization: Bearer $(<$CONF/cloudflare-token)" > $PRIV/auth
API=https://api.cloudflare.com/client/v4
cf() { curl -sS -H @$PRIV/auth "$@"; }
ok() { python3 -I -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("success") else (print("Error de Cloudflare:", [e.get("message") for e in d.get("errors", [])]) or 1))'; }
ACCT=$(cf $API/accounts | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d["result"][0]["id"] if d.get("result") else "")')
[[ -n $ACCT ]] || { echo "El token no veu cap compte."; exit 1; }

cat > $PRIV/worker.js <<'JS'
const HOME = 'https://visualcrew.midnightgroup.app';
const SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate('${HOME}/');
})()));`;
export default {
  fetch(req) {
    const u = new URL(req.url);
    if (u.pathname.endsWith('/sw.js'))
      return new Response(SW, { headers: { 'content-type': 'application/javascript', 'cache-control': 'no-store' } });
    return Response.redirect(HOME + u.pathname + u.search, 301);
  }
};
JS
print -r -- '{"main_module":"worker.js","compatibility_date":"2024-09-23"}' > $PRIV/meta.json
cf -X PUT "$API/accounts/$ACCT/workers/scripts/$NAME" -F "metadata=@$PRIV/meta.json;type=application/json" \
  -F "worker.js=@$PRIV/worker.js;type=application/javascript+module" | ok
echo "ok: midnight-app ara redirigeix a visualcrew.midnightgroup.app"
