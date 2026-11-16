// Calendario de cobros: un registro por vehículo y día.
//   🟢 pagado  → tarifa del contrato (ajustable)
//   🟡 medio   → mitad de la tarifa (ajustable)
//   🔴 no_pago → S/ 0, no genera deuda
//   🟣 fuera_servicio → sin monto; se puede marcar aunque no haya contrato y en días futuros
// Marcar un día: admin y operador. Cambiar o borrar una marca: solo admin.
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { addDays, fromDbDate, monthRange, toDbDate, todayISO } from '../../lib/dates.js';
import { fromCents, toCents } from '../../lib/money.js';
import { monthSummary } from '../../lib/calendar.js';
import { expenseDTO } from '../expenses/expenses.service.js';

const MAX_FUTURE_DAYS = 90;
const PAID = ['pagado', 'medio'];

export const STATUS_LABEL = { pagado: 'Pagó', medio: 'Media cuenta', no_pago: 'No se paga cuenta', fuera_servicio: 'Fuera de servicio' };

async function findVehicle(ctx, id) {
  const v = await prisma.vehicle.findFirst({
    where: { id, orgId: ctx.orgId },
    select: { id: true, plate: true, brand: true, model: true, status: true },
  });
  if (!v) throw notFound('Vehículo no encontrado');
  return v;
}

/** Contrato vigente de un vehículo en una fecha. */
function rentalOn(vehicleId, date, db = prisma) {
  const d = toDbDate(date);
  return db.rental.findFirst({
    where: { vehicleId, startDate: { lte: d }, OR: [{ endDate: null }, { endDate: { gte: d } }] },
    select: { id: true, dailyRate: true },
  });
}

/** Valida la marca y calcula contrato, monto y método. */
function resolve({ status, amount, method }, rental, date) {
  const today = todayISO();
  if (status === 'fuera_servicio') {
    if (date > addDays(today, MAX_FUTURE_DAYS)) {
      throw badRequest(`Solo puedes programar hasta ${MAX_FUTURE_DAYS} días adelante`, { fields: { date: 'Fecha muy lejana' } });
    }
  } else {
    if (date > today) throw badRequest('No puedes registrar cobros de días futuros', { fields: { date: 'Fecha futura' } });
    if (!rental) {
      throw badRequest('Ese día el vehículo no tenía contrato de alquiler. Solo puedes marcarlo como "Fuera de servicio".', {
        fields: { status: 'Sin contrato ese día' },
      });
    }
  }

  let cents = 0;
  if (PAID.includes(status)) {
    const rate = toCents(rental.dailyRate.toString());
    cents = amount !== undefined ? toCents(amount) : status === 'pagado' ? rate : Math.round(rate / 2);
    if (cents <= 0) throw badRequest('El monto debe ser mayor a 0', { fields: { amount: 'Debe ser mayor a 0' } });
  }
  return {
    rentalId: rental?.id ?? null,
    amount: fromCents(cents),
    method: PAID.includes(status) ? method ?? 'efectivo' : null,
  };
}

const INCLUDE = { createdBy: { select: { name: true } }, vehicle: { select: { plate: true } } };

