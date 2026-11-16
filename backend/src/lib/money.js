// Dinero: los cálculos se hacen en céntimos (enteros) para evitar errores de
// redondeo de los decimales en JavaScript (0.1 + 0.2 !== 0.3).

/** Decimal de Prisma | string | number → céntimos (entero). */
export function toCents(value) {
  if (value == null || value === '') return 0;
  const [int, frac = ''] = String(value).trim().split('.');
  const sign = int.startsWith('-') ? -1 : 1;
  const whole = Math.abs(parseInt(int, 10) || 0);
  const cents = parseInt((frac + '00').slice(0, 2), 10) || 0;
  return sign * (whole * 100 + cents);
}

/** céntimos → '123.45' (formato que acepta Decimal(10,2)). */
export function fromCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
