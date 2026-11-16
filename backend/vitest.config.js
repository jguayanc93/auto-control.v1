import { defineConfig } from 'vitest/config';

// Ejecutar con `npm test` (usa scripts/test.js, que corrige la ruta en Windows).
export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    globalSetup: ['tests/global-setup.js'],
    fileParallelism: false, // todos los archivos comparten la BD de tests
    testTimeout: 30_000,
    hookTimeout: 30_000, // preparación (vaciar BD, login) con margen si el equipo está ocupado
  },
});
