import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import superadminRoutes from './modules/superadmin/superadmin.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import vehiclesRoutes from './modules/vehicles/vehicles.routes.js';
import rentersRoutes from './modules/renters/renters.routes.js';
import rentalsRoutes from './modules/rentals/rentals.routes.js';
import dailyRoutes from './modules/daily/daily.routes.js';
import expensesRoutes from './modules/expenses/expenses.routes.js';
import documentsRoutes from './modules/documents/documents.routes.js';
import maintenancesRoutes from './modules/maintenances/maintenances.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';

const FRONTEND_DIR = fileURLToPath(new URL('../../frontend', import.meta.url));

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás de Apache: req.ip = IP real del cliente
  // CSP desactivada: Alpine.js y Tailwind (CDN) la necesitan relajada. Se configura en Apache.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // ───── API ─────
  const api = express.Router();

  api.get('/health', async (req, res) => {
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db, time: new Date().toISOString() });
  });

  api.use('/auth', authRoutes);
  api.use('/superadmin/businesses', superadminRoutes);
  api.use('/users', usersRoutes);
  api.use('/vehicles', vehiclesRoutes);
  api.use('/renters', rentersRoutes);
  api.use('/rentals', rentalsRoutes);
  api.use('/daily', dailyRoutes);
  api.use('/expenses', expensesRoutes);
  api.use('/documents', documentsRoutes);
  api.use('/maintenances', maintenancesRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/audit', auditRoutes);

  app.use('/api', api, apiNotFound);

  // ───── Frontend (solo desarrollo; en el servidor lo sirve Apache) ─────
  if (env.SERVE_FRONTEND) {
    app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));
  }

  app.use(errorHandler);
  return app;
}
