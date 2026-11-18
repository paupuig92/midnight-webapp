#!/bin/bash
# Publica una versió preparada per Claude (al núvol) en un sol pas:
#   ./publica-commit.sh <commit> [més fitxers…]
# (18-11-2026) Funciona també amb el repositori PRIVAT: baixa amb git i el token (el mateix de publica-web.sh, sense mostrar-lo),
# ja no de raw.githubusercontent.com (que només serveix repositoris públics).
# Baixa d'aquell commit de GitHub index.html, i18n_ca.py i el festival.js del festival actual
# (més els fitxers que s'hi afegeixin, p. ex. img/mapa.jpg), i després executa ./publica-web.sh.
# Si una baixada falla, s'atura sense tocar res.
set -e
cd "$(dirname "$0")"
C=${1:?"Falta el commit: ./publica-commit.sh <commit>"}; shift
[[ $C =~ ^[0-9a-f]{7,40}$ ]] || { echo "Commit no vàlid: $C"; exit 1; }
# Seguretat (18-11-2026): GitHub també serveix, sota l'adreça d'aquest repositori, commits fets en còpies (forks) d'altra gent.
# Per això es comprova que el commit és de veritat d'una branca del repositori abans de baixar-ne res.
TOKEN_FILE=~/.config/midnight-webapp/github-token
[[ -r $TOKEN_FILE ]] || TOKEN_FILE=~/.config/midnight-suite/github-token
[[ -r $TOKEN_FILE ]] || { echo "Falta el token de GitHub ($TOKEN_FILE). No s'ha publicat res."; exit 1; }
# El token va per variable d'entorn, només per a git (no surt a la línia d'ordres ni es guarda a .git/config)
BASIC=$(printf 'x-access-token:%s' "$(<"$TOKEN_FILE")" | base64 | tr -d '\n')
g() { GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Basic $BASIC" git "$@"; }
g fetch -q https://github.com/paupuig92/midnight-webapp.git '+refs/heads/*:refs/remotes/publica-check/*' || { echo "ERROR: no s'ha pogut consultar GitHub. No s'ha publicat res."; exit 1; }
FULL=$(git rev-parse --verify -q "$C^{commit}") || { echo "ATURAT: el commit $C no és de cap branca del repositori. No s'ha publicat res."; exit 1; }
[[ -n "$(git branch -r --contains "$FULL" --list 'publica-check/*')" ]] || { echo "ATURAT: el commit $C no és de cap branca del repositori. No s'ha publicat res."; exit 1; }
C=$FULL
FEST=$(python3 -I -c "import re;s=open('index.html').read();print(re.search(r\"id: '([^']+)'\",s[s.index('==== FESTIVAL ===='):]).group(1))")
files=(index.html i18n_ca.py "festivals/$FEST/festival.js" "$@")
T=$(mktemp -d)
for f in "${files[@]}"; do
  mkdir -p "$T/$(dirname "$f")"
  git show "$C:$f" > "$T/$f" 2>/dev/null || { echo "ERROR: no s'ha pogut baixar $f del commit $C. No s'ha publicat res."; rm -rf "$T"; exit 1; }
done
for f in "${files[@]}"; do
  mkdir -p "$(dirname "$f")"; cp "$T/$f" "$f"
  echo "ok $f  $(md5 -q "$f" 2>/dev/null || md5sum "$f" | cut -d' ' -f1)"
done
rm -rf "$T"
[[ ${PUBLICA_SENSE_PUJAR:-} ]] && { echo "(prova: no es publica)"; exit 0; }
./publica-web.sh
