// Gestión de negocios por el superadmin.
// El superadmin solo ve datos generales (nombre, administrador, cantidades, último acceso):
// nunca el contenido de un negocio (vehículos, pagos, documentos...).
// Sus acciones se registran en la bitácora con orgId = null (nivel plataforma).
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { notFound } from '../../lib/errors.js';
import { ensureAvailable } from '../../lib/accounts.js';
import { generatePassword, hashPassword } from '../../lib/passwords.js';

const ADMIN_FIELDS = { id: true, name: true, username: true, email: true, status: true, lastLoginAt: true, createdAt: true };

const BUSINESS_INCLUDE = {
  users: { where: { role: 'admin' }, select: ADMIN_FIELDS, orderBy: { createdAt: 'asc' }, take: 1 },
  _count: {
    select: {
      vehicles: true,
      users: { where: { role: 'operator' } },
    },
  },
};

function toDTO(org) {
  return {
    id: org.id,
    name: org.name,
    status: org.status,
    createdAt: org.createdAt,
    admin: org.users[0] ?? null,
    counts: { vehicles: org._count.vehicles, operators: org._count.users },
  };
}

async function findBusiness(id, db = prisma) {
  const org = await db.organization.findUnique({ where: { id }, include: BUSINESS_INCLUDE });
  if (!org) throw notFound('Negocio no encontrado');
  return org;
}

export async function list() {
  const orgs = await prisma.organization.findMany({ include: BUSINESS_INCLUDE, orderBy: { name: 'asc' } });
  return orgs.map(toDTO);
}

export async function create(ctx, data) {
  await ensureAvailable(data);
  const password = data.password ?? generatePassword();
  const passwordHash = await hashPassword(password);

  const org = await prisma.$transaction(async (tx) => {
    const o = await tx.organization.create({ data: { name: data.businessName } });
    const admin = await tx.user.create({
      data: {
        username: data.username, email: data.email, name: data.adminName,
        role: 'admin', orgId: o.id, createdById: ctx.userId, passwordHash,
      },
    });
    await audit(tx, {
      ctx, orgId: null, action: 'create', entity: 'organization', entityId: o.id,
      changes: { negocio: o.name, administrador: admin.username, adminId: admin.id },
    });
    return findBusiness(o.id, tx);
  });

  return {
    business: toDTO(org),
    credentials: { username: data.username, temporaryPassword: data.password ? null : password },
  };
}

export async function update(ctx, id, data) {
  const before = await findBusiness(id);
  const admin = before.users[0];

  if (data.email && admin) await ensureAvailable({ email: data.email }, admin.id);

  const after = await prisma.$transaction(async (tx) => {
    if (data.businessName !== undefined) {
      await tx.organization.update({ where: { id }, data: { name: data.businessName } });
    }
    if (admin && (data.adminName !== undefined || data.email !== undefined)) {
      await tx.user.update({ where: { id: admin.id }, data: { name: data.adminName, email: data.email } });
    }
    const updated = await findBusiness(id, tx);
    const changes = diff(flat(before), flat(updated));
    if (Object.keys(changes).length) {
      await audit(tx, { ctx, orgId: null, action: 'update', entity: 'organization', entityId: id, changes });
    }
    return updated;
  });
  return toDTO(after);
}

/** Campos comparables para la bitácora. */
const flat = (o) => ({
  negocio: o.name,
  administrador: o.users[0]?.name ?? null,
  correoAdministrador: o.users[0]?.email ?? null,
});

/**
 * Suspende o reactiva el negocio completo (administrador y operadores).
 * Al suspender se cierran todas sus sesiones: al reactivar, cada uno debe volver a iniciar sesión.
 */
export async function setStatus(ctx, id, status) {
  const org = await findBusiness(id);
  if (org.status === status) return toDTO(org);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id }, data: { status } });
    if (status === 'suspended') {
      await tx.user.updateMany({ where: { orgId: id }, data: { sessionVersion: { increment: 1 } } });
    }
    await audit(tx, {
      ctx, orgId: null, action: status === 'suspended' ? 'suspend' : 'activate',
      entity: 'organization', entityId: id, changes: { negocio: org.name },
    });
    return findBusiness(id, tx);
  });
  return toDTO(updated);
}

/** Restablece la contraseña del administrador del negocio y cierra sus sesiones. */
export async function resetAdminPassword(ctx, id, { password }) {
  const org = await findBusiness(id);
  const admin = org.users[0];
  if (!admin) throw notFound('Este negocio no tiene administrador');

  const newPassword = password ?? generatePassword();
  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: admin.id }, data: { passwordHash, sessionVersion: { increment: 1 } } }),
    audit(prisma, {
      ctx, orgId: null, action: 'password_reset', entity: 'user', entityId: admin.id,
      changes: { negocio: org.name, usuario: admin.username },
    }),
  ]);

  return { username: admin.username, temporaryPassword: password ? null : newPassword };
}
