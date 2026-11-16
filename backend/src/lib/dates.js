// Fechas de negocio: siempre en hora de Lima y como texto 'YYYY-MM-DD'.
// En la BD se guardan como DATE; Prisma las entrega como Date a medianoche UTC.

export const TIMEZONE = 'America/Lima';
const DAY_MS = 86_400_000;

const limaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Fecha de hoy en Lima, 'YYYY-MM-DD'. */
export function todayISO(now = new Date()) {
  return limaFormatter.format(now);
}

/** 'YYYY-MM-DD' → Date para guardar en una columna DATE. */
export function toDbDate(iso) {
  if (iso == null || iso === '') return null;
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Date de una columna DATE → 'YYYY-MM-DD'. */
export function fromDbDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** Días entre dos fechas, contando ambas (mismo día = 1). Si fin < inicio → 0. */
export function daysInclusive(startISO, endISO) {
  const diff = toDbDate(endISO) - toDbDate(startISO);
  return diff < 0 ? 0 : Math.floor(diff / DAY_MS) + 1;
}

/** Suma n días a 'YYYY-MM-DD'. */
export function addDays(iso, n) {
  return fromDbDate(new Date(toDbDate(iso).getTime() + n * DAY_MS));
}

/** ¿Es un 'YYYY-MM-DD' válido? */
export function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = toDbDate(value);
  return !Number.isNaN(d.getTime()) && fromDbDate(d) === value;
}

/** ¿Es un mes 'YYYY-MM' válido? */
export function isMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** 'YYYY-MM' → { first: 'YYYY-MM-01', last: 'YYYY-MM-30' } */
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, '0')}` };
}

/** Lista de fechas entre a y b (inclusive). */
export function eachDay(a, b) {
  const out = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}
