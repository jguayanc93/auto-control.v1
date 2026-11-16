#!/usr/bin/env bash
# Actualiza AUTO-CONTROL en el servidor con lo último de GitHub:
#   git pull → npm ci → migraciones → reinicio sin cortar el servicio
#
#   cd /var/www/autocontrol && ./deploy/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_MAJOR=24

# Node 24 de nvm (sin tocar el Node del sistema)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use "$NODE_MAJOR" >/dev/null
fi
NODE_VERSION="$(node -v)"
case "$NODE_VERSION" in
  "v$NODE_MAJOR".*) ;;
  *) echo "✖ Se necesita Node $NODE_MAJOR (hay $NODE_VERSION). Instálalo con: nvm install $NODE_MAJOR" >&2; exit 1 ;;
esac
export AUTOCONTROL_NODE="$(command -v node)"

cd "$APP_DIR"
if [ ! -f backend/.env ]; then
  echo "✖ Falta backend/.env (copia deploy/env.production.example y complétalo)" >&2
  exit 1
fi

echo "▶ Descargando cambios…"
git pull --ff-only

echo "▶ Instalando dependencias…"
cd backend
npm ci --no-audit --no-fund

echo "▶ Aplicando migraciones de la base de datos…"
npx prisma migrate deploy

echo "▶ Reiniciando la API…"
if pm2 describe autocontrol-api >/dev/null 2>&1; then
  pm2 reload "$APP_DIR/deploy/ecosystem.config.cjs" --update-env
else
  pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
fi
pm2 save >/dev/null

sleep 2
PORT="$(grep -E '^PORT=' .env | cut -d= -f2 | tr -d '[:space:]')"
if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null; then
  echo "✔ AUTO-CONTROL actualizado ($(git -C "$APP_DIR" log -1 --format='%h %s'))"
else
  echo "✖ La API no responde. Revisa: pm2 logs autocontrol-api --lines 50" >&2
  exit 1
fi
