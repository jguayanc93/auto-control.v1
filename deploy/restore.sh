#!/usr/bin/env bash
# Restaura un respaldo hecho con backup.sh. REEMPLAZA todos los datos actuales.
#
#   ./deploy/restore.sh /var/backups/autocontrol/autocontrol-2026-11-20_0300.dump
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: $0 <archivo.dump>" >&2
  echo "Respaldos disponibles:" >&2
  ls -1t /var/backups/autocontrol/*.dump 2>/dev/null | head -n 10 >&2 || true
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/backend/.env" | cut -d= -f2- | tr -d '"'"'"'[:space:]')"
DB_URL="${DATABASE_URL%%\?*}"

echo "⚠ Se reemplazarán TODOS los datos actuales por los del respaldo:"
echo "   $FILE"
read -r -p "Escribe RESTAURAR para continuar: " answer
[ "$answer" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

echo "▶ Respaldo de seguridad del estado actual…"
"$APP_DIR/deploy/backup.sh"

echo "▶ Deteniendo la API…"
pm2 stop autocontrol-api >/dev/null 2>&1 || true

echo "▶ Restaurando…"
pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$DB_URL" "$FILE"

echo "▶ Iniciando la API…"
pm2 start autocontrol-api >/dev/null 2>&1 || "$APP_DIR/deploy/deploy.sh"
echo "✔ Restauración completa"
