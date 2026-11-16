// Documentos: estado de vencimiento y verificación del tipo real del archivo.
import crypto from 'node:crypto';
import { addDays, fromDbDate, todayISO } from './dates.js';

/** Días de anticipación para avisar "por vencer". */
export const EXPIRY_WARNING_DAYS = 30;

/**
 * vencido | por_vencer (≤ 30 días) | vigente | sin_fecha
 * @param {Date|null} expiresOn
 */
export function docStatus(expiresOn, today = todayISO()) {
  if (!expiresOn) return 'sin_fecha';
  const exp = fromDbDate(expiresOn);
  if (exp < today) return 'vencido';
  if (exp <= addDays(today, EXPIRY_WARNING_DAYS)) return 'por_vencer';
  return 'vigente';
}

/** Días que faltan para vencer (negativo = vencido hace N días). */
export function daysToExpire(expiresOn, today = todayISO()) {
  if (!expiresOn) return null;
  return Math.round((Date.parse(`${fromDbDate(expiresOn)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/**
 * Tipo real del archivo según sus primeros bytes (no se confía en la extensión
 * ni en el tipo que dice el navegador). Solo PDF, JPG y PNG.
 * @param {Buffer} buf
 * @returns {'application/pdf'|'image/jpeg'|'image/png'|null}
 */
export function detectFileType(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  return null;
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Nombre de archivo seguro para guardar y descargar. */
export function safeFileName(name, mime) {
  const ext = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[mime];
  const base = String(name ?? 'documento')
    .split(/[\\/]/).pop() // sin carpetas
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.[^.]*$/, '')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .slice(0, 100) || 'documento';
  return `${base}${ext}`;
}
