// Conductores / arrendatarios del negocio. Todo se filtra por ctx.orgId.
import { prisma } from '../../lib/prisma.js';
import { audit, diff, snapshot } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/errors.js';
import { RENTAL_INCLUDE, rentalsWithStats } from '../rentals/rentals.dto.js';

export async function findRenter(ctx, id, db = prisma) {
  const r = await db.renter.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!r) throw notFound('Conductor no encontrado');
  return r;
}

/** Lista con sus contratos activos (vehículo y saldo). */
export async function list(ctx, { q } = {}) {
  const renters = await prisma.renter.findMany({
    where: {
      orgId: ctx.orgId,
      ...(q && {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { docNumber: { contains: q } },
          { phone: { contains: q.replace(/\s/g, '') } },
        ],
      }),
    },
    include: { rentals: { where: { status: 'activo' }, include: RENTAL_INCLUDE }, _count: { select: { rentals: true } } },
    orderBy: { fullName: 'asc' },
  });
  const active = await rentalsWithStats(renters.flatMap((r) => r.rentals));
  return renters.map(({ rentals, _count, ...r }) => ({
    ...r,
    activeRentals: active.filter((a) => a.renterId === r.id),
    rentalCount: _count.rentals,
  }));
}

export async function get(ctx, id) {
  const r = await prisma.renter.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { rentals: { include: RENTAL_INCLUDE, orderBy: [{ status: 'asc' }, { startDate: 'desc' }] } },
  });
  if (!r) throw notFound('Conductor no encontrado');
  const { rentals, ...renter } = r;
  return { ...renter, rentals: await rentalsWithStats(rentals) };
}

/** Crea un conductor. Acepta una transacción para usarse al iniciar un contrato. */
export async function create(ctx, data, db = null) {
  const run = async (tx) => {
    const r = await tx.renter.create({ data: { ...data, orgId: ctx.orgId, createdById: ctx.userId } });
    await audit(tx, { ctx, action: 'create', entity: 'renter', entityId: r.id, changes: snapshot(r) });
    return r;
  };
  return db ? run(db) : prisma.$transaction(run);
}

export async function update(ctx, id, data) {
  const before = await findRenter(ctx, id);
  return prisma.$transaction(async (tx) => {
    const after = await tx.renter.update({ where: { id }, data });
    const changes = diff(before, after);
    if (Object.keys(changes).length) await audit(tx, { ctx, action: 'update', entity: 'renter', entityId: id, changes });
    return after;
  });
}

/** Solo se elimina si nunca tuvo contratos. */
export async function remove(ctx, id) {
  const r = await prisma.renter.findFirst({ where: { id, orgId: ctx.orgId }, include: { _count: { select: { rentals: true } } } });
  if (!r) throw notFound('Conductor no encontrado');
  const { _count, ...renter } = r;
  if (_count.rentals > 0) throw conflict('Este conductor tiene contratos registrados y no se puede eliminar.');
  await prisma.$transaction([
    prisma.renter.delete({ where: { id } }),
    audit(prisma, { ctx, action: 'delete', entity: 'renter', entityId: id, changes: snapshot(renter) }),
  ]);
}
