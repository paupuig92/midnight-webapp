#!/bin/zsh
# Publica la web app a GitHub Pages (paupuig92/midnight-webapp), com fa la Midnight Suite:
# fa servir el token de ~/.config/midnight-webapp/github-token (o, si no hi és, el de la Suite)
# sense mostrar-lo mai.
#   1. regenera docs/ i fa commit si hi ha canvis
#   2. crea el repositori si encara no existeix
#   3. puja la branca main
#   4. activa GitHub Pages (main, /docs) si no ho està
set -e
cd "${0:A:h}"
REPO=paupuig92/midnight-webapp
TOKEN_FILE=~/.config/midnight-webapp/github-token
[[ -r $TOKEN_FILE ]] || TOKEN_FILE=~/.config/midnight-suite/github-token

python3 -I build_web.py
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

# El token va per variable d'entorn (no surt a la línia d'ordres ni es guarda a .git/config)
BASIC=$(print -rn -- "x-access-token:$(<$TOKEN_FILE)" | base64)
GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader \
  GIT_CONFIG_VALUE_0="Authorization: Basic $BASIC" \
  git push -q https://github.com/$REPO.git main && echo "ok push"

code=$(api https://api.github.com/repos/$REPO/pages)
if [[ $code == 404 ]]; then
  code=$(api -X POST https://api.github.com/repos/$REPO/pages -d '{"source":{"branch":"main","path":"/docs"}}')
  [[ $code == 201 ]] && echo "ok Pages activat" || echo "No s'ha pogut activar Pages (HTTP $code): fes-ho a Settings → Pages"
fi
echo "Web: https://paupuig92.github.io/midnight-webapp/"
