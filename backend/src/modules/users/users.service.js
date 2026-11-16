// Equipo del negocio: el administrador crea, edita, suspende y restablece la contraseña
// de SUS operadores. Todo se filtra por ctx.orgId: nunca ve ni toca usuarios de otro negocio,
// ni a otros administradores. Sus acciones van a la bitácora del negocio.
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { notFound } from '../../lib/errors.js';
import { ensureAvailable } from '../../lib/accounts.js';
import { generatePassword, hashPassword } from '../../lib/passwords.js';

const FIELDS = { id: true, name: true, username: true, email: true, role: true, status: true, lastLoginAt: true, createdAt: true };

/** Operador del MISMO negocio, o 404 (no se revela si existe en otro negocio). */
async function findOperator(ctx, id, db = prisma) {
  const user = await db.user.findFirst({ where: { id, orgId: ctx.orgId, role: 'operator' }, select: FIELDS });
  if (!user) throw notFound('Usuario no encontrado');
  return user;
}

/** Administrador + operadores del negocio. */
export function list(ctx) {
  return prisma.user.findMany({
    where: { orgId: ctx.orgId },
    select: FIELDS,
    orderBy: [{ role: 'asc' }, { name: 'asc' }], // admin primero
  });
}

export async function create(ctx, data) {
  await ensureAvailable(data);
  const password = data.password ?? generatePassword();
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: data.name, username: data.username, email: data.email,
        role: 'operator', orgId: ctx.orgId, createdById: ctx.userId, passwordHash,
      },
      select: FIELDS,
    });
    await audit(tx, { ctx, action: 'create', entity: 'user', entityId: u.id, changes: { usuario: u.username, nombre: u.name, rol: 'operador' } });
    return u;
  });

  return { user, credentials: { username: user.username, temporaryPassword: data.password ? null : password } };
}

export async function update(ctx, id, data) {
  const before = await findOperator(ctx, id);
  if (data.email) await ensureAvailable({ email: data.email }, id);

  return prisma.$transaction(async (tx) => {
    const after = await tx.user.update({ where: { id }, data: { name: data.name, email: data.email }, select: FIELDS });
    const changes = diff(before, after);
    if (Object.keys(changes).length) await audit(tx, { ctx, action: 'update', entity: 'user', entityId: id, changes });
    return after;
  });
}

/** Suspender cierra sus sesiones; al reactivar debe iniciar sesión de nuevo. */
export async function setStatus(ctx, id, status) {
  const user = await findOperator(ctx, id);
  if (user.status === status) return user;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { status, ...(status === 'suspended' && { sessionVersion: { increment: 1 } }) },
      select: FIELDS,
    });
    await audit(tx, {
      ctx, action: status === 'suspended' ? 'suspend' : 'activate', entity: 'user', entityId: id,
      changes: { usuario: user.username },
    });
    return updated;
  });
}

export async function resetPassword(ctx, id, { password }) {
  const user = await findOperator(ctx, id);
  const newPassword = password ?? generatePassword();
  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash, sessionVersion: { increment: 1 } } }),
    audit(prisma, { ctx, action: 'password_reset', entity: 'user', entityId: id, changes: { usuario: user.username } }),
  ]);
  return { username: user.username, temporaryPassword: password ? null : newPassword };
}
