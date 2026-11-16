import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { addDays, todayISO } from '../src/lib/dates.js';

const T = todayISO();

let admin, adminAgent, operator, opAgent, vehicle;
beforeEach(async () => {
  await resetDb();
  admin = await createUser({ role: 'admin', orgName: 'Negocio A' });
  adminAgent = await loginAs(admin);
  operator = await createUser({ role: 'operator', orgId: admin.orgId });
  opAgent = await loginAs(operator);
  vehicle = (await adminAgent.post('/api/vehicles').send({ plate: 'ATA297', brand: 'Nissan', model: 'Sentra', odometer: 10000 })).body;
});

describe('Inicio (dashboard)', () => {
  it('reúne flota, cobros, días sin marcar y alertas', async () => {
    await adminAgent.post('/api/vehicles').send({ plate: 'BBB222', brand: 'Kia', model: 'Rio' });
    await adminAgent.post('/api/rentals').send({ vehicleId: vehicle.id, dailyRate: '60', startDate: addDays(T, -2), newRenter: { fullName: 'Juan Pérez' } });
    await opAgent.post('/api/daily/records').send({ vehicleId: vehicle.id, date: T, status: 'pagado' });
    await opAgent.post('/api/maintenances').send({ vehicleId: vehicle.id, doneOn: T, type: 'Frenos', partsCost: '40', nextDate: addDays(T, 5) });
    await opAgent.post('/api/expenses').send({ vehicleId: vehicle.id, date: T, category: 'otro', amount: '5' });

    const res = await opAgent.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      today: T,
      fleet: { total: 2, alquilado: 1, disponible: 1, taller: 0 },
      todayIncome: '60.00',
      pending: [{ plate: 'ATA297', renter: 'Juan Pérez', pendingDays: 2 }],
      maintenance: { overdue: 0, soon: 1, items: [{ type: 'Frenos', plate: 'ATA297' }] },
      documents: { expired: 0, expiring: 0 },
    });
    expect(res.body.week).toHaveLength(7);
    expect(res.body.week.at(-1)).toEqual({ date: T, income: '60.00' });
    if (T.slice(0, 7) === addDays(T, -2).slice(0, 7)) {
      expect(res.body.month).toMatchObject({ income: '60.00', maintenance: '40.00', otherExpenses: '5.00', net: '15.00', pendingDays: 2 });
    }
  });

  it('cada negocio ve solo lo suyo; el superadmin no accede', async () => {
    const b = await loginAs(await createUser({ role: 'admin', orgName: 'Negocio B' }));
    expect((await b.get('/api/dashboard')).body.fleet.total).toBe(0);
    const sa = await loginAs(await createUser({ role: 'superadmin' }));
    expect((await sa.get('/api/dashboard')).status).toBe(403);
  });
});

describe('Bitácora', () => {
  it('el admin ve las acciones de su negocio, con filtros y paginación', async () => {
    await opAgent.post('/api/maintenances').send({ vehicleId: vehicle.id, doneOn: T, type: 'Frenos' });

    const res = await adminAgent.get('/api/audit');
    expect(res.status).toBe(200);
    const first = res.body.items[0];
    expect(first).toMatchObject({ action: 'create', entity: 'maintenance', user: { username: operator.username, role: 'operator' } });
    expect(typeof first.id).toBe('string');
    expect(first).not.toHaveProperty('orgId');

    const onlyVehicles = (await adminAgent.get('/api/audit').query({ entity: 'vehicle' })).body.items;
    expect(onlyVehicles.length).toBeGreaterThan(0);
    expect(onlyVehicles.every((i) => i.entity === 'vehicle')).toBe(true);

    const byOperator = (await adminAgent.get('/api/audit').query({ userId: operator.id })).body.items;
    expect(byOperator.every((i) => i.user.id === operator.id)).toBe(true);

    const p1 = (await adminAgent.get('/api/audit').query({ limit: 2 })).body;
    expect(p1.items).toHaveLength(2);
    const p2 = (await adminAgent.get('/api/audit').query({ limit: 2, cursor: p1.nextCursor })).body;
    expect(Number(p2.items[0].id)).toBeLessThan(Number(p1.items[1].id));

    expect((await adminAgent.get('/api/audit').query({ from: addDays(T, 1) })).body.items).toHaveLength(0);
    expect((await adminAgent.get('/api/audit').query({ from: T, to: T })).body.items.length).toBeGreaterThan(0);

    const users = (await adminAgent.get('/api/audit/users')).body.items;
    expect(users.map((u) => u.id).sort()).toEqual([admin.id, operator.id].sort());
  });

  it('el operador no tiene acceso; otro negocio no ve nada ajeno', async () => {
    expect((await opAgent.get('/api/audit')).status).toBe(403);
    const other = await createUser({ role: 'admin', orgName: 'Negocio B' });
    const b = await loginAs(other);
    const items = (await b.get('/api/audit')).body.items;
    expect(items.every((i) => i.user?.id === other.id)).toBe(true); // solo su propio login
  });

  it('el superadmin ve solo acciones de plataforma', async () => {
    const sa = await createUser({ role: 'superadmin' });
    const saAgent = await loginAs(sa);
    await saAgent.post(`/api/superadmin/businesses/${admin.orgId}/suspend`);

    const items = (await saAgent.get('/api/audit')).body.items;
    expect(items.some((i) => i.action === 'suspend' && i.entity === 'organization')).toBe(true);
    expect(items.some((i) => ['vehicle', 'maintenance'].includes(i.entity))).toBe(false);
    const ids = (await prisma.auditLog.findMany({ where: { orgId: null }, select: { id: true } })).map((r) => r.id.toString());
    expect(items.every((i) => ids.includes(i.id))).toBe(true);
    expect((await saAgent.get('/api/audit/users')).body.items.map((u) => u.role)).toEqual(['superadmin']);
  });
});
