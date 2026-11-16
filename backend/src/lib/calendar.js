// Resumen mensual del calendario de un vehículo (o de toda la flota).
import { eachDay, fromDbDate, monthRange } from './dates.js';
import { fromCents, toCents } from './money.js';

export const DAY_STATUSES = ['pagado', 'medio', 'no_pago', 'fuera_servicio'];

/**
 * Días de contrato (dentro del mes y hasta hoy) que nadie marcó.
 * @param {Array<{vehicleId:string,startDate:Date,endDate:Date|null}>} rentals
 * @param {Set<string>} marked  claves `${vehicleId}|${YYYY-MM-DD}` ya marcadas
 */
export function pendingDates(rentals, marked, month, today) {
  const { first, last } = monthRange(month);
  const out = [];
  for (const r of rentals) {
    const from = [fromDbDate(r.startDate), first].sort().at(-1);
    const to = [r.endDate ? fromDbDate(r.endDate) : today, last, today].sort()[0];
    for (const d of from <= to ? eachDay(from, to) : []) {
      if (!marked.has(`${r.vehicleId}|${d}`)) out.push({ vehicleId: r.vehicleId, date: d });
    }
  }
  return out;
}

/**
 * Total ingreso = ingresos − gastos (otros gastos del calendario + mantenimientos).
 * @param {{ records: Array<{vehicleId,date,status,amount}>, expenses: Array<{amount}>, maintenances?: Array<{cost}>,
 *           rentals: Array, month: string, today: string }} p
 */
export function monthSummary({ records, expenses, maintenances = [], rentals, month, today }) {
  const counts = Object.fromEntries(DAY_STATUSES.map((s) => [s, 0]));
  let incomeCents = 0;
  for (const r of records) {
    counts[r.status] += 1;
    incomeCents += toCents(r.amount.toString());
  }
  const otherCents = expenses.reduce((s, e) => s + toCents(e.amount.toString()), 0);
  const maintenanceCents = maintenances.reduce((s, m) => s + toCents(m.cost.toString()), 0);
  const expenseCents = otherCents + maintenanceCents;
  const marked = new Set(records.map((r) => `${r.vehicleId}|${fromDbDate(r.date)}`));
  const pending = pendingDates(rentals, marked, month, today);
  return {
    income: fromCents(incomeCents),
    /** Todos los gastos (otros + mantenimiento) */
    expenses: fromCents(expenseCents),
    otherExpenses: fromCents(otherCents),
    maintenance: fromCents(maintenanceCents),
    net: fromCents(incomeCents - expenseCents),
    counts,
    pendingDays: pending.length,
    pending,
  };
}
