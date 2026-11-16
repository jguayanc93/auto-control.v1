// Exige sesión válida y arma req.ctx = { userId, orgId, role, user, org, ip, userAgent }.
// El usuario se lee de la BD en cada petición: si lo suspenden o cambia su contraseña,
// el efecto es inmediato (no hay que esperar a que venza el token).
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { COOKIE_NAME, clearSessionCookie, verifySession } from '../lib/session.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = verifySession(token);
  } catch {
    clearSessionCookie(res);
    throw unauthorized('Tu sesión expiró. Vuelve a iniciar sesión.');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { org: { select: { id: true, name: true, status: true } } },
  });

  if (!user || user.sessionVersion !== payload.sv) {
    clearSessionCookie(res);
    throw unauthorized('Tu sesión expiró. Vuelve a iniciar sesión.');
  }
  if (user.status !== 'active' || (user.org && user.org.status !== 'active')) {
    clearSessionCookie(res);
    throw forbidden('Tu cuenta está suspendida. Comunícate con el administrador.');
  }

  req.ctx = {
    userId: user.id,
    orgId: user.orgId,
    role: user.role,
    user,
    org: user.org,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  };
  next();
}
