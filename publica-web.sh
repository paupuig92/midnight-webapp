#!/bin/zsh
# Publica la web app a GitHub Pages (paupuig92/midnight-webapp), com fa la Midnight Suite:
# fa servir el token de ~/.config/midnight-webapp/github-token (o, si no hi és, el de la Suite)
# sense mostrar-lo mai.
#   1. regenera docs/ i fa commit si hi ha canvis
#   2. crea el repositori si encara no existeix
#   3. puja la branca main
#   4. activa GitHub Pages (main, /docs) si no ho està (només mentre el repositori és públic)
# (18-11-2026) Amb la web a Cloudflare Pages, el pas 3 ja la publica: Cloudflare veu el push i desplega docs/ en ~1 min.
# Quan el repositori sigui privat, el pas 4 se salta sol (GitHub gratuït no té Pages per a repositoris privats).
set -e
cd "${0:A:h}"
REPO=paupuig92/midnight-webapp
TOKEN_FILE=~/.config/midnight-webapp/github-token
[[ -r $TOKEN_FILE ]] || TOKEN_FILE=~/.config/midnight-suite/github-token

python3 -I build_web.py
# Abans de publicar (06-11-2026): si el JavaScript té un error d'escriptura, no es publica (un sol error deixaria l'app en blanc per a tothom).
# Si el Mac té node + Playwright, també s'obre l'app sencera a Chromium (prova/prova.js) i ha de passar per totes les pestanyes sense errors.
python3 -I prova/sintaxi.py || { echo "No s'ha publicat res. Arregla l'error i torna-ho a provar."; exit 1; }
if command -v node >/dev/null && NODE_PATH="$(npm root -g 2>/dev/null)" node -e "require('playwright')" 2>/dev/null; then
  rc=0; NODE_PATH="$(npm root -g)" node prova/prova.js || rc=$?   # 1 = l'app falla; 2 = no s'ha pogut fer la prova (falta Chromium): es continua
  [[ $rc == 1 ]] && { echo "No s'ha publicat res: l'app no ha passat la prova."; exit 1; }
fi
# Seguretat (18-11-2026): el repositori és PÚBLIC i el que s'hi puja queda a l'historial per sempre. Abans, «git add -A»
# publicava qualsevol fitxer que hi hagués a la carpeta (un Excel amb telèfons, un PDF, una còpia…). Ara, si hi ha un
# fitxer nou que no és de l'app (o un document/arxiu a qualsevol lloc), s'atura i no publica res.
NOUS=$(git ls-files --others --exclude-standard)
ESTRANYS=$(print -r -- "$NOUS" | grep -vE '^(docs/|festivals/[^/]+/(festival\.js$|img/)|vendor/|prova/|push/|icons/|\.github/|[^/]+\.(py|sh|md|html)$)' || true)
DOCS=$(print -r -- "$NOUS" | grep -iE '\.(xlsx?|ods|csv|numbers|pdf|docx?|pages|zip|tar|gz|tgz|7z|pem|key|p12|env|sqlite|db)$|(^|/)\.env|token|secret|password|contrasenya' || true)
if [[ -n "$ESTRANYS$DOCS" ]]; then
  echo "ATURAT: a la carpeta hi ha fitxers nous que no són de l'app. No s'ha publicat res (el repositori és públic)."
  print -r -- "$ESTRANYS" "$DOCS" | grep . | sort -u | sed 's/^/   · /'
  echo "Treu-los de la carpeta (o digues-li a Claude que són de l'app) i torna-ho a provar."
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -q -m "Actualitza la web app" && echo "ok commit"
fi

PRIV=$(mktemp -d); trap 'rm -rf "$PRIV"' EXIT
print -r -- "Authorization: Bearer $(<$TOKEN_FILE)" > $PRIV/auth
api() { curl -sS -o $PRIV/out -w '%{http_code}' -H @$PRIV/auth -H "Accept: application/vnd.github+json" "$@"; }

code=$(api https://api.github.com/repos/$REPO)
if [[ $code == 404 ]]; then
  code=$(api -X POST https://api.github.com/user/repos \
    -d '{"name":"midnight-webapp","description":"Bass in the Park 2026 · horario en directo","private":false}')
  [[ $code == 201 ]] && echo "ok repositori creat" || { echo "No s'ha pogut crear el repositori (HTTP $code)"; exit 1; }
elif [[ $code != 200 ]]; then
  echo "No s'ha pogut consultar el repositori (HTTP $code)"; exit 1
fi
PRIVAT=$(python3 -I -c 'import json,sys; print(1 if json.load(open(sys.argv[1])).get("private") else "")' $PRIV/out 2>/dev/null || true)

# El token va per variable d'entorn (no surt a la línia d'ordres ni es guarda a .git/config)
BASIC=$(print -rn -- "x-access-token:$(<$TOKEN_FILE)" | base64)
# Només el veu git (no s'exporta: ni build_web.py ni altres programes l'hereten)
g() { GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Basic $BASIC" git "$@"; }
# Primer baixa els canvis que l'organització hagi fet des del web (docs/changes.json)
# (si falla, s'atura: millor no publicar que publicar a mitges)
# --rebase=merges: amb fusions de branques (p. ex. Cámaras + Ajustes) el --rebase pla les desfeia i quedava a mitges (04-11)
g pull -q --rebase=merges https://github.com/$REPO.git main || { echo "ERROR: no s'ha pogut sincronitzar amb GitHub (conflicte o sense xarxa). No s'ha publicat res."; exit 1; }
echo "ok sincronitzat"
g push -q https://github.com/$REPO.git main || { echo "ERROR: GitHub ha rebutjat la pujada (potser l'organització acaba de publicar). Torna a executar l'script."; exit 1; }
echo "ok push"

[[ -n $PRIVAT ]] && code=privat || code=$(api https://api.github.com/repos/$REPO/pages)
if [[ $code == 404 ]]; then
  code=$(api -X POST https://api.github.com/repos/$REPO/pages -d '{"source":{"branch":"main","path":"/docs"}}')
  [[ $code == 201 ]] && echo "ok Pages activat" || echo "No s'ha pogut activar Pages (HTTP $code): fes-ho a Settings → Pages"
fi
echo "Web: https://visualcrew.midnightgroup.app/"
