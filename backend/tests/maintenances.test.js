import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { addDays, todayISO } from '../src/lib/dates.js';
import { nextService, typeKey } from '../src/lib/maintenance.js';

const T = todayISO();

let admin, adminAgent, opAgent, vehicle;
beforeEach(async () => {
  await resetDb();
  admin = await createUser({ role: 'admin', orgName: 'Negocio A' });
  adminAgent = await loginAs(admin);
  opAgent = await loginAs(await createUser({ role: 'operator', orgId: admin.orgId }));
  vehicle = (await adminAgent.post('/api/vehicles').send({ plate: 'ATA297', brand: 'Nissan', model: 'Sentra', odometer: 40000 })).body;
});

const register = (agent, body = {}) =>
  agent.post('/api/maintenances').send({ vehicleId: vehicle.id, doneOn: T, type: 'Cambio de aceite', km: 45000, partsCost: '90', laborCost: '30', ...body });

describe('utilidades', () => {
  it('estado del próximo servicio por fecha y por km', () => {
    expect(nextService({ nextDate: addDays(T, -1) }, null, T).status).toBe('atrasado');
    expect(nextService({ nextDate: addDays(T, 15) }, null, T).status).toBe('proximo');
    expect(nextService({ nextDate: addDays(T, 16) }, null, T)).toMatchObject({ status: 'al_dia', daysLeft: 16 });
    expect(nextService({ nextKm: 50000 }, 50000, T).status).toBe('atrasado');
    expect(nextService({ nextKm: 50000 }, 49000, T)).toMatchObject({ status: 'proximo', kmLeft: 1000 });
    expect(nextService({ nextKm: 50000 }, 45000, T).status).toBe('al_dia');
    expect(nextService({ nextKm: 50000 }, null, T)).toMatchObject({ status: 'al_dia', kmLeft: null });
    // lo que llegue primero manda
    expect(nextService({ nextKm: 50000, nextDate: addDays(T, 200) }, 50100, T).status).toBe('atrasado');
    expect(nextService({}, 1000, T).status).toBe('sin_programar');
  });

  it('compara tipos sin importar mayúsculas, tildes ni espacios', () => {
    expect(typeKey('  Cambio de  ACEITE ')).toBe(typeKey('cambio de aceite'));
    expect(typeKey('Batería')).toBe(typeKey('bateria'));
  });
});

describe('registrar mantenimientos', () => {
  it('el operador registra; sube el kilometraje del vehículo y queda en la bitácora', async () => {
    const res = await register(opAgent, { workshop: 'Taller Don Pepe', nextKm: 50000, nextDate: addDays(T, 90) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'Cambio de aceite', km: 45000, partsCost: '90.00', laborCost: '30.00', cost: '120.00', workshop: 'Taller Don Pepe',
      nextKm: 50000, nextDate: addDays(T, 90), superseded: false,
      vehicle: { plate: 'ATA297', odometer: 45000 },
      next: { status: 'al_dia', kmLeft: 5000, daysLeft: 90 },
    });
    expect((await prisma.vehicle.findUnique({ where: { id: vehicle.id } })).odometer).toBe(45000);

    const logs = await prisma.auditLog.findMany({ where: { entity: { in: ['maintenance', 'vehicle'] }, action: { not: 'login' } }, orderBy: { id: 'asc' } });
    expect(logs.map((l) => `${l.action}:${l.entity}`)).toEqual(['create:vehicle', 'create:maintenance', 'update:vehicle']);
    expect(logs.at(-1).changes).toEqual({ odometer: { antes: 40000, despues: 45000 } });
  });

  it('un km menor al actual no baja el kilometraje del vehículo', async () => {
    expect((await register(adminAgent, { km: 30000 })).status).toBe(201);
    expect((await prisma.vehicle.findUnique({ where: { id: vehicle.id } })).odometer).toBe(40000);
  });

  it('montos vacíos = 0 y sin km ni próximo servicio', async () => {
    const res = await register(adminAgent, { km: '', partsCost: '', laborCost: '', type: 'Revisión general' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ km: null, partsCost: '0.00', laborCost: '0.00', cost: '0.00', next: { status: 'sin_programar' } });
  });

  it('valida fechas y kilometrajes', async () => {
    let res = await register(adminAgent, { nextKm: 44000 });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.nextKm).toMatch(/mayor/);

    res = await register(adminAgent, { nextDate: T });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.nextDate).toMatch(/posterior/);

    res = await register(adminAgent, { doneOn: addDays(T, 1) });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.doneOn).toBeTruthy();

    res = await register(adminAgent, { type: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.type).toBeTruthy();
  });
});

