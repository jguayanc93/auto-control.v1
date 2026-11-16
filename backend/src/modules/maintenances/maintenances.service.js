// Mantenimientos de los vehículos: historial + próximo servicio (por km y/o fecha) con alertas.
// Es independiente de los gastos del calendario de cobros.
// Registrar: admin y operador. Corregir y eliminar: solo admin (eliminación lógica).
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { fromDbDate, monthRange, toDbDate, todayISO } from '../../lib/dates.js';
import { fromCents, toCents } from '../../lib/money.js';
import { nextService, typeKey } from '../../lib/maintenance.js';
import { checkOrder } from './maintenances.schema.js';

const INCLUDE = {
  vehicle: { select: { id: true, plate: true, brand: true, model: true, odometer: true, status: true } },
  createdBy: { select: { name: true } },
};

const plain = (m) => ({
  doneOn: fromDbDate(m.doneOn),
  type: m.type,
  km: m.km,
  partsCost: fromCents(toCents(m.partsCost.toString())),
  laborCost: fromCents(toCents(m.laborCost.toString())),
  cost: fromCents(toCents(m.cost.toString())),
  workshop: m.workshop,
  detail: m.detail,
  nextKm: m.nextKm,
  nextDate: fromDbDate(m.nextDate),
});

/**
 * @param {boolean} superseded  hay un servicio posterior del mismo tipo en ese vehículo
 *                              (su "próximo" ya no aplica)
 */
export function maintenanceDTO(m, { superseded = false, today = todayISO() } = {}) {
  const { status: _status, ...vehicle } = m.vehicle;
  const next = nextService(m, m.vehicle.odometer, today);
  return {
    id: m.id,
    vehicleId: m.vehicleId,
    vehicle,
    ...plain(m),
    superseded,
    next: superseded && next.status !== 'sin_programar' ? { ...next, status: 'reemplazado' } : next,
    createdBy: m.createdBy?.name ?? null,
    createdAt: m.createdAt,
  };
}

const auditView = (m) => {
  const p = plain(m);
  return {
    vehiculo: m.vehicle?.plate, fecha: p.doneOn, tipo: p.type, km: p.km,
    repuestos: p.partsCost, mano_de_obra: p.laborCost, total: p.cost,
    taller: p.workshop, detalle: p.detail, proximo_km: p.nextKm, proxima_fecha: p.nextDate,
  };
};

async function findMaintenance(ctx, id) {
  const m = await prisma.maintenance.findFirst({ where: { id, orgId: ctx.orgId, deletedAt: null }, include: INCLUDE });
  if (!m) throw notFound('Mantenimiento no encontrado');
  return m;
}

/** Registros vigentes (del vehículo, si se indica), del más reciente al más antiguo. */
function allRecords(ctx, vehicleId) {
  return prisma.maintenance.findMany({
    where: { orgId: ctx.orgId, deletedAt: null, vehicleId },
    include: INCLUDE,
    orderBy: [{ doneOn: 'desc' }, { createdAt: 'desc' }],
  });
}

/** ids de los registros que son el último de su tipo en su vehículo (la lista viene ordenada). */
function latestIds(records) {
  const seen = new Set();
  const latest = new Set();
  for (const m of records) {
    const k = `${m.vehicleId}|${typeKey(m.type)}`;
    if (!seen.has(k)) {
      seen.add(k);
      latest.add(m.id);
    }
  }
  return latest;
}

export async function list(ctx, { vehicleId, month } = {}) {
  const today = todayISO();
  const records = await allRecords(ctx, vehicleId);
  const latest = latestIds(records);
  const range = month ? monthRange(month) : null;
  return records
    .filter((m) => !range || (fromDbDate(m.doneOn) >= range.first && fromDbDate(m.doneOn) <= range.last))
    .map((m) => maintenanceDTO(m, { superseded: !latest.has(m.id), today }));
}

const PRIORITY = { atrasado: 0, proximo: 1, al_dia: 2 };
/** Lo más urgente primero: por estado y luego por lo que falta (≈100 km por día). */
const urgency = (n) => Math.min(n.daysLeft ?? Infinity, n.kmLeft != null ? n.kmLeft / 100 : Infinity);

