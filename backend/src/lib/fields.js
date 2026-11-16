// Validadores reutilizables (Zod) para los módulos de negocio.
import { z } from 'zod';
import { isISODate, todayISO } from './dates.js';

export const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
export const emptyToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const idParams = z.object({ id: z.uuid('Identificador inválido') });
export const uuidField = (msg = 'Selecciona una opción') => z.uuid(msg);

/** Texto obligatorio recortado. */
export const text = (label, max = 120, min = 1) =>
  z.string({ error: `Ingresa ${label}` }).trim().min(min, `Ingresa ${label}`).max(max, `Máximo ${max} caracteres`);

/** Texto opcional: '' → null (borra el valor al editar). */
export const optionalText = (max = 255) => z.preprocess(emptyToNull, z.string().trim().max(max, `Máximo ${max} caracteres`).nullable().optional());

/** Monto en soles: acepta 80, '80', '80.5', '80.50'. Se guarda como texto exacto (sin errores de redondeo). */
export const money = ({ min = 0.01, label = 'el monto' } = {}) =>
  z.preprocess(
    (v) => (typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim().replace(',', '.') : v),
    z.string({ error: `Ingresa ${label}` })
      .regex(/^\d{1,8}(\.\d{1,2})?$/, 'Monto inválido (máximo 2 decimales)')
      .refine((v) => Number(v) >= min, `El monto debe ser mayor o igual a ${min}`),
  );

/** Fecha 'YYYY-MM-DD'. */
export const date = (label = 'la fecha') => z.string({ error: `Ingresa ${label}` }).refine(isISODate, 'Fecha inválida');

/** Fecha que no puede ser futura (hora de Lima). */
export const pastOrToday = (label) => date(label).refine((d) => d <= todayISO(), 'La fecha no puede ser futura');

/** Entero opcional en un rango ('' → null). */
export const optionalInt = (min, max, label) =>
  z.preprocess(emptyToNull, z.coerce.number().int('Debe ser un número entero').min(min, `${label}: mínimo ${min}`).max(max, `${label}: máximo ${max}`).nullable().optional());
