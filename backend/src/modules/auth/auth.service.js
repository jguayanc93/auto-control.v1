import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { forbidden, unauthorized } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/passwords.js';

/** Datos del usuario que se pueden enviar al navegador. */
export function publicSession(user) {
  return {
    user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
    org: user.org ? { id: user.org.id, name: user.org.name } : null,
  };
}

/**
 * @param {{ login: string, password: string }} credentials  login = usuario o correo
 * @param {{ ip?: string, userAgent?: string }} meta
 */
export async function login({ login, password }, meta) {
  const where = login.includes('@') ? { email: login } : { username: login };
  const user = await prisma.user.findUnique({ where, include: { org: true } });
  const valid = await verifyPassword(password, user?.passwordHash);

  if (!user || !valid) {
    await audit(prisma, {
      ctx: { ...meta, userId: user?.id ?? null },
      orgId: user?.orgId ?? null,
      action: 'login_failed',
      entity: 'user',
      entityId: user?.id ?? null,
      changes: { login: login.slice(0, 160) },
    });
    throw unauthorized('Usuario o contraseña incorrectos');
  }

  if (user.status !== 'active' || (user.org && user.org.status !== 'active')) {
    await audit(prisma, {
      ctx: { ...meta, userId: user.id },
      orgId: user.orgId,
      action: 'login_failed',
      entity: 'user',
      entityId: user.id,
      changes: { login, motivo: 'cuenta suspendida' },
    });
    throw forbidden('Tu cuenta está suspendida. Comunícate con el administrador.');
  }

  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, include: { org: true } }),
    audit(prisma, { ctx: { ...meta, userId: user.id }, orgId: user.orgId, action: 'login', entity: 'user', entityId: user.id }),
  ]);
  return updated;
}


/** Cambia la contraseña e invalida las demás sesiones abiertas. */
export async function changePassword(ctx, { currentPassword, newPassword }) {
  const valid = await verifyPassword(currentPassword, ctx.user.passwordHash);
  if (!valid) throw unauthorized('La contraseña actual no es correcta');

  const passwordHash = await hashPassword(newPassword);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: ctx.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      include: { org: true },
    });
    await audit(tx, { ctx, action: 'password_change', entity: 'user', entityId: ctx.userId });
    return user;
  });
}
