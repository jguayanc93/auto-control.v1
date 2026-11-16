// Estadísticas de un contrato de alquiler según el calendario de cobros.
//   days        = días del contrato hasta hoy (o hasta el fin), contando ambos
//   paid        = suma de lo cobrado (días verdes y amarillos)
//   markedDays  = días del contrato ya marcados con algún color
//   pendingDays = días que ya pasaron y nadie marcó ("faltan marcar")
// Los días rojos (no se paga cuenta) NO generan deuda.
import { daysInclusive, fromDbDate, todayISO } from './dates.js';
import { fromCents } from './money.js';

/**
 * @param {{ startDate: Date, endDate: Date|null }} rental
 * @param {{ paidCents?: number, markedDays?: number }} stats
 * @param {string} [today] 'YYYY-MM-DD' (para tests)
 */
export function rentalStats(rental, { paidCents = 0, markedDays = 0 } = {}, today = todayISO()) {
  const start = fromDbDate(rental.startDate);
  const end = rental.endDate ? fromDbDate(rental.endDate) : today;
  const days = daysInclusive(start, end < today ? end : today);
  return { days, paid: fromCents(paidCents), markedDays, pendingDays: Math.max(0, days - markedDays) };
}
