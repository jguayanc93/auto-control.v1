import os from 'node:os';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { createApp } from './app.js';

const app = createApp();

const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`AUTO-CONTROL API escuchando en http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  if (!env.isProd && env.HOST === '0.0.0.0') {
    // Muestra la IP de la red local para probar desde el celular (misma red WiFi).
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const n of nets ?? []) {
        if (n.family === 'IPv4' && !n.internal) console.log(`  Desde el celular: http://${n.address}:${env.PORT}`);
      }
    }
  }
});

async function shutdown(signal) {
  console.log(`\n${signal} recibido, cerrando...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
