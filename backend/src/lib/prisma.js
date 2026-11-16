// Cliente único de Prisma (Prisma 7 usa un "driver adapter" para PostgreSQL).
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.isProd ? ['error'] : ['warn', 'error'],
});
