#!/usr/bin/env bash
# Crée une archive ZIP complète et vérifiable du projet, indépendante de GitHub.
# Contenu : fichiers suivis par Git + historique Git + vidéo générée (video/sortie/*.mp4).
# Exclus : node_modules, dist, fichiers temporaires, données de test, secrets (.env).
# Usage : bash scripts/creer-sauvegarde.sh   → livraison/aurevia-saas-sauvegarde-AAAA-MM-JJ.zip
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain)" ]; then echo "Des modifications ne sont pas sauvegardées dans Git : faites un commit d'abord." >&2; exit 1; fi
DATE=$(date +%F)
TMP=$(mktemp -d)
DEST="$TMP/aurevia-saas"
mkdir -p "$DEST" livraison
git archive HEAD | tar -x -C "$DEST"
cp -r .git "$DEST/.git"
if ls video/sortie/*.mp4 >/dev/null 2>&1; then mkdir -p "$DEST/video/sortie" && cp video/sortie/*.mp4 "$DEST/video/sortie/"; fi
cat > "$DEST/SAUVEGARDE.md" <<TXT
# Sauvegarde AUREVIA SAAS – $DATE

Archive complète du projet, indépendante de GitHub (dernier commit : $(git rev-parse --short HEAD)).

- Code source, données (1 500 idées : src/data/marches.json), version originale (original/), tests, documentation.
- Historique Git complet (dossier .git).
- Vidéo : video/sortie/*.mp4 (nouvelle création, pas la vidéo originale) et son script video/generer-video.py.
- Exclus : node_modules, dist, fichiers temporaires, données de test, secrets (.env).

Pour repartir : décompresser, puis « npm install » et « npm test » (voir README.md).
Vérifier l'intégrité : « sha256sum -c EMPREINTES.txt ». SAUVEGARDE.md et EMPREINTES.txt ne font pas partie de l'historique Git.
TXT
( cd "$DEST" && find . -type f -not -path "./.git/*" -not -name EMPREINTES.txt | sort | xargs sha256sum > EMPREINTES.txt )
ZIP="$PWD/livraison/aurevia-saas-sauvegarde-$DATE.zip"
rm -f "$ZIP"
( cd "$TMP" && zip -qr -9 "$ZIP" aurevia-saas )
rm -rf "$TMP"
unzip -tq "$ZIP"
echo "Archive créée : $ZIP"
