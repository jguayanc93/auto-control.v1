// Antes de correr los tests: aplica las migraciones pendientes a la BD de tests (DATABASE_URL_TEST).
// `migrate deploy` no borra nada (la crea si no existe); cada test limpia sus tablas con resetDb().
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function setup() {
  try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch { /* variables del sistema */ }
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Falta DATABASE_URL_TEST en backend/.env');
  if (url === process.env.DATABASE_URL) throw new Error('DATABASE_URL_TEST no puede ser igual a DATABASE_URL');

  if (!new URL(url).pathname.endsWith('_test')) throw new Error('DATABASE_URL_TEST debe apuntar a una BD cuyo nombre termine en _test');

  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
