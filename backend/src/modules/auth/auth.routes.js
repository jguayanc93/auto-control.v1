import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { clearSessionCookie, setSessionCookie } from '../../lib/session.js';
import { changePasswordSchema, loginSchema } from './auth.schema.js';
import * as auth from './auth.service.js';

const router = Router();

// Máximo 10 intentos de login cada 15 minutos por IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ error: { message: 'Demasiados intentos. Espera unos minutos e inténtalo otra vez.', code: 'TOO_MANY_REQUESTS' } }),
});

router.post('/login', loginLimiter, validate({ body: loginSchema }), async (req, res) => {
  const user = await auth.login(req.valid.body, { ip: req.ip, userAgent: req.get('user-agent') });
  setSessionCookie(res, user);
  res.json(auth.publicSession(user));
});

// Cerrar sesión no se registra en la bitácora (decisión del cliente: solo llenaba la lista).
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json(auth.publicSession(req.ctx.user));
});

router.post('/change-password', requireAuth, validate({ body: changePasswordSchema }), async (req, res) => {
  const user = await auth.changePassword(req.ctx, req.valid.body);
  setSessionCookie(res, user); // nueva cookie para esta sesión; las demás quedan cerradas
  res.json(auth.publicSession(user));
});

export default router;