export function recordDTO(r) {
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    rentalId: r.rentalId,
    date: fromDbDate(r.date),
    status: r.status,
    amount: fromCents(toCents(r.amount.toString())),
    method: r.method,
    note: r.note,
    createdBy: r.createdBy?.name ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Vista legible para la bitácora. */
const auditView = (r) => ({
  vehiculo: r.vehicle?.plate,
  fecha: fromDbDate(r.date),
  estado: STATUS_LABEL[r.status],
  monto: fromCents(toCents(r.amount.toString())),
  metodo: r.method,
  nota: r.note,
});

export async function create(ctx, data) {
  const vehicle = await findVehicle(ctx, data.vehicleId);
  const rental = await rentalOn(vehicle.id, data.date);
  const resolved = resolve(data, rental, data.date);

  const existing = await prisma.dailyRecord.findUnique({
    where: { vehicleId_date: { vehicleId: vehicle.id, date: toDbDate(data.date) } },
    select: { status: true },
  });
  if (existing) throw conflict(`Ese día ya está marcado como "${STATUS_LABEL[existing.status]}". Solo el administrador puede cambiarlo.`);

  return prisma.$transaction(async (tx) => {
    const r = await tx.dailyRecord.create({
      data: {
        orgId: ctx.orgId, vehicleId: vehicle.id, date: toDbDate(data.date), status: data.status,
        note: data.note, createdById: ctx.userId, ...resolved,
      },
      include: INCLUDE,
    });
    await audit(tx, { ctx, action: 'create', entity: 'daily_record', entityId: r.id, changes: auditView(r) });
    return recordDTO(r);
  });
}

async function findRecord(ctx, id) {
  const r = await prisma.dailyRecord.findFirst({ where: { id, orgId: ctx.orgId }, include: INCLUDE });
  if (!r) throw notFound('Registro no encontrado');
  return r;
}

/** Solo admin: cambia el color, el monto, el método o la nota. */
export async function update(ctx, id, data) {
  const before = await findRecord(ctx, id);
  const date = fromDbDate(before.date);
  const status = data.status ?? before.status;
  const statusChanged = status !== before.status;
  // Si cambia el color se recalcula el monto (salvo que se envíe uno); si no, se conserva.
  const amount = data.amount ?? (!statusChanged && PAID.includes(status) ? before.amount.toString() : undefined);
  const method = data.method ?? before.method ?? undefined;
  const resolved = resolve({ status, amount, method }, await rentalOn(before.vehicleId, date), date);

  return prisma.$transaction(async (tx) => {
    const after = await tx.dailyRecord.update({
      where: { id },
      data: { status, note: data.note, ...resolved },
      include: INCLUDE,
    });
    const changes = diff(auditView(before), auditView(after));
    if (Object.keys(changes).length) await audit(tx, { ctx, action: 'update', entity: 'daily_record', entityId: id, changes });
    return recordDTO(after);
  });
}

/** Solo admin: deja el día sin marcar. */
export async function remove(ctx, id) {
  const r = await findRecord(ctx, id);
  await prisma.$transaction([
    prisma.dailyRecord.delete({ where: { id } }),
    audit(prisma, { ctx, action: 'delete', entity: 'daily_record', entityId: id, changes: auditView(r) }),
  ]);
}

// ───────────── Consultas ─────────────

const currentMonth = () => todayISO().slice(0, 7);

/** Contratos que se cruzan con el mes. */
function rentalsInMonth(where, first, last) {
  return prisma.rental.findMany({
    where: { ...where, startDate: { lte: toDbDate(last) }, OR: [{ endDate: null }, { endDate: { gte: toDbDate(first) } }] },
    include: { renter: { select: { id: true, fullName: true, phone: true } } },
    orderBy: { startDate: 'asc' },
  });
}

const between = (first, last) => ({ gte: toDbDate(first), lte: toDbDate(last) });

/** Ventana del vehículo: calendario del mes, contratos, gastos y resumen. */
export async function calendar(ctx, vehicleId, month = currentMonth()) {
  const vehicle = await findVehicle(ctx, vehicleId);
  const { first, last } = monthRange(month);
  const [rentals, records, expenses, maintenances] = await Promise.all([
    rentalsInMonth({ vehicleId }, first, last),
    prisma.dailyRecord.findMany({ where: { vehicleId, date: between(first, last) }, include: INCLUDE, orderBy: { date: 'asc' } }),
    prisma.expense.findMany({ where: { vehicleId, date: between(first, last) }, include: INCLUDE, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
    prisma.maintenance.findMany({
      where: { vehicleId, deletedAt: null, doneOn: between(first, last) },
      select: { id: true, doneOn: true, type: true, workshop: true, partsCost: true, laborCost: true, cost: true },
      orderBy: [{ doneOn: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);
  const today = todayISO();
  const { pending, ...summary } = monthSummary({ records, expenses, maintenances, rentals, month, today });
  const soles = (d) => fromCents(toCents(d.toString()));

  return {
    vehicle,
    month,
    today,
    rentals: rentals.map((r) => ({
      id: r.id, status: r.status, renter: r.renter,
      dailyRate: fromCents(toCents(r.dailyRate.toString())),
      startDate: fromDbDate(r.startDate), endDate: fromDbDate(r.endDate),
    })),
    records: records.map(recordDTO),
    expenses: expenses.map(expenseDTO),
    /** Mantenimientos del mes: se registran en el módulo Mantenimiento y aquí cuentan como gasto. */
    maintenances: maintenances.map((m) => ({
      id: m.id, date: fromDbDate(m.doneOn), type: m.type, workshop: m.workshop,
      partsCost: soles(m.partsCost), laborCost: soles(m.laborCost), cost: soles(m.cost),
    })),
    summary: { ...summary, pendingDates: pending.map((p) => p.date) },
  };
}

/** Resumen del mes de toda la flota (lista de la pantalla Pagos). */
export async function overview(ctx, month = currentMonth()) {
  const { first, last } = monthRange(month);
  const where = { orgId: ctx.orgId };
  const [vehicles, rentals, records, expenses, maintenances] = await Promise.all([
    prisma.vehicle.findMany({ where, select: { id: true, plate: true, brand: true, model: true, status: true }, orderBy: { plate: 'asc' } }),
    rentalsInMonth(where, first, last),
    prisma.dailyRecord.findMany({ where: { ...where, date: between(first, last) }, select: { vehicleId: true, date: true, status: true, amount: true } }),
    prisma.expense.findMany({ where: { ...where, date: between(first, last) }, select: { vehicleId: true, amount: true } }),
    prisma.maintenance.findMany({ where: { ...where, deletedAt: null, doneOn: between(first, last) }, select: { vehicleId: true, cost: true } }),
  ]);
  const today = todayISO();
  const strip = ({ pending, ...s }) => s;
  const of = (id) => (x) => x.vehicleId === id;

  const items = vehicles.map((v) => {
    const active = rentals.find((r) => r.vehicleId === v.id && r.status === 'activo');
    return {
      ...v,
      activeRental: active ? { id: active.id, renter: active.renter, dailyRate: fromCents(toCents(active.dailyRate.toString())) } : null,
      summary: strip(monthSummary({
        records: records.filter(of(v.id)), expenses: expenses.filter(of(v.id)), maintenances: maintenances.filter(of(v.id)),
        rentals: rentals.filter(of(v.id)), month, today,
      })),
    };
  });

  return { month, today, items, totals: strip(monthSummary({ records, expenses, maintenances, rentals, month, today })) };
}
