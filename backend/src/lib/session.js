// Sesión: JWT firmado dentro de una cookie httpOnly (JavaScript del navegador no puede leerla).
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const COOKIE_NAME = 'ac_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax', // el navegador no envía la cookie en peticiones desde otros sitios (protege contra CSRF)
  path: '/',
});

/** Firma el token. `sv` (sessionVersion) permite invalidar sesiones al cambiar contraseña o suspender. */
export function signSession(user) {
  return jwt.sign({ sub: user.id, sv: user.sessionVersion }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

export function verifySession(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

export function setSessionCookie(res, user) {
  res.cookie(COOKIE_NAME, signSession(user), { ...cookieOptions(), maxAge: MAX_AGE_MS });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}