describe('próximos servicios y alertas', () => {
  it('un servicio nuevo del mismo tipo reemplaza al anterior', async () => {
    const old = (await register(adminAgent, { doneOn: addDays(T, -100), km: 40000, nextKm: 45000 })).body;
    expect(old.next).toMatchObject({ status: 'al_dia', kmLeft: 5000 }); // el vehículo tiene 40 000 km

    await register(adminAgent, { type: 'cambio de ACEITE', km: 45000, nextKm: 50000 });
    await register(adminAgent, { type: 'Frenos', km: 45000, nextDate: addDays(T, 10) });

    const up = (await opAgent.get('/api/maintenances/upcoming')).body.items;
    expect(up.map((m) => [m.type, m.next.status])).toEqual([['Frenos', 'proximo'], ['cambio de ACEITE', 'al_dia']]);

    const all = (await opAgent.get('/api/maintenances')).body.items;
    expect(all.find((m) => m.id === old.id)).toMatchObject({ superseded: true, next: { status: 'reemplazado' } });
    expect((await opAgent.get(`/api/maintenances/${old.id}`)).body.superseded).toBe(true);

    const alerts = (await opAgent.get('/api/maintenances/alerts')).body;
    expect(alerts).toMatchObject({ overdue: 0, soon: 1 });
  });

  it('atrasado por km; no avisa de vehículos inactivos', async () => {
    await register(adminAgent, { km: 45000, nextKm: 45500 });
    await adminAgent.patch(`/api/vehicles/${vehicle.id}`).send({ odometer: 46000 });
    expect((await adminAgent.get('/api/maintenances/alerts')).body).toMatchObject({ overdue: 1, soon: 0 });

    await adminAgent.patch(`/api/vehicles/${vehicle.id}`).send({ status: 'inactivo' });
    expect((await adminAgent.get('/api/maintenances/alerts')).body).toMatchObject({ overdue: 0, items: [] });
  });

  it('filtra el historial por vehículo y mes', async () => {
    const other = (await adminAgent.post('/api/vehicles').send({ plate: 'BBB222', brand: 'Kia', model: 'Rio' })).body;
    await register(adminAgent);
    await register(adminAgent, { vehicleId: other.id, km: 1000 });
    expect((await adminAgent.get(`/api/maintenances?vehicleId=${other.id}`)).body.items).toHaveLength(1);
    expect((await adminAgent.get(`/api/maintenances?month=${T.slice(0, 7)}`)).body.items).toHaveLength(2);
    expect((await adminAgent.get('/api/maintenances?month=2000-01')).body.items).toHaveLength(0);
  });
});

