#!/bin/zsh
# Instal·la (o actualitza) el servidor de notificacions a Cloudflare Workers amb l'API, sense Node ni wrangler.
# Fa servir el token de ~/.config/midnight-webapp/cloudflare-token (no es mostra mai) i les claus de claus.sh.
# Al final escriu ~/.config/midnight-webapp/push.json amb l'adreça del servidor i la clau pública (les fa servir build_web.py).
set -e
cd "${0:A:h}"
CONF=~/.config/midnight-webapp
NAME=midnight-push
[[ -s $CONF/cloudflare-token ]] || { echo "Falta el token de Cloudflare a $CONF/cloudflare-token"; exit 1; }
[[ -s $CONF/vapid.json ]] || ./claus.sh
PRIV=$(mktemp -d); trap 'rm -rf "$PRIV"' EXIT
print -r -- "Authorization: Bearer $(<$CONF/cloudflare-token)" > $PRIV/auth
API=https://api.cloudflare.com/client/v4
cf() { curl -sS -H @$PRIV/auth "$@"; }
ok() { python3 -I -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("success") else (print("Error de Cloudflare:", [e.get("message") for e in d.get("errors", [])]) or 1))'; }
val() { python3 -I -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# Compte
ACCT=$(cf $API/accounts | val 'd["result"][0]["id"] if d.get("result") else ""')
[[ -n $ACCT ]] || { echo "El token no veu cap compte. Revisa els permisos del token."; exit 1; }
echo "ok compte"

# Espai de dades (KV)
KV=$(cf "$API/accounts/$ACCT/storage/kv/namespaces?per_page=100" | val 'next((n["id"] for n in d["result"] if n["title"]=="midnight-push-subs"), "")')
if [[ -z $KV ]]; then
  KV=$(cf -X POST -H 'content-type: application/json' --data '{"title":"midnight-push-subs"}' $API/accounts/$ACCT/storage/kv/namespaces | val 'd["result"]["id"]')
  echo "ok dades creades"
fi

# Codi + enllaços (la clau privada va com a secret; mai surt per pantalla)
python3 -I - $CONF/vapid.json $KV $PRIV/meta.json <<'EOF'
import sys, json
v = json.load(open(sys.argv[1]))
meta = {"main_module": "worker.js", "compatibility_date": "2024-09-23", "bindings": [
  {"type": "kv_namespace", "name": "SUBS", "namespace_id": sys.argv[2]},
  {"type": "secret_text", "name": "VAPID_JWK", "text": json.dumps(v["jwk"])},
  {"type": "plain_text", "name": "VAPID_PUBLIC", "text": v["public"]}]}
open(sys.argv[3], "w").write(json.dumps(meta))
EOF
cf -X PUT "$API/accounts/$ACCT/workers/scripts/$NAME" \
  -F "metadata=@$PRIV/meta.json;type=application/json" \
  -F "worker.js=@worker.js;type=application/javascript+module" | ok
echo "ok servidor"

# Cada minut
cf -X PUT -H 'content-type: application/json' --data '[{"cron":"* * * * *"}]' "$API/accounts/$ACCT/workers/scripts/$NAME/schedules" | ok
echo "ok cada minut"

# Adreça pública (*.workers.dev)
cf -X POST -H 'content-type: application/json' --data '{"enabled":true}' "$API/accounts/$ACCT/workers/scripts/$NAME/subdomain" >/dev/null || true
SUB=$(cf $API/accounts/$ACCT/workers/subdomain | val 'd["result"]["subdomain"] if d.get("result") else ""')
[[ -n $SUB ]] || { echo "Falta triar el subdomini de workers.dev: entra un cop a Workers & Pages al tauler de Cloudflare i torna a executar"; exit 1; }
URL="https://$NAME.$SUB.workers.dev"
python3 -I -c 'import json,sys; v=json.load(open(sys.argv[1])); json.dump({"url": sys.argv[2], "public": v["public"]}, open(sys.argv[3], "w"))' $CONF/vapid.json $URL $CONF/push.json
chmod 600 $CONF/push.json
echo "ok adreça: $URL"
for i in {1..12}; do
  if curl -sS "$URL/" 2>/dev/null | grep -q midnight-push; then echo "ok el servidor respon"; exit 0; fi
  sleep 5
done
echo "Instal·lat, però encara no respon (pot trigar un minut)."
