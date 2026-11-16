// Vehículos del negocio. Todo se filtra por ctx.orgId.
import { prisma } from '../../lib/prisma.js';
import { audit, diff, snapshot } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { RENTAL_INCLUDE, rentalsWithStats } from '../rentals/rentals.dto.js';

async function findVehicle(ctx, id, db = prisma) {
  const v = await db.vehicle.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!v) throw notFound('Vehículo no encontrado');
  return v;
}

async function ensurePlateFree(ctx, plate, exceptId) {
  const v = await prisma.vehicle.findUnique({ where: { orgId_plate: { orgId: ctx.orgId, plate } }, select: { id: true } });
  if (v && v.id !== exceptId) throw conflict('Ya tienes un vehículo con esa placa', { fields: { plate: 'Ya tienes un vehículo con esa placa' } });
}

const counts = { select: { rentals: true, dailyRecords: true, expenses: true, documents: true, maintenances: true } };

/** Lista con el contrato activo (y su saldo) de cada vehículo. */
export async function list(ctx, { q, status } = {}) {
  const term = q?.replace(/[\s-]/g, '');
  const vehicles = await prisma.vehicle.findMany({
    where: {
      orgId: ctx.orgId,
      status,
      ...(q && {
        OR: [
          { plate: { contains: term.toUpperCase() } },
          { brand: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
        ],
      }),
    },
    include: { rentals: { where: { status: 'activo' }, include: RENTAL_INCLUDE, take: 1 } },
    orderBy: { plate: 'asc' },
  });
  const active = await rentalsWithStats(vehicles.flatMap((v) => v.rentals));
  const byVehicle = new Map(active.map((r) => [r.vehicleId, r]));
  return vehicles.map(({ rentals, ...v }) => ({ ...v, activeRental: byVehicle.get(v.id) ?? null }));
}

/** Detalle con historial de contratos. */
export async function get(ctx, id) {
  const v = await prisma.vehicle.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      rentals: { include: RENTAL_INCLUDE, orderBy: [{ status: 'asc' }, { startDate: 'desc' }] },
      _count: counts,
    },
  });
  if (!v) throw notFound('Vehículo no encontrado');
  const { rentals, _count, ...vehicle } = v;
  const history = await rentalsWithStats(rentals);
  return {
    ...vehicle,
    activeRental: history.find((r) => r.status === 'activo') ?? null,
    rentals: history,
    counts: _count,
  };
}

export async function create(ctx, data) {
  await ensurePlateFree(ctx, data.plate);
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.create({ data: { ...data, orgId: ctx.orgId, createdById: ctx.userId } });
    await audit(tx, { ctx, action: 'create', entity: 'vehicle', entityId: v.id, changes: snapshot(v) });
    return { ...v, activeRental: null };
  });
}

export async function update(ctx, id, data) {
  const before = await findVehicle(ctx, id);
  if (data.plate && data.plate !== before.plate) await ensurePlateFree(ctx, data.plate, id);
  if (data.status && data.status !== before.status && before.status === 'alquilado') {
    throw badRequest('El vehículo tiene un contrato activo. Finalízalo antes de cambiar su estado.', {
      fields: { status: 'Finaliza el contrato activo primero' },
    });
  }

  return prisma.$transaction(async (tx) => {
    const after = await tx.vehicle.update({ where: { id }, data });
    const changes = diff(before, after);
    if (Object.keys(changes).length) await audit(tx, { ctx, action: 'update', entity: 'vehicle', entityId: id, changes });
    return after;
  });
}

/** Solo se elimina si no tiene historial; si lo tiene, debe marcarse como inactivo. */
export async function remove(ctx, id) {
  const v = await prisma.vehicle.findFirst({ where: { id, orgId: ctx.orgId }, include: { _count: counts } });
  if (!v) throw notFound('Vehículo no encontrado');
  const { _count, ...vehicle } = v;
  if (Object.values(_count).some((n) => n > 0)) {
    throw conflict('Este vehículo tiene historial (contratos, cobros, gastos, documentos o mantenimientos). En lugar de eliminarlo, cámbialo a "Inactivo".');
  }
  await prisma.$transaction([
    prisma.vehicle.delete({ where: { id } }),
    audit(prisma, { ctx, action: 'delete', entity: 'vehicle', entityId: id, changes: snapshot(vehicle) }),
  ]);
}
