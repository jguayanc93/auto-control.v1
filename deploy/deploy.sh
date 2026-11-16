#!/usr/bin/env bash
# Actualiza AUTO-CONTROL en el servidor con lo último de GitHub:
#   git pull → npm ci → migraciones → reinicio sin cortar el servicio
#
#   cd /var/www/autocontrol && ./deploy/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_MAJOR=24

# PM2 que YA administra los otros proyectos del servidor: se ubica ANTES de cambiar a Node 24
# (si se instaló con otra versión de Node, al cambiar dejaría de estar en el PATH).
# Se puede forzar con:  PM2_BIN=/ruta/a/pm2 ./deploy/deploy.sh
PM2="${PM2_BIN:-$(command -v pm2 || true)}"

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
PM2="${PM2:-$(command -v pm2 || true)}"
if [ -z "$PM2" ]; then
  echo "✖ No se encontró pm2. Si ya lo usas con otro Node: PM2_BIN=\$(which pm2) ./deploy/deploy.sh" >&2
  exit 1
fi

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

echo "▶ Reiniciando la API (solo autocontrol-api; los demás procesos de PM2 no se tocan)…"
if "$PM2" describe autocontrol-api >/dev/null 2>&1; then
  "$PM2" reload "$APP_DIR/deploy/ecosystem.config.cjs" --only autocontrol-api --update-env
else
  "$PM2" start "$APP_DIR/deploy/ecosystem.config.cjs" --only autocontrol-api
fi
"$PM2" save >/dev/null   # guarda la lista completa (tus otros proyectos incluidos) para el reinicio del servidor

sleep 2
PORT="$(grep -E '^PORT=' .env | cut -d= -f2 | tr -d '[:space:]')"
if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null; then
  echo "✔ AUTO-CONTROL actualizado ($(git -C "$APP_DIR" log -1 --format='%h %s'))"
else
  echo "✖ La API no responde. Revisa: pm2 logs autocontrol-api --lines 50" >&2
  exit 1
fi