describe('Excel', () => {
  const download = (agent, url) => agent.get(url).buffer(true).parse((r, cb) => {
    const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
  });

  it('descarga el registro con el formato del cuadro y los gastos por mes', async () => {
    await register(opAgent, { workshop: 'Taller Don Pepe', detail: 'Aceite 10W-30', nextKm: 50000 });
    await opAgent.post('/api/expenses').send({ vehicleId: vehicle.id, date: T, category: 'accesorio', amount: '20' });

    const res = await download(opAgent, `/api/maintenances/export?vehicleId=${vehicle.id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(res.headers['content-disposition']).toMatch(/mantenimientos-ATA297-.*\.xlsx/);

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.getWorksheet('Mantenimientos');
    expect(ws.getCell('A1').value).toBe('REGISTRO DE MANTENIMIENTOS – FLOTA VEHICULAR');
    expect(ws.getRow(4).values.slice(1)).toEqual([
      'N°', 'Fecha', 'Vehículo / Modelo', 'Kilometraje', 'Tipo de servicio', 'Detalle de reparación / servicio',
      'Taller', 'Repuestos (S/)', 'Mano de obra (S/)', 'Total (S/)', 'Próximo mantenimiento (km o fecha)',
    ]);
    const r = ws.getRow(5).values.slice(1);
    expect(r).toMatchObject([1, expect.any(Date), 'ATA-297 · Nissan Sentra', 45000, 'Cambio de aceite', 'Aceite 10W-30', 'Taller Don Pepe', 90, 30, 120, '50,000 km']);
    expect(ws.getRow(6).getCell(10).value).toBe(120); // fila TOTAL

    const ws2 = wb.getWorksheet('Gastos por mes');
    expect(ws2.getRow(5).values.slice(2)).toEqual(['ATA-297', 120, 20, 140]);
  });

  it('no exporta vehículos de otro negocio', async () => {
    const b = await loginAs(await createUser({ role: 'admin', orgName: 'Negocio B' }));
    expect((await b.get(`/api/maintenances/export?vehicleId=${vehicle.id}`)).status).toBe(404);
  });
});

describe('permisos y aislamiento', () => {
  it('el operador no corrige ni elimina; el admin sí (eliminación lógica)', async () => {
    const m = (await register(opAgent)).body;
    expect((await opAgent.patch(`/api/maintenances/${m.id}`).send({ laborCost: '60' })).status).toBe(403);
    expect((await opAgent.delete(`/api/maintenances/${m.id}`)).status).toBe(403);

    const upd = await adminAgent.patch(`/api/maintenances/${m.id}`).send({ laborCost: '60', workshop: '', km: 47000 });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ partsCost: '90.00', laborCost: '60.00', cost: '150.00', workshop: null, km: 47000, vehicle: { odometer: 47000 } });

    const log = await prisma.auditLog.findFirst({ where: { entity: 'maintenance', action: 'update' } });
    expect(log.changes).toMatchObject({ mano_de_obra: { antes: '30.00', despues: '60.00' }, total: { antes: '120.00', despues: '150.00' }, km: { antes: 45000, despues: 47000 } });

    expect((await adminAgent.delete(`/api/maintenances/${m.id}`)).status).toBe(204);
    expect((await adminAgent.get(`/api/maintenances/${m.id}`)).status).toBe(404);
    expect((await adminAgent.get('/api/maintenances')).body.items).toHaveLength(0);
    expect(await prisma.maintenance.count()).toBe(1); // sigue en la BD
    // con historial, el vehículo ya no se puede eliminar
    expect((await adminAgent.delete(`/api/vehicles/${vehicle.id}`)).status).toBe(409);
  });

  it('al editar valida contra los datos guardados', async () => {
    const m = (await register(adminAgent, { nextKm: 50000 })).body;
    const res = await adminAgent.patch(`/api/maintenances/${m.id}`).send({ km: 51000 });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.nextKm).toBeTruthy();
  });

  it('otro negocio no ve ni toca los mantenimientos (404)', async () => {
    const m = (await register(adminAgent)).body;
    const other = await createUser({ role: 'admin', orgName: 'Negocio B' });
    const b = await loginAs(other);
    expect((await b.get(`/api/maintenances/${m.id}`)).status).toBe(404);
    expect((await b.patch(`/api/maintenances/${m.id}`).send({ laborCost: '1' })).status).toBe(404);
    expect((await b.delete(`/api/maintenances/${m.id}`)).status).toBe(404);
    expect((await b.get('/api/maintenances')).body.items).toHaveLength(0);
    expect((await b.post('/api/maintenances').send({ vehicleId: vehicle.id, doneOn: T, type: 'X' })).status).toBe(404);
  });

  it('el superadmin no accede', async () => {
    const sa = await loginAs(await createUser({ role: 'superadmin' }));
    expect((await sa.get('/api/maintenances')).status).toBe(403);
  });
});
