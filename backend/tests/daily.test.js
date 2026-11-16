import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { addDays, todayISO } from '../src/lib/dates.js';
import { monthSummary } from '../src/lib/calendar.js';

const T = todayISO();
const MONTH = T.slice(0, 7);
const day = (n) => addDays(T, n);

let admin, adminAgent, opAgent, vehicle, rental;
beforeEach(async () => {
  await resetDb();
  admin = await createUser({ role: 'admin', orgName: 'Negocio A' });
  adminAgent = await loginAs(admin);
  opAgent = await loginAs(await createUser({ role: 'operator', orgId: admin.orgId }));
  vehicle = (await adminAgent.post('/api/vehicles').send({ plate: 'ATA297', brand: 'Nissan', model: 'Sentra' })).body;
  rental = (await adminAgent.post('/api/rentals').send({
    vehicleId: vehicle.id, newRenter: { fullName: 'Juan Pérez' }, dailyRate: '60', startDate: day(-5),
  })).body;
});

const mark = (agent, date, status, extra = {}) => agent.post('/api/daily/records').send({ vehicleId: vehicle.id, date, status, ...extra });

describe('resumen mensual (cálculo)', () => {
  it('ingresos − gastos, conteo por color y días pendientes', () => {
    const r = (vehicleId, date, status, amount) => ({ vehicleId, date: new Date(`${date}T00:00:00Z`), status, amount });
    const s = monthSummary({
      month: '2026-11', today: '2026-11-13',
      rentals: [{ vehicleId: 'v1', startDate: new Date('2026-11-08T00:00:00Z'), endDate: null }],
      records: [r('v1', '2026-11-08', 'no_pago', '0'), r('v1', '2026-11-09', 'pagado', '60'), r('v1', '2026-11-10', 'pagado', '60'),
        r('v1', '2026-11-11', 'pagado', '60'), r('v1', '2026-11-12', 'medio', '30'), r('v1', '2026-11-13', 'fuera_servicio', '0')],
      expenses: [{ amount: '82' }, { amount: '200' }],
    });
    expect(s).toMatchObject({
      income: '210.00', expenses: '282.00', net: '-72.00', pendingDays: 0,
      counts: { pagado: 3, medio: 1, no_pago: 1, fuera_servicio: 1 },
    });
  });

  it('días del contrato sin marcar quedan pendientes (solo hasta hoy)', () => {
    const s = monthSummary({
      month: '2026-11', today: '2026-11-13', records: [], expenses: [],
      rentals: [{ vehicleId: 'v1', startDate: new Date('2026-10-20T00:00:00Z'), endDate: null }],
    });
    expect(s.pendingDays).toBe(13); // 1 al 13 de noviembre
  });
});

