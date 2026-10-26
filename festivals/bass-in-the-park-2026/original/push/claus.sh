#!/bin/zsh
# Genera les claus VAPID del servidor de notificacions (una sola vegada) a ~/.config/midnight-webapp/vapid.json.
# La privada no es mostra mai; la pública va a l'app (no és secreta).
set -e
CONF=~/.config/midnight-webapp
OUT=$CONF/vapid.json
if [[ -s $OUT ]]; then echo "Ja hi ha claus a $OUT (no es tornen a fer)"; exit 0; fi
mkdir -p $CONF
PRIV=$(mktemp -d); trap 'rm -rf "$PRIV"' EXIT
openssl ecparam -name prime256v1 -genkey -noout -out $PRIV/k.pem 2>/dev/null
openssl ec -in $PRIV/k.pem -outform DER -out $PRIV/k.der 2>/dev/null
python3 -I - $PRIV/k.der $OUT <<'EOF'
import sys, json, base64
der = open(sys.argv[1], 'rb').read()
# ECPrivateKey (SEC1): la clau privada (32 bytes) va després de 04 20; la pública (65 bytes, 04‖x‖y) al final
i = der.index(b'\x04\x20') + 2
d = der[i:i + 32]
pub = der[-65:]
assert pub[0] == 4 and len(d) == 32
b = lambda x: base64.urlsafe_b64encode(x).rstrip(b'=').decode()
jwk = {"kty": "EC", "crv": "P-256", "d": b(d), "x": b(pub[1:33]), "y": b(pub[33:]), "ext": True}
open(sys.argv[2], 'w').write(json.dumps({"jwk": jwk, "public": b(pub)}))
EOF
chmod 600 $OUT
echo "Claus fetes: $OUT"
