// /api/audit — Bitácora (solo lectura; no existe forma de editarla ni borrarla).
//   admin      → acciones de su negocio
//   superadmin → acciones de la plataforma (cuentas y negocios); nunca datos de los negocios
//   operador   → sin acceso
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { isISODate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'superadmin'));

// 'logout' ya no se registra ni se muestra (quedan registros antiguos en la BD, ocultos).
const ACTIONS = ['login', 'login_failed', 'create', 'update', 'delete', 'suspend', 'activate', 'password_change', 'password_reset'];
const day = z.string().refine(isISODate, 'Fecha inválida').optional();

const listQuery = z.object({
  userId: z.uuid().optional(),
  entity: z.string().regex(/^[a-z_]{1,40}$/).optional(),
  action: z.enum(ACTIONS).optional(),
  from: day,
  to: day,
  /** id del último registro recibido (paginación hacia atrás) */
  cursor: z.string().regex(/^\d{1,19}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Alcance según el rol: el orgId SIEMPRE sale de la sesión. */
const scope = (ctx) => ({ orgId: ctx.role === 'superadmin' ? null : ctx.orgId });

/** Inicio/fin de un día en hora de Lima (UTC−5, sin horario de verano). */
const limaStart = (iso) => new Date(`${iso}T00:00:00-05:00`);
const limaEnd = (iso) => new Date(limaStart(iso).getTime() + 86_400_000);

router.get('/', validate({ query: listQuery }), async (req, res) => {
  const { userId, entity, action, from, to, cursor, limit } = req.valid.query;
  const rows = await prisma.auditLog.findMany({
    where: {
      ...scope(req.ctx),
      userId,
      entity,
      action: action ?? { not: 'logout' },
      ...((from || to) && { createdAt: { ...(from && { gte: limaStart(from) }), ...(to && { lt: limaEnd(to) }) } }),
      ...(cursor && { id: { lt: BigInt(cursor) } }),
    },
    include: { user: { select: { id: true, name: true, username: true, role: true } } },
    orderBy: { id: 'desc' },
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  res.json({
    items: page.map(({ id, orgId, userId: _u, ...r }) => ({ ...r, id: id.toString() })),
    nextCursor: rows.length > limit ? page.at(-1).id.toString() : null,
  });
});

/** Usuarios para el filtro: el equipo del negocio (admin) o los superadmins (plataforma). */
router.get('/users', async (req, res) => {
  const where = req.ctx.role === 'superadmin' ? { role: 'superadmin' } : { orgId: req.ctx.orgId };
  const users = await prisma.user.findMany({
    where,
    select: { id: true, name: true, username: true, role: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  res.json({ items: users });
});

export default router;
