// Mantenimiento: estado del próximo servicio (por fecha y/o kilometraje).
import { fromDbDate, todayISO } from './dates.js';

/** Avisar "próximo" con esta anticipación. */
export const SOON_DAYS = 15;
export const SOON_KM = 1000;

/** Clave para comparar tipos de servicio ("Cambio de aceite" = "cambio de ACEITE "). */
export const typeKey = (type) =>
  String(type ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Estado del próximo servicio programado.
 *   atrasado      → pasó la fecha o se alcanzó el km
 *   proximo       → faltan ≤ 15 días o ≤ 1 000 km
 *   al_dia        → programado y lejos
 *   sin_programar → no tiene próximo km ni fecha
 * @param {{ nextKm?: number|null, nextDate?: Date|string|null }} m
 * @param {number|null} odometer  kilometraje actual del vehículo
 */
export function nextService({ nextKm, nextDate }, odometer, today = todayISO()) {
  const date = nextDate instanceof Date ? fromDbDate(nextDate) : (nextDate ?? null);
  const daysLeft = date ? daysBetween(today, date) : null;
  const kmLeft = nextKm != null && odometer != null ? nextKm - odometer : null;

  let status = 'sin_programar';
  if (nextKm != null || date) {
    if ((daysLeft != null && daysLeft < 0) || (kmLeft != null && kmLeft <= 0)) status = 'atrasado';
    else if ((daysLeft != null && daysLeft <= SOON_DAYS) || (kmLeft != null && kmLeft <= SOON_KM)) status = 'proximo';
    else status = 'al_dia';
  }
  return { status, nextKm: nextKm ?? null, nextDate: date, daysLeft, kmLeft };
}
