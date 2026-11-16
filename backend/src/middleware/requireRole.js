// Permisos por rol. Usar después de requireAuth.
//
//   router.post('/',   requireRole(...BUSINESS), ...)   admin y operador crean
//   router.patch('/:id', requireRole('admin'), ...)     solo admin edita
//   router.delete('/:id', requireRole('admin'), ...)    solo admin elimina
import { forbidden } from '../lib/errors.js';

/** Roles que trabajan dentro de un negocio (tienen orgId). */
export const BUSINESS = ['admin', 'operator'];

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.ctx || !roles.includes(req.ctx.role)) throw forbidden();
    if (roles.every((r) => r !== 'superadmin') && !req.ctx.orgId) throw forbidden();
    next();
  };
}
