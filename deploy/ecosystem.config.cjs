// PM2: mantiene viva la API, la reinicia si falla y la levanta al reiniciar el servidor.
// Lo usa deploy/deploy.sh. Uso manual:  pm2 start deploy/ecosystem.config.cjs
//
// AUTOCONTROL_NODE: ruta del Node 24 instalado con nvm (la exporta deploy.sh).
// Así la app usa Node 24 aunque PM2 o el sistema usen otra versión (el servidor tiene Node 20).
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'autocontrol-api',
      cwd: path.join(__dirname, '..', 'backend'),
      script: 'src/server.js',
      interpreter: process.env.AUTOCONTROL_NODE || 'node',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      restart_delay: 3000,
      time: true, // fecha y hora en los logs (pm2 logs autocontrol-api)
    },
  ],
};
