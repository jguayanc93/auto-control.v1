// Carga y valida las variables de entorno. Si falta algo, la app no arranca
// y muestra exactamente qué variable corregir.
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Mensajes de validación de Zod en español para toda la app (este archivo se carga primero).
z.config(z.locales.es());

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  /* sin archivo .env: se usan las variables del sistema (PM2, etc.) */
}

if (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL_TEST) {
  // Los tests nunca tocan la base de desarrollo.
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().startsWith('postgresql://', 'Debe ser una URL postgresql://'),
  JWT_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECURE: z.stringbool().default(false),
  SERVE_FRONTEND: z.stringbool().default(false),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n✖ Configuración inválida en backend/.env:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  console.error('  Revisa backend/.env.example\n');
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
});