/** Próximos servicios programados: el último de cada tipo por vehículo (sin vehículos inactivos). */
export async function upcoming(ctx, { vehicleId } = {}) {
  const today = todayISO();
  const records = await allRecords(ctx, vehicleId);
  const latest = latestIds(records);
  return records
    .filter((m) => latest.has(m.id) && m.vehicle.status !== 'inactivo' && (m.nextKm != null || m.nextDate))
    .map((m) => maintenanceDTO(m, { today }))
    .sort((a, b) => PRIORITY[a.next.status] - PRIORITY[b.next.status] || urgency(a.next) - urgency(b.next));
}

/** Conteo para alertas (Inicio). */
export async function alerts(ctx) {
  const items = (await upcoming(ctx)).filter((m) => m.next.status === 'atrasado' || m.next.status === 'proximo');
  return {
    overdue: items.filter((m) => m.next.status === 'atrasado').length,
    soon: items.filter((m) => m.next.status === 'proximo').length,
    items,
  };
}

export async function get(ctx, id) {
  const m = await findMaintenance(ctx, id);
  const sameVehicle = await allRecords(ctx, m.vehicleId);
  return maintenanceDTO(m, { superseded: !latestIds(sameVehicle).has(id) });
}

/** Total = repuestos + mano de obra (en céntimos, sin errores de redondeo). */
const total = (parts, labor) => fromCents(toCents(String(parts ?? 0)) + toCents(String(labor ?? 0)));

/** Si el servicio registra más km que el actual del vehículo, lo actualiza (nunca lo baja). */
async function raiseOdometer(tx, ctx, vehicle, km) {
  if (km == null || (vehicle.odometer != null && km <= vehicle.odometer)) return;
  await tx.vehicle.update({ where: { id: vehicle.id }, data: { odometer: km } });
  await audit(tx, {
    ctx, action: 'update', entity: 'vehicle', entityId: vehicle.id,
    changes: { odometer: { antes: vehicle.odometer, despues: km } },
  });
}

export async function create(ctx, data) {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: data.vehicleId, orgId: ctx.orgId }, select: { id: true, odometer: true } });
  if (!vehicle) throw notFound('Vehículo no encontrado');

  const id = await prisma.$transaction(async (tx) => {
    const m = await tx.maintenance.create({
      data: {
        ...data,
        cost: total(data.partsCost, data.laborCost),
        doneOn: toDbDate(data.doneOn),
        nextDate: data.nextDate ? toDbDate(data.nextDate) : null,
        orgId: ctx.orgId,
        createdById: ctx.userId,
      },
      include: INCLUDE,
    });
    await audit(tx, { ctx, action: 'create', entity: 'maintenance', entityId: m.id, changes: auditView(m) });
    await raiseOdometer(tx, ctx, vehicle, data.km);
    return m.id;
  });
  return get(ctx, id);
}

export async function update(ctx, id, data) {
  const before = await findMaintenance(ctx, id);
  const given = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const errors = checkOrder({ ...plain(before), ...given });
  if (Object.keys(errors).length) throw badRequest(Object.values(errors)[0], { fields: errors });

  await prisma.$transaction(async (tx) => {
    const after = await tx.maintenance.update({
      where: { id },
      data: {
        ...data,
        cost: total(given.partsCost ?? before.partsCost, given.laborCost ?? before.laborCost),
        doneOn: data.doneOn ? toDbDate(data.doneOn) : undefined,
        nextDate: data.nextDate === undefined ? undefined : data.nextDate ? toDbDate(data.nextDate) : null,
      },
      include: INCLUDE,
    });
    const changes = diff(auditView(before), auditView(after));
    if (Object.keys(changes).length) await audit(tx, { ctx, action: 'update', entity: 'maintenance', entityId: id, changes });
    await raiseOdometer(tx, ctx, before.vehicle, data.km);
  });
  return get(ctx, id);
}

/** Eliminación lógica: deja de verse; el historial se conserva en la bitácora. */
export async function remove(ctx, id) {
  const m = await findMaintenance(ctx, id);
  await prisma.$transaction([
    prisma.maintenance.update({ where: { id }, data: { deletedAt: new Date() } }),
    audit(prisma, { ctx, action: 'delete', entity: 'maintenance', entityId: id, changes: auditView(m) }),
  ]);
}