describe('marcar días', () => {
  it('verde = tarifa y amarillo = mitad por defecto; rojo = S/ 0 sin deuda', async () => {
    const g = await mark(opAgent, day(-5), 'pagado');
    expect(g.status).toBe(201);
    expect(g.body).toMatchObject({ status: 'pagado', amount: '60.00', method: 'efectivo', rentalId: rental.id });
    expect((await mark(opAgent, day(-4), 'medio')).body.amount).toBe('30.00');
    expect((await mark(opAgent, day(-3), 'no_pago')).body).toMatchObject({ amount: '0.00', method: null });
    expect((await mark(opAgent, day(-2), 'fuera_servicio')).body.amount).toBe('0.00');
  });

  it('se puede ajustar el monto y el método', async () => {
    const res = await mark(opAgent, day(-1), 'pagado', { amount: '50', method: 'yape', note: 'Pagó incompleto' });
    expect(res.body).toMatchObject({ amount: '50.00', method: 'yape', note: 'Pagó incompleto' });
  });

  it('un día solo se marca una vez; cambiarlo es cosa del admin', async () => {
    const first = await mark(opAgent, day(-1), 'pagado');
    const again = await mark(opAgent, day(-1), 'no_pago');
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/Pagó/);

    expect((await opAgent.patch(`/api/daily/records/${first.body.id}`).send({ status: 'medio' })).status).toBe(403);
    expect((await opAgent.delete(`/api/daily/records/${first.body.id}`)).status).toBe(403);

    const changed = await adminAgent.patch(`/api/daily/records/${first.body.id}`).send({ status: 'medio' });
    expect(changed.body).toMatchObject({ status: 'medio', amount: '30.00' });
    const log = await prisma.auditLog.findFirst({ where: { entity: 'daily_record', action: 'update' } });
    expect(log.changes).toMatchObject({ estado: { antes: 'Pagó', despues: 'Media cuenta' }, monto: { antes: '60.00', despues: '30.00' } });

    expect((await adminAgent.delete(`/api/daily/records/${first.body.id}`)).status).toBe(204);
    expect((await mark(opAgent, day(-1), 'pagado')).status).toBe(201);
  });

  it('no se cobran días futuros ni días sin contrato; fuera de servicio sí', async () => {
    expect((await mark(adminAgent, day(1), 'pagado')).status).toBe(400);
    const noContract = await mark(adminAgent, day(-10), 'pagado');
    expect(noContract.status).toBe(400);
    expect(noContract.body.error.message).toMatch(/Fuera de servicio/);
    expect((await mark(adminAgent, day(-10), 'fuera_servicio')).body.rentalId).toBeNull();
    expect((await mark(adminAgent, day(7), 'fuera_servicio')).status).toBe(201);
  });

  it('otro negocio no puede marcar ni ver el calendario', async () => {
    const agentB = await loginAs(await createUser({ role: 'admin', orgName: 'Negocio B' }));
    expect((await mark(agentB, T, 'pagado')).status).toBe(404);
    expect((await agentB.get(`/api/daily/vehicles/${vehicle.id}`)).status).toBe(404);
    const rec = (await mark(adminAgent, T, 'pagado')).body;
    expect((await agentB.patch(`/api/daily/records/${rec.id}`).send({ status: 'medio' })).status).toBe(404);
  });

  it('cada marca queda en la bitácora del negocio', async () => {
    await mark(opAgent, T, 'pagado');
    const log = await prisma.auditLog.findFirst({ where: { entity: 'daily_record', action: 'create' } });
    expect(log).toMatchObject({ orgId: admin.orgId, changes: { vehiculo: 'ATA297', fecha: T, estado: 'Pagó', monto: '60.00' } });
  });
});

