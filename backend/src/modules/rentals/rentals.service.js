// Contratos de alquiler: vehículo + conductor + tarifa diaria + fechas.
// Regla: un vehículo tiene como máximo UN contrato activo.
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { fromDbDate, toDbDate } from '../../lib/dates.js';
import { create as createRenter, findRenter } from '../renters/renters.service.js';
import { RENTAL_INCLUDE, rentalDTO, rentalsWithStats, statsByRental } from './rentals.dto.js';

async function findRental(ctx, id, db = prisma) {
  const r = await db.rental.findFirst({ where: { id, orgId: ctx.orgId }, include: RENTAL_INCLUDE });
  if (!r) throw notFound('Contrato no encontrado');
  return r;
}

async function withStats(rental, db = prisma) {
  const stats = await statsByRental([rental.id], db);
  return rentalDTO(rental, stats.get(rental.id));
}

/** Datos legibles para la bitácora. */
const auditView = (r) => ({
  vehiculo: r.vehicle?.plate,
  conductor: r.renter?.fullName,
  tarifaDiaria: r.dailyRate?.toString(),
  inicio: fromDbDate(r.startDate),
  fin: fromDbDate(r.endDate),
  estado: r.status,
  notas: r.notes ?? null,
});

export async function list(ctx, { status, vehicleId, renterId } = {}) {
  const rentals = await prisma.rental.findMany({
    where: { orgId: ctx.orgId, status, vehicleId, renterId },
    include: RENTAL_INCLUDE,
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
  });
  return rentalsWithStats(rentals);
}

export async function get(ctx, id) {
  return withStats(await findRental(ctx, id));
}

export async function create(ctx, data) {
  return prisma.$transaction(async (tx) => {
    // Bloquea la fila del vehículo: si dos personas inician un contrato a la vez, la segunda espera
    // y luego ve el contrato activo de la primera (evita dos contratos activos).
    const locked = await tx.$queryRaw`
      SELECT id FROM vehicles WHERE id = ${data.vehicleId}::uuid AND org_id = ${ctx.orgId}::uuid FOR UPDATE`;
    if (!locked.length) throw notFound('Vehículo no encontrado');

    const vehicle = await tx.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (vehicle.status === 'inactivo') throw badRequest('El vehículo está inactivo. Cámbialo a "Disponible" para alquilarlo.');

    const active = await tx.rental.findFirst({ where: { vehicleId: vehicle.id, status: 'activo' }, include: { renter: true } });
    if (active) {
      throw conflict(`Este vehículo ya tiene un contrato activo con ${active.renter.fullName}. Finalízalo antes de iniciar otro.`);
    }

    const renter = data.renterId ? await findRenter(ctx, data.renterId, tx) : await createRenter(ctx, data.newRenter, tx);

    const rental = await tx.rental.create({
      data: {
        orgId: ctx.orgId, vehicleId: vehicle.id, renterId: renter.id, createdById: ctx.userId,
        dailyRate: data.dailyRate, startDate: toDbDate(data.startDate), notes: data.notes,
      },
      include: RENTAL_INCLUDE,
    });
    await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: 'alquilado' } });
    await audit(tx, { ctx, action: 'create', entity: 'rental', entityId: rental.id, changes: auditView(rental) });
    return withStats(rental, tx);
  });
}

/** Correcciones del administrador (tarifa, fecha de inicio, notas). */
export async function update(ctx, id, data) {
  const before = await findRental(ctx, id);
  if (data.startDate && before.endDate && data.startDate > fromDbDate(before.endDate)) {
    throw badRequest('La fecha de inicio no puede ser posterior a la de fin', { fields: { startDate: 'Debe ser anterior a la fecha de fin' } });
  }
  if (data.startDate) {
    const first = await prisma.dailyRecord.findFirst({ where: { rentalId: id }, orderBy: { date: 'asc' }, select: { date: true } });
    if (first && data.startDate > fromDbDate(first.date)) {
      throw badRequest('Hay días marcados antes de esa fecha', { fields: { startDate: `Ya hay días marcados desde el ${fromDbDate(first.date)}` } });
    }
  }
  return prisma.$transaction(async (tx) => {
    const after = await tx.rental.update({
      where: { id },
      data: { dailyRate: data.dailyRate, startDate: data.startDate ? toDbDate(data.startDate) : undefined, notes: data.notes },
      include: RENTAL_INCLUDE,
    });
    const changes = diff(auditView(before), auditView(after));
    if (Object.keys(changes).length) await audit(tx, { ctx, action: 'update', entity: 'rental', entityId: id, changes });
    return withStats(after, tx);
  });
}

/** Finaliza el contrato: el vehículo vuelve a "disponible". */
export async function finish(ctx, id, { endDate }) {
  const rental = await findRental(ctx, id);
  if (rental.status !== 'activo') throw badRequest('Este contrato ya está finalizado');
  if (endDate < fromDbDate(rental.startDate)) {
    throw badRequest('La fecha de fin no puede ser anterior al inicio', { fields: { endDate: `Debe ser desde ${fromDbDate(rental.startDate)}` } });
  }
  const last = await prisma.dailyRecord.findFirst({ where: { rentalId: id }, orderBy: { date: 'desc' }, select: { date: true } });
  if (last && endDate < fromDbDate(last.date)) {
    throw badRequest('Hay días marcados después de esa fecha', { fields: { endDate: `Ya hay días marcados hasta el ${fromDbDate(last.date)}` } });
  }

  return prisma.$transaction(async (tx) => {
    const after = await tx.rental.update({
      where: { id },
      data: { status: 'finalizado', endDate: toDbDate(endDate) },
      include: RENTAL_INCLUDE,
    });
    await tx.vehicle.update({ where: { id: rental.vehicleId }, data: { status: 'disponible' } });
    await audit(tx, { ctx, action: 'update', entity: 'rental', entityId: id, changes: diff(auditView(rental), auditView(after)) });
    return withStats(after, tx);
  });
}

/** Solo si no tiene días marcados en el calendario (contrato registrado por error). */
export async function remove(ctx, id) {
  const rental = await findRental(ctx, id);
  const marked = await prisma.dailyRecord.count({ where: { rentalId: id } });
  if (marked > 0) throw conflict('Este contrato ya tiene días marcados en el calendario y no se puede eliminar. Puedes finalizarlo.');

  await prisma.$transaction(async (tx) => {
    await tx.rental.delete({ where: { id } });
    if (rental.status === 'activo') await tx.vehicle.update({ where: { id: rental.vehicleId }, data: { status: 'disponible' } });
    await audit(tx, { ctx, action: 'delete', entity: 'rental', entityId: id, changes: auditView(rental) });
  });
}
