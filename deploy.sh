#!/bin/sh
# ============================================================
# Workout Tracker – Deployment-Skript für die Synology DS
# ============================================================
#
# Aufruf auf der DS:
#   sudo sh /volume1/docker/workout-tracker/deploy.sh            # nur Frontend (schnell, kein Re-Login)
#   sudo sh /volume1/docker/workout-tracker/deploy.sh rebuild    # voller Rebuild (bei Backend-Änderungen)
#
# Vor JEDEM Update wird die Datenbank automatisch gesichert:
#   /volume1/docker/workout-tracker/data/backups/<Zeitstempel>/
#   (die letzten 10 Sicherungen bleiben erhalten)
#
# Wiederherstellen im Notfall:
#   sudo docker-compose -f /volume1/docker/workout-tracker/docker-compose.yml stop
#   sudo cp /volume1/docker/workout-tracker/data/backups/<Zeitstempel>/training.db \
#           /volume1/docker/workout-tracker/data/training.db
#   sudo docker-compose -f /volume1/docker/workout-tracker/docker-compose.yml start
# ============================================================

set -e

BRANCH="main"
WORKDIR="/volume1/docker/workout-tracker"
ZIP_URL="https://github.com/nero2465/training/archive/refs/heads/${BRANCH}.zip"
MODE="${1:-frontend}"

echo "▶ Workout Tracker Deployment – Modus: ${MODE} (Quelle: ${BRANCH})"

# ── Schritt 1: Datenbank-Backup (vor jeder Änderung) ────────
DATA_DIR="${WORKDIR}/data"
BACKUP_ROOT="${DATA_DIR}/backups"
STAMP=$(date +%Y-%m-%d_%H%M%S)

if [ -f "${DATA_DIR}/training.db" ]; then
  mkdir -p "${BACKUP_ROOT}/${STAMP}"
  cp "${DATA_DIR}/training.db" "${BACKUP_ROOT}/${STAMP}/"
  # WAL-/SHM-Dateien mitsichern, falls vorhanden (konsistenter Snapshot)
  [ -f "${DATA_DIR}/training.db-wal" ] && cp "${DATA_DIR}/training.db-wal" "${BACKUP_ROOT}/${STAMP}/" || true
  [ -f "${DATA_DIR}/training.db-shm" ] && cp "${DATA_DIR}/training.db-shm" "${BACKUP_ROOT}/${STAMP}/" || true
  echo "✓ Backup erstellt: data/backups/${STAMP}/"

  # Nur die letzten 10 Backups behalten
  KEEP=10
  COUNT=$(ls -1 "${BACKUP_ROOT}" | wc -l)
  if [ "$COUNT" -gt "$KEEP" ]; then
    ls -1 "${BACKUP_ROOT}" | sort | head -n $((COUNT - KEEP)) | while read -r OLD; do
      rm -rf "${BACKUP_ROOT:?}/${OLD}"
      echo "  Altes Backup entfernt: ${OLD}"
    done
  fi
else
  echo "ℹ Keine training.db gefunden – Backup übersprungen."
fi

# ── Schritt 2: Code aktualisieren ───────────────────────────
if [ "$MODE" = "rebuild" ]; then
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
      cp training-*/deploy.sh /workdir/deploy.sh.new &&
      echo '  Quelldateien aktualisiert'
    "
  echo "▶ Baue Container neu …"
  cd "${WORKDIR}" && sudo docker-compose up -d --build
  echo "✅ Rebuild fertig – bitte einmal neu einloggen (Session wurde zurückgesetzt)."
else
  sudo docker run --rm \
    -v "${WORKDIR}:/workdir" \
    alpine sh -c "
      apk add -q --no-cache wget unzip &&
      wget -q '${ZIP_URL}' -O /tmp/t.zip &&
      cd /tmp && unzip -q t.zip &&
      cp -r training-*/public/. /workdir/public/ &&
      cp training-*/deploy.sh /workdir/deploy.sh.new &&
      echo '  Frontend aktualisiert'
    "
  echo "✅ Frontend-Update fertig – Seite am Handy neu laden."
fi

# ── Schritt 3: deploy.sh selbst aktualisieren ───────────────
# (mv statt cp: das laufende Skript liest sicher von der alten Datei weiter)
if [ -f "${WORKDIR}/deploy.sh.new" ]; then
  mv "${WORKDIR}/deploy.sh.new" "${WORKDIR}/deploy.sh"
  echo "✓ deploy.sh auf neuestem Stand."
fi
