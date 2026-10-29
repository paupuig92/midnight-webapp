#!/bin/bash
# Publica una versió preparada per Claude (al núvol) en un sol pas:
#   ./publica-commit.sh <commit> [més fitxers…]
# Baixa d'aquell commit de GitHub index.html, i18n_ca.py i el festival.js del festival actual
# (més els fitxers que s'hi afegeixin, p. ex. img/mapa.jpg), i després executa ./publica-web.sh.
# Si una baixada falla, s'atura sense tocar res.
set -e
cd "$(dirname "$0")"
C=${1:?"Falta el commit: ./publica-commit.sh <commit>"}; shift
[[ $C =~ ^[0-9a-f]{7,40}$ ]] || { echo "Commit no vàlid: $C"; exit 1; }
B=https://raw.githubusercontent.com/paupuig92/midnight-webapp/$C
FEST=$(python3 -I -c "import re;s=open('index.html').read();print(re.search(r\"id: '([^']+)'\",s[s.index('==== FESTIVAL ===='):]).group(1))")
files=(index.html i18n_ca.py "festivals/$FEST/festival.js" "$@")
T=$(mktemp -d)
for f in "${files[@]}"; do
  mkdir -p "$T/$(dirname "$f")"
  curl -fsSL -o "$T/$f" "$B/$f" || { echo "ERROR: no s'ha pogut baixar $f del commit $C. No s'ha publicat res."; rm -rf "$T"; exit 1; }
done
for f in "${files[@]}"; do
  mkdir -p "$(dirname "$f")"; cp "$T/$f" "$f"
  echo "ok $f  $(md5 -q "$f" 2>/dev/null || md5sum "$f" | cut -d' ' -f1)"
done
rm -rf "$T"
[[ ${PUBLICA_SENSE_PUJAR:-} ]] && { echo "(prova: no es publica)"; exit 0; }
./publica-web.sh
