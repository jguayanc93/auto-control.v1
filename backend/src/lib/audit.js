// Bitácora. Llamar SIEMPRE dentro de la misma transacción que la acción,
// así nunca queda una acción sin registrar (ni un registro de algo que falló).
import { prisma } from './prisma.js';

/** Campos que nunca se guardan en la bitácora. */
const HIDDEN = new Set(['passwordHash', 'sessionVersion', 'data', 'file']);
/** Campos que no aportan en la comparación antes/después. */
const IGNORE_IN_DIFF = new Set(['updatedAt', 'createdAt']);

/** Convierte un registro de Prisma en JSON plano (Decimal → string, Date → ISO) sin campos ocultos. */
export function snapshot(record) {
  if (!record) return null;
  return JSON.parse(JSON.stringify(record, (key, value) => {
    if (HIDDEN.has(key)) return undefined;
    if (typeof value === 'bigint') return value.toString();
    return value;
  }));
}

/** Solo los campos que cambiaron: { campo: { antes, despues } }. */
export function diff(before, after) {
  const a = snapshot(before) ?? {};
  const b = snapshot(after) ?? {};
  const changes = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (IGNORE_IN_DIFF.has(key)) continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) changes[key] = { antes: a[key] ?? null, despues: b[key] ?? null };
  }
  return changes;
}

/**
 * Registra una acción.
 * @param {object} db   Cliente Prisma o transacción (tx)
 * @param {object} p
 * @param {object} [p.ctx]     req.ctx del usuario que actúa ({ userId, orgId, ip, userAgent })
 * @param {string} p.action    Valor de AuditAction
 * @param {string} p.entity    Módulo: 'user', 'organization', 'vehicle', ...
 * @param {string|null} [p.entityId]
 * @param {object|null} [p.changes]
 * @param {string|null} [p.orgId]  Si se omite, se usa ctx.orgId
 */
export function audit(db, { ctx, action, entity, entityId = null, changes = null, orgId }) {
  return (db ?? prisma).auditLog.create({
    data: {
      orgId: orgId !== undefined ? orgId : ctx?.orgId ?? null,
      userId: ctx?.userId ?? null,
      action,
      entity,
      entityId: entityId != null ? String(entityId) : null,
      changes: changes ?? undefined,
      ip: ctx?.ip?.slice(0, 64) ?? null,
      userAgent: ctx?.userAgent?.slice(0, 255) ?? null,
    },
  });
}
