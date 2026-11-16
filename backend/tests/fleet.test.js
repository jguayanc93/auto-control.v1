import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { addDays, todayISO } from '../src/lib/dates.js';
import { rentalStats } from '../src/lib/rentals.js';

let admin, adminAgent, opAgent;
beforeEach(async () => {
  await resetDb();
  admin = await createUser({ role: 'admin', orgName: 'Negocio A' });
  adminAgent = await loginAs(admin);
  opAgent = await loginAs(await createUser({ role: 'operator', orgId: admin.orgId }));
});

const VEHICLE = { plate: 'abc-123', brand: 'Toyota', model: 'Yaris', year: 2020, color: 'Blanco' };
const newVehicle = async (agent = adminAgent, data = {}) => (await agent.post('/api/vehicles').send({ ...VEHICLE, ...data })).body;
const newRental = (agent, vehicleId, extra = {}) =>
  agent.post('/api/rentals').send({ vehicleId, newRenter: { fullName: 'Juan Pérez', phone: '987 654 321' }, dailyRate: '80', startDate: todayISO(), ...extra });

describe('estadísticas de contrato (cálculo)', () => {
  it('días del contrato, cobrado y días por marcar', () => {
    const r = { startDate: new Date('2026-11-01T00:00:00Z'), endDate: null };
    expect(rentalStats(r, { paidCents: 30000, markedDays: 6 }, '2026-11-10')).toEqual({ days: 10, paid: '300.00', markedDays: 6, pendingDays: 4 });
  });
  it('si está finalizado, cuenta hasta la fecha de fin', () => {
    const r = { startDate: new Date('2026-11-01T00:00:00Z'), endDate: new Date('2026-11-05T00:00:00Z') };
    expect(rentalStats(r, { markedDays: 5 }, '2026-12-31')).toMatchObject({ days: 5, pendingDays: 0 });
  });
});

