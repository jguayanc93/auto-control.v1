// Gastos por vehículo (mantenimiento, servicio, accesorio, otro).
// Registrar: admin y operador. Corregir y eliminar: solo admin.
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { notFound } from '../../lib/errors.js';
import { fromDbDate, monthRange, toDbDate } from '../../lib/dates.js';
import { fromCents, toCents } from '../../lib/money.js';

const INCLUDE = { createdBy: { select: { name: true } }, vehicle: { select: { plate: true } } };

export function expenseDTO(e) {
  return {
    id: e.id,
    vehicleId: e.vehicleId,
    plate: e.vehicle?.plate,
    date: fromDbDate(e.date),
    category: e.category,
    amount: fromCents(toCents(e.amount.toString())),
    description: e.description,
    createdBy: e.createdBy?.name ?? null,
    createdAt: e.createdAt,
  };
}

const auditView = (e) => ({
  vehiculo: e.vehicle?.plate,
  fecha: fromDbDate(e.date),
  tipo: e.category,
  monto: fromCents(toCents(e.amount.toString())),
  descripcion: e.description,
});

async function findExpense(ctx, id) {
  const e = await prisma.expense.findFirst({ where: { id, orgId: ctx.orgId }, include: INCLUDE });
  if (!e) throw notFound('Gasto no encontrado');
  return e;
}

export async function list(ctx, { vehicleId, month } = {}) {
  const range = month ? monthRange(month) : null;
  const rows = await prisma.expense.findMany({
    where: { orgId: ctx.orgId, vehicleId, ...(range && { date: { gte: toDbDate(range.first), lte: toDbDate(range.last) } }) },
    include: INCLUDE,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(expenseDTO);
}

export async function create(ctx, data) {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: data.vehicleId, orgId: ctx.orgId }, select: { id: true } });
  if (!vehicle) throw notFound('Vehículo no encontrado');
  return prisma.$transaction(async (tx) => {
    const e = await tx.expense.create({
      data: { ...data, date: toDbDate(data.date), orgId: ctx.orgId, createdById: ctx.userId },
      include: INCLUDE,
    });
    await audit(tx, { ctx, action: 'create', entity: 'expense', entityId: e.id, changes: auditView(e) });
    return expenseDTO(e);
  });
}

export async function update(ctx, id, data) {
  const before = await findExpense(ctx, id);
  return prisma.$transaction(async (tx) => {
    const after = await tx.expense.update({
      where: { id },
      data: { ...data, date: data.date ? toDbDate(data.date) : undefined },
      include: INCLUDE,
    });
    const changes = diff(auditView(before), auditView(after));
    if (Object.keys(changes).length) await audit(tx, { ctx, action: 'update', entity: 'expense', entityId: id, changes });
    return expenseDTO(after);
  });
}

export async function remove(ctx, id) {
  const e = await findExpense(ctx, id);
  await prisma.$transaction([
    prisma.expense.delete({ where: { id } }),
    audit(prisma, { ctx, action: 'delete', entity: 'expense', entityId: id, changes: auditView(e) }),
  ]);
}
