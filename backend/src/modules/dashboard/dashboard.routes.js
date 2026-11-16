// /api/dashboard — indicadores de Inicio (admin y operador).
//   flota por estado · cobrado hoy · resumen del mes · días sin marcar · alertas de documentos y mantenimiento
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { BUSINESS, requireRole } from '../../middleware/requireRole.js';
import { prisma } from '../../lib/prisma.js';
import { addDays, fromDbDate, toDbDate, todayISO } from '../../lib/dates.js';
import { fromCents, toCents } from '../../lib/money.js';
import * as vehicles from '../vehicles/vehicles.service.js';
import * as daily from '../daily/daily.service.js';
import * as documents from '../documents/documents.service.js';
import * as maintenances from '../maintenances/maintenances.service.js';

const router = Router();
router.use(requireAuth, requireRole(...BUSINESS));

router.get('/', async (req, res) => {
  const ctx = req.ctx;
  const today = todayISO();
  const weekStart = addDays(today, -6);

  const [fleet, month, docs, maint, week] = await Promise.all([
    vehicles.list(ctx),
    daily.overview(ctx, today.slice(0, 7)),
    documents.alerts(ctx),
    maintenances.alerts(ctx),
    prisma.dailyRecord.groupBy({
      by: ['date'],
      where: { orgId: ctx.orgId, date: { gte: toDbDate(weekStart), lte: toDbDate(today) } },
      _sum: { amount: true },
    }),
  ]);

  const byStatus = (s) => fleet.filter((v) => v.status === s).length;
  const rented = fleet.filter((v) => v.activeRental);
  const incomeByDay = new Map(week.map((w) => [fromDbDate(w.date), toCents(w._sum.amount?.toString() ?? '0')]));

  res.json({
    today,
    fleet: {
      total: fleet.filter((v) => v.status !== 'inactivo').length,
      alquilado: byStatus('alquilado'),
      disponible: byStatus('disponible'),
      taller: byStatus('taller'),
      inactivo: byStatus('inactivo'),
    },
    todayIncome: fromCents(incomeByDay.get(today) ?? 0),
    /** Cobro de los últimos 7 días (para el gráfico) */
    week: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      return { date, income: fromCents(incomeByDay.get(date) ?? 0) };
    }),
    month: { month: month.month, ...month.totals },
    /** Vehículos alquilados con días de contrato sin marcar (todo el contrato, no solo este mes) */
    pending: rented
      .filter((v) => v.activeRental.pendingDays > 0)
      .map((v) => ({ id: v.id, plate: v.plate, renter: v.activeRental.renter.fullName, pendingDays: v.activeRental.pendingDays }))
      .sort((a, b) => b.pendingDays - a.pendingDays),
    documents: {
      expired: docs.expired,
      expiring: docs.expiring,
      items: docs.items.map((d) => ({ id: d.id, type: d.type, plate: d.vehicle.plate, vehicleId: d.vehicleId, status: d.status, daysToExpire: d.daysToExpire })),
    },
    maintenance: {
      overdue: maint.overdue,
      soon: maint.soon,
      items: maint.items.map((m) => ({ id: m.id, type: m.type, plate: m.vehicle.plate, vehicleId: m.vehicleId, next: m.next })),
    },
  });
});

export default router;