describe('vehículos', () => {
  it('admin y operador crean; la placa se normaliza', async () => {
    const v = await newVehicle(opAgent);
    expect(v).toMatchObject({ plate: 'ABC123', brand: 'Toyota', status: 'disponible', activeRental: null });
    const log = await prisma.auditLog.findFirst({ where: { entity: 'vehicle', action: 'create' } });
    expect(log.orgId).toBe(admin.orgId);
  });

  it('placa repetida en el mismo negocio → 409; en otro negocio sí se permite', async () => {
    await newVehicle();
    const dup = await adminAgent.post('/api/vehicles').send({ ...VEHICLE, plate: 'ABC 123' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.fields.plate).toBeTruthy();

    const agentB = await loginAs(await createUser({ role: 'admin', orgName: 'Negocio B' }));
    expect((await agentB.post('/api/vehicles').send(VEHICLE)).status).toBe(201);
  });

  it('valida datos', async () => {
    const res = await adminAgent.post('/api/vehicles').send({ plate: 'A', brand: '', model: '', year: 1800 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields).sort()).toEqual(['brand', 'model', 'plate', 'year']);
  });

  it('el operador NO edita ni elimina', async () => {
    const v = await newVehicle();
    expect((await opAgent.patch(`/api/vehicles/${v.id}`).send({ color: 'Rojo' })).status).toBe(403);
    expect((await opAgent.delete(`/api/vehicles/${v.id}`)).status).toBe(403);
  });

  it('admin edita y queda en la bitácora con antes/después', async () => {
    const v = await newVehicle();
    const res = await adminAgent.patch(`/api/vehicles/${v.id}`).send({ color: 'Rojo', status: 'taller' });
    expect(res.body).toMatchObject({ color: 'Rojo', status: 'taller' });
    const log = await prisma.auditLog.findFirst({ where: { entity: 'vehicle', action: 'update' } });
    expect(log.changes).toMatchObject({ color: { antes: 'Blanco', despues: 'Rojo' }, status: { antes: 'disponible', despues: 'taller' } });
  });

  it('aislamiento: otro negocio no ve ni toca el vehículo', async () => {
    const v = await newVehicle();
    const agentB = await loginAs(await createUser({ role: 'admin', orgName: 'Negocio B' }));
    expect((await agentB.get('/api/vehicles')).body.items).toHaveLength(0);
    expect((await agentB.get(`/api/vehicles/${v.id}`)).status).toBe(404);
    expect((await agentB.patch(`/api/vehicles/${v.id}`).send({ color: 'X' })).status).toBe(404);
    expect((await agentB.delete(`/api/vehicles/${v.id}`)).status).toBe(404);
    expect((await newRental(agentB, v.id)).status).toBe(404);
  });

  it('se elimina si no tiene historial; con contratos no (hay que inactivarlo)', async () => {
    const v1 = await newVehicle();
    expect((await adminAgent.delete(`/api/vehicles/${v1.id}`)).status).toBe(204);
    expect(await prisma.auditLog.count({ where: { entity: 'vehicle', action: 'delete' } })).toBe(1);

    const v2 = await newVehicle(adminAgent, { plate: 'XYZ999' });
    await newRental(adminAgent, v2.id);
    const res = await adminAgent.delete(`/api/vehicles/${v2.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Inactivo/);
  });

  it('la placa de un vehículo eliminado se puede volver a registrar', async () => {
    const v = await newVehicle();
    await adminAgent.delete(`/api/vehicles/${v.id}`);
    expect((await adminAgent.post('/api/vehicles').send(VEHICLE)).status).toBe(201);
  });

  it('busca por placa (con o sin guion), marca o modelo', async () => {
    await newVehicle();
    await newVehicle(adminAgent, { plate: 'B2C-345', brand: 'Kia', model: 'Rio' });
    const q = async (term) => (await adminAgent.get('/api/vehicles').query({ q: term })).body.items.map((v) => v.plate);
    expect(await q('abc-1')).toEqual(['ABC123']);
    expect(await q('kia')).toEqual(['B2C345']);
    expect(await q('yaris')).toEqual(['ABC123']);
  });
});

describe('contratos', () => {
  it('el operador inicia un contrato con un conductor nuevo; el vehículo pasa a "alquilado"', async () => {
    const v = await newVehicle();
    const res = await newRental(opAgent, v.id, { startDate: addDays(todayISO(), -3) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'activo', dailyRate: '80.00', days: 4, paid: '0.00', markedDays: 0, pendingDays: 4,
      vehicle: { plate: 'ABC123' }, renter: { fullName: 'Juan Pérez', phone: '987654321' },
    });

    const list = (await adminAgent.get('/api/vehicles')).body.items;
    expect(list[0]).toMatchObject({ status: 'alquilado', activeRental: { renter: { fullName: 'Juan Pérez' }, pendingDays: 4 } });

    const actions = (await prisma.auditLog.findMany({ where: { orgId: admin.orgId, action: 'create' }, orderBy: { id: 'asc' } })).map((l) => l.entity);
    expect(actions).toEqual(['vehicle', 'renter', 'rental']);
  });

  it('el contrato suma lo cobrado y cuenta los días marcados en el calendario', async () => {
    const v = await newVehicle();
    const r = (await newRental(adminAgent, v.id, { startDate: addDays(todayISO(), -2) })).body;
    await adminAgent.post('/api/daily/records').send({ vehicleId: v.id, date: addDays(todayISO(), -2), status: 'pagado' });
    await adminAgent.post('/api/daily/records').send({ vehicleId: v.id, date: addDays(todayISO(), -1), status: 'medio' });
    const res = await adminAgent.get(`/api/rentals/${r.id}`);
    expect(res.body).toMatchObject({ days: 3, paid: '120.00', markedDays: 2, pendingDays: 1 });
  });

  it('un vehículo solo puede tener UN contrato activo', async () => {
    const v = await newVehicle();
    await newRental(adminAgent, v.id);
    const res = await newRental(adminAgent, v.id);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Juan Pérez/);
  });

  it('dos solicitudes simultáneas: solo una crea el contrato', async () => {
    const v = await newVehicle();
    const results = await Promise.all([newRental(adminAgent, v.id), newRental(opAgent, v.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.rental.count({ where: { vehicleId: v.id, status: 'activo' } })).toBe(1);
  });

  it('usa un conductor existente; no acepta conductores de otro negocio', async () => {
    const v = await newVehicle();
    const renter = (await adminAgent.post('/api/renters').send({ fullName: 'Ana Ríos' })).body;
    const ok = await adminAgent.post('/api/rentals').send({ vehicleId: v.id, renterId: renter.id, dailyRate: 70, startDate: todayISO() });
    expect(ok.status).toBe(201);

    const agentB = await loginAs(await createUser({ role: 'admin', orgName: 'Negocio B' }));
    const vB = await newVehicle(agentB);
    const res = await agentB.post('/api/rentals').send({ vehicleId: vB.id, renterId: renter.id, dailyRate: 70, startDate: todayISO() });
    expect(res.status).toBe(404);
  });

  it('valida: conductor obligatorio, tarifa y fecha no futura', async () => {
    const v = await newVehicle();
    const res = await adminAgent.post('/api/rentals').send({ vehicleId: v.id, dailyRate: '80.555', startDate: addDays(todayISO(), 1) });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields).sort()).toEqual(['dailyRate', 'renterId', 'startDate']);
  });

  it('no se alquila un vehículo inactivo', async () => {
    const v = await newVehicle();
    await adminAgent.patch(`/api/vehicles/${v.id}`).send({ status: 'inactivo' });
    expect((await newRental(adminAgent, v.id)).status).toBe(400);
  });

  it('con contrato activo no se cambia el estado del vehículo', async () => {
    const v = await newVehicle();
    await newRental(adminAgent, v.id);
    expect((await adminAgent.patch(`/api/vehicles/${v.id}`).send({ status: 'taller' })).status).toBe(400);
  });

  it('finalizar (admin u operador): vehículo disponible y saldo fijo', async () => {
    const v = await newVehicle();
    const r = (await newRental(adminAgent, v.id, { startDate: addDays(todayISO(), -9) })).body;

    expect((await opAgent.post(`/api/rentals/${r.id}/finish`).send({ endDate: addDays(todayISO(), -10) })).status).toBe(400);

    const res = await opAgent.post(`/api/rentals/${r.id}/finish`).send({ endDate: addDays(todayISO(), -5) });
    expect(res.body).toMatchObject({ status: 'finalizado', days: 5 });
    expect((await adminAgent.get(`/api/vehicles/${v.id}`)).body.status).toBe('disponible');

    // ya se puede iniciar otro contrato
    expect((await newRental(adminAgent, v.id)).status).toBe(201);
  });

  it('admin corrige la tarifa y queda registrado', async () => {
    const v = await newVehicle();
    const r = (await newRental(adminAgent, v.id)).body;
    expect((await opAgent.patch(`/api/rentals/${r.id}`).send({ dailyRate: 90 })).status).toBe(403);
    const res = await adminAgent.patch(`/api/rentals/${r.id}`).send({ dailyRate: 90 });
    expect(res.body.dailyRate).toBe('90.00');
    const log = await prisma.auditLog.findFirst({ where: { entity: 'rental', action: 'update' } });
    expect(log.changes.tarifaDiaria).toEqual({ antes: '80', despues: '90' });
  });

  it('eliminar contrato: solo si no tiene días marcados; libera el vehículo', async () => {
    const v = await newVehicle();
    const r = (await newRental(adminAgent, v.id)).body;
    expect((await adminAgent.delete(`/api/rentals/${r.id}`)).status).toBe(204);
    expect((await adminAgent.get(`/api/vehicles/${v.id}`)).body.status).toBe('disponible');

    const r2 = (await newRental(adminAgent, v.id)).body;
    await adminAgent.post('/api/daily/records').send({ vehicleId: v.id, date: todayISO(), status: 'pagado' });
    expect((await adminAgent.delete(`/api/rentals/${r2.id}`)).status).toBe(409);
  });
});

describe('conductores', () => {
  it('crea, lista con su contrato activo y no elimina si tuvo contratos', async () => {
    const v = await newVehicle();
    const r = (await newRental(opAgent, v.id)).body;
    const list = (await adminAgent.get('/api/renters')).body.items;
    expect(list[0]).toMatchObject({ fullName: 'Juan Pérez', rentalCount: 1, activeRentals: [{ vehicle: { plate: 'ABC123' } }] });

    expect((await adminAgent.delete(`/api/renters/${r.renterId}`)).status).toBe(409);
    const free = (await opAgent.post('/api/renters').send({ fullName: 'Sin Contrato' })).body;
    expect((await opAgent.delete(`/api/renters/${free.id}`)).status).toBe(403);
    expect((await adminAgent.delete(`/api/renters/${free.id}`)).status).toBe(204);
  });

  it('valida el teléfono', async () => {
    const res = await adminAgent.post('/api/renters').send({ fullName: 'Ana', phone: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.phone).toBeTruthy();
  });
});
