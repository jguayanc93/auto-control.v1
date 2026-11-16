// Configuración de Prisma CLI (migraciones, generate). JS puro, sin TypeScript.
import { defineConfig } from 'prisma/config';

try { process.loadEnvFile(new URL('./.env', import.meta.url)); } catch { /* sin .env: se usan variables del sistema */ }

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
