#!/bin/sh
# ============================================================
# Workout Tracker – Deployment-Skript für die Synology DS
# ============================================================
#
# Aufruf auf der DS:
#   sudo sh /volume1/docker/workout-tracker/deploy.sh            # nur Frontend (schnell, kein Re-Login)
#   sudo sh /volume1/docker/workout-tracker/deploy.sh rebuild    # voller Rebuild (bei Backend-Änderungen)
#
# Frontend-Modus  → kopiert nur public/  (kein Container-Neustart, Session bleibt erhalten)
# Rebuild-Modus   → aktualisiert db/, routes/, server.js, public/ und baut den Container neu
#                   (nötig bei Änderungen an db/*, routes/*, server.js — danach neu einloggen)
# ============================================================

set -e

BRANCH="claude/training-app-workout-tracker-cVPph"
WORKDIR="/volume1/docker/workout-tracker"
ZIP_URL="https://github.com/nero2465/training/archive/refs/heads/${BRANCH}.zip"
MODE="${1:-frontend}"

echo "▶ Workout Tracker Deployment – Modus: ${MODE}"
echo "▶ Branch: ${BRANCH}"

if [ "$MODE" = "rebuild" ]; then
  # ── Voller Rebuild: alle Quelldateien + Container neu bauen ──
  sudo docker run --rm \
    -v "${WORKDIR}:/workdir" \
    alpine sh -c "
      apk add -q --no-cache wget unzip &&
      wget -q '${ZIP_URL}' -O /tmp/t.zip &&
      cd /tmp && unzip -q t.zip &&
      cp -r training-*/db/. /workdir/db/ &&
      cp -r training-*/routes/. /workdir/routes/ &&
      cp training-*/server.js /workdir/ &&
      cp -r training-*/public/. /workdir/public/ &&
      echo '  Quelldateien aktualisiert'
    "
  echo "▶ Baue Container neu …"
  cd "${WORKDIR}" && sudo docker-compose up -d --build
  echo "✅ Rebuild fertig – bitte einmal neu einloggen (Session wurde zurückgesetzt)."
else
  # ── Nur Frontend: public/ ersetzen, kein Neustart ──
  sudo docker run --rm \
    -v "${WORKDIR}/public:/output" \
    alpine sh -c "
      apk add -q --no-cache wget unzip &&
      wget -q '${ZIP_URL}' -O /tmp/t.zip &&
      cd /tmp && unzip -q t.zip &&
      cp -r training-*/public/. /output/ &&
      echo '  Frontend aktualisiert'
    "
  echo "✅ Frontend-Update fertig – Seite am Handy neu laden."
fi
