#!/usr/bin/env bash
# Respaldo de la base de datos (incluye los PDF y fotos de los documentos).
# Guarda un archivo por día y conserva los últimos KEEP_DAYS días.
#
#   ./deploy/backup.sh                        (manual)
#   0 3 * * * /var/www/autocontrol/deploy/backup.sh >> $HOME/autocontrol-backup.log 2>&1   (cron, 3 a. m.)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/autocontrol}"
KEEP_DAYS="${KEEP_DAYS:-14}"

# DATABASE_URL de backend/.env (sin ?schema=public, que pg_dump no entiende)
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/backend/.env" | cut -d= -f2- | tr -d '"'"'"'[:space:]')"
DB_URL="${DATABASE_URL%%\?*}"

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/autocontrol-$(date +%F_%H%M).dump"

pg_dump --format=custom --no-owner --file="$FILE.tmp" "$DB_URL"
mv "$FILE.tmp" "$FILE"
chmod 600 "$FILE"

find "$BACKUP_DIR" -name 'autocontrol-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "$(date '+%F %T') ✔ Respaldo: $FILE ($(du -h "$FILE" | cut -f1))"