describe('calendario del vehículo y resumen de la flota', () => {
  it('devuelve el mes con marcas, gastos, contratos y resumen', async () => {
    await mark(opAgent, day(-5), 'pagado');
    await mark(opAgent, day(-4), 'medio');
    await opAgent.post('/api/expenses').send({ vehicleId: vehicle.id, date: T, category: 'servicio', amount: '82', description: 'Lavado' });

    const res = await opAgent.get(`/api/daily/vehicles/${vehicle.id}`).query({ month: MONTH });
    expect(res.status).toBe(200);
    expect(res.body.vehicle.plate).toBe('ATA297');
    expect(res.body.rentals[0]).toMatchObject({ dailyRate: '60.00', renter: { fullName: 'Juan Pérez' } });
    // Los días del contrato que caen en este mes, menos los 2 marcados
    const daysInMonth = [-5, -4, -3, -2, -1, 0].filter((n) => day(n).startsWith(MONTH)).length;
    const markedInMonth = [-5, -4].filter((n) => day(n).startsWith(MONTH)).length;
    expect(res.body.summary.pendingDays).toBe(daysInMonth - markedInMonth);
    expect(res.body.expenses[0]).toMatchObject({ category: 'servicio', amount: '82.00', description: 'Lavado' });
  });

  it('los mantenimientos del mes cuentan como gasto (sin registrarlos dos veces)', async () => {
    await mark(opAgent, T, 'pagado');
    await opAgent.post('/api/expenses').send({ vehicleId: vehicle.id, date: T, category: 'accesorio', amount: '20' });
    const m = (await opAgent.post('/api/maintenances').send({ vehicleId: vehicle.id, doneOn: T, type: 'Frenos', partsCost: '100', laborCost: '50.5' })).body;
    expect(m).toMatchObject({ partsCost: '100.00', laborCost: '50.50', cost: '150.50' });

    let res = await opAgent.get(`/api/daily/vehicles/${vehicle.id}`).query({ month: T.slice(0, 7) });
    expect(res.body.maintenances).toEqual([expect.objectContaining({ id: m.id, type: 'Frenos', date: T, cost: '150.50' })]);
    expect(res.body.summary).toMatchObject({ income: '60.00', otherExpenses: '20.00', maintenance: '150.50', expenses: '170.50', net: '-110.50' });

    res = await opAgent.get('/api/daily/overview').query({ month: T.slice(0, 7) });
    expect(res.body.totals).toMatchObject({ maintenance: '150.50', expenses: '170.50', net: '-110.50' });

    // corregir el mantenimiento actualiza el calendario; eliminarlo lo quita
    await adminAgent.patch(`/api/maintenances/${m.id}`).send({ laborCost: '0' });
    res = await opAgent.get(`/api/daily/vehicles/${vehicle.id}`).query({ month: T.slice(0, 7) });
    expect(res.body.summary).toMatchObject({ maintenance: '100.00', net: '-60.00' });
    await adminAgent.delete(`/api/maintenances/${m.id}`);
    res = await opAgent.get(`/api/daily/vehicles/${vehicle.id}`).query({ month: T.slice(0, 7) });
    expect(res.body).toMatchObject({ maintenances: [], summary: { maintenance: '0.00', net: '40.00' } });
  });

  it('un gasto de "mantenimiento" se registra en el módulo Mantenimiento', async () => {
    const res = await opAgent.post('/api/expenses').send({ vehicleId: vehicle.id, date: T, category: 'mantenimiento', amount: '82' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.category).toMatch(/módulo Mantenimiento/);
  });

  it('el resumen de la flota suma todos los vehículos', async () => {
    await mark(adminAgent, T, 'pagado');
    await adminAgent.post('/api/expenses').send({ vehicleId: vehicle.id, date: T, category: 'accesorio', amount: '20' });
    const res = await opAgent.get('/api/daily/overview');
    expect(res.body.items[0]).toMatchObject({ plate: 'ATA297', activeRental: { dailyRate: '60.00' }, summary: { income: '60.00', expenses: '20.00', net: '40.00' } });
    expect(res.body.totals).toMatchObject({ income: '60.00', expenses: '20.00', net: '40.00' });
  });

  it('no se puede finalizar el contrato antes de un día ya marcado', async () => {
    await mark(adminAgent, day(-1), 'pagado');
    const res = await adminAgent.post(`/api/rentals/${rental.id}/finish`).send({ endDate: day(-3) });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.endDate).toMatch(/marcados/);
  });
});

describe('gastos', () => {
  it('el operador registra; solo el admin corrige o elimina', async () => {
    const e = (await opAgent.post('/api/expenses').send({ vehicleId: vehicle.id, date: T, category: 'servicio', amount: '35.5' })).body;
    expect(e).toMatchObject({ amount: '35.50', category: 'servicio', plate: 'ATA297' });
    expect((await opAgent.patch(`/api/expenses/${e.id}`).send({ amount: 40 })).status).toBe(403);
    expect((await adminAgent.patch(`/api/expenses/${e.id}`).send({ amount: 40 })).body.amount).toBe('40.00');
    expect((await opAgent.delete(`/api/expenses/${e.id}`)).status).toBe(403);
    expect((await adminAgent.delete(`/api/expenses/${e.id}`)).status).toBe(204);
    expect((await prisma.auditLog.findMany({ where: { entity: 'expense' } })).map((l) => l.action).sort()).toEqual(['create', 'delete', 'update']);
  });

  it('valida tipo, monto y fecha', async () => {
    const res = await opAgent.post('/api/expenses').send({ vehicleId: vehicle.id, date: day(1), category: 'x', amount: '0' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields).sort()).toEqual(['amount', 'category', 'date']);
  });

  it('un vehículo con cobros o gastos no se puede eliminar', async () => {
    const v2 = (await adminAgent.post('/api/vehicles').send({ plate: 'ZZZ111', brand: 'Kia', model: 'Rio' })).body;
    await adminAgent.post('/api/expenses').send({ vehicleId: v2.id, date: T, category: 'otro', amount: '10' });
    expect((await adminAgent.delete(`/api/vehicles/${v2.id}`)).status).toBe(409);
  });
});
