import { describe, expect, it } from 'vitest';
import { addDays, daysInclusive, fromDbDate, isISODate, toDbDate, todayISO } from '../src/lib/dates.js';
import { fromCents, toCents } from '../src/lib/money.js';
import { diff, snapshot } from '../src/lib/audit.js';

describe('dates', () => {
  it('cuenta días incluyendo inicio y fin', () => {
    expect(daysInclusive('2026-11-01', '2026-11-01')).toBe(1);
    expect(daysInclusive('2026-11-01', '2026-11-30')).toBe(30);
    expect(daysInclusive('2026-02-27', '2026-03-01')).toBe(3);
    expect(daysInclusive('2026-11-10', '2026-11-01')).toBe(0);
  });

  it('usa la fecha de Lima, no la UTC', () => {
    // 12 nov 2026 02:00 UTC = 11 nov 2026 21:00 en Lima
    expect(todayISO(new Date('2026-11-12T02:00:00Z'))).toBe('2026-11-11');
  });

  it('convierte ida y vuelta a DATE', () => {
    expect(fromDbDate(toDbDate('2026-12-31'))).toBe('2026-12-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(toDbDate('')).toBeNull();
  });

  it('valida fechas ISO', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('28/02/2026')).toBe(false);
  });
});

describe('money', () => {
  it('trabaja en céntimos sin errores de redondeo', () => {
    expect(toCents('0.1') + toCents('0.2')).toBe(toCents('0.3'));
    expect(toCents('80')).toBe(8000);
    expect(toCents('80.5')).toBe(8050);
    expect(toCents('-12.34')).toBe(-1234);
    expect(fromCents(8050)).toBe('80.50');
    expect(fromCents(-5)).toBe('-0.05');
  });
});

describe('audit helpers', () => {
  it('oculta datos sensibles', () => {
    expect(snapshot({ email: 'a@b.c', passwordHash: 'x', sessionVersion: 1 })).toEqual({ email: 'a@b.c' });
  });

  it('solo registra los campos que cambiaron', () => {
    const before = { plate: 'ABC123', brand: 'Toyota', updatedAt: new Date(1) };
    const after = { plate: 'ABC123', brand: 'Kia', updatedAt: new Date(2) };
    expect(diff(before, after)).toEqual({ brand: { antes: 'Toyota', despues: 'Kia' } });
  });
});
