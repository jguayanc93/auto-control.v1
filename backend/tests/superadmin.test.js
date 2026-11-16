import { beforeEach, describe, expect, it } from 'vitest';
import { app, createUser, loginAs, prisma, request, resetDb } from './helpers.js';

const URL = '/api/superadmin/businesses';
const NEW_BUSINESS = { businessName: 'Taxi Express', adminName: 'Rosa Díaz', username: 'Rosa.Diaz' };

let sa;
beforeEach(async () => {
  await resetDb();
  sa = await loginAs(await createUser({ role: 'superadmin', username: 'cvaca' }));
});

describe('acceso', () => {
  it('admin y operador NO pueden usar el panel de superadmin', async () => {
    const admin = await createUser({ role: 'admin' });
    const op = await createUser({ role: 'operator', orgId: admin.orgId });
    for (const user of [admin, op]) {
      const agent = await loginAs(user);
      expect((await agent.get(URL)).status).toBe(403);
      expect((await agent.post(URL).send(NEW_BUSINESS)).status).toBe(403);
    }
  });

  it('sin sesión → 401', async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });
});

describe('crear negocio', () => {
  it('crea negocio + administrador con contraseña temporal que funciona', async () => {
    const res = await sa.post(URL).send(NEW_BUSINESS);
    expect(res.status).toBe(201);
    expect(res.body.business).toMatchObject({
      name: 'Taxi Express', status: 'active',
      admin: { name: 'Rosa Díaz', username: 'rosa.diaz', email: null },
      counts: { vehicles: 0, operators: 0 },
    });
    const { username, temporaryPassword } = res.body.credentials;
    expect(username).toBe('rosa.diaz');
    expect(temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}$/);

    const login = await request(app).post('/api/auth/login').send({ login: 'rosa.diaz', password: temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.org.name).toBe('Taxi Express');

    const log = await prisma.auditLog.findFirst({ where: { action: 'create', entity: 'organization' } });
    expect(log).toMatchObject({ orgId: null, entityId: res.body.business.id });
  });

  it('si se indica contraseña, no devuelve contraseña temporal', async () => {
    const res = await sa.post(URL).send({ ...NEW_BUSINESS, password: 'ClaveRosa2026', email: 'rosa@taxi.pe' });
    expect(res.status).toBe(201);
    expect(res.body.credentials.temporaryPassword).toBeNull();
    expect((await request(app).post('/api/auth/login').send({ login: 'rosa@taxi.pe', password: 'ClaveRosa2026' })).status).toBe(200);
  });

  it('usuario repetido → 409 con el campo marcado', async () => {
    await sa.post(URL).send(NEW_BUSINESS);
    const res = await sa.post(URL).send({ ...NEW_BUSINESS, businessName: 'Otro' });
    expect(res.status).toBe(409);
    expect(res.body.error.details.fields.username).toBe('Ese usuario ya está en uso');
  });

  it('no permite usar el usuario de un superadmin', async () => {
    const res = await sa.post(URL).send({ ...NEW_BUSINESS, username: 'cvaca' });
    expect(res.status).toBe(409);
  });

  it('valida los datos', async () => {
    const res = await sa.post(URL).send({ businessName: '', adminName: 'R', username: 'con espacios', password: '123' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields).sort()).toEqual(['adminName', 'businessName', 'password', 'username']);
  });
});

describe('listar y editar', () => {
  it('lista negocios con datos generales, sin datos sensibles', async () => {
    await sa.post(URL).send(NEW_BUSINESS);
    const res = await sa.get(URL);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|sessionVersion/);
  });

  it('edita negocio y administrador, y lo registra', async () => {
    const { body } = await sa.post(URL).send(NEW_BUSINESS);
    const res = await sa.patch(`${URL}/${body.business.id}`).send({ businessName: 'Taxi Express SAC', adminName: 'Rosa Díaz Pérez', email: 'rosa@taxi.pe' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Taxi Express SAC', admin: { name: 'Rosa Díaz Pérez', email: 'rosa@taxi.pe' } });

    const log = await prisma.auditLog.findFirst({ where: { action: 'update', entity: 'organization' } });
    expect(log.changes).toMatchObject({
      negocio: { antes: 'Taxi Express', despues: 'Taxi Express SAC' },
      administrador: { antes: 'Rosa Díaz', despues: 'Rosa Díaz Pérez' },
    });
  });

  it('muestra cuántos vehículos tiene el negocio (sin límite)', async () => {
    const { body } = await sa.post(URL).send(NEW_BUSINESS);
    const orgId = body.business.id;
    await prisma.vehicle.createMany({
      data: ['AAA111', 'BBB222', 'CCC333'].map((plate) => ({ orgId, plate, brand: 'Toyota', model: 'Yaris' })),
    });
    const item = (await sa.get(URL)).body.items[0];
    expect(item.counts.vehicles).toBe(3);
    expect(item).not.toHaveProperty('vehicleLimit');
  });

  it('404 si el negocio no existe; 400 si el id es inválido', async () => {
    expect((await sa.patch(`${URL}/${crypto.randomUUID()}`).send({ businessName: 'X Y' })).status).toBe(404);
    expect((await sa.patch(`${URL}/abc`).send({ businessName: 'X Y' })).status).toBe(400);
  });
});

describe('suspender, reactivar y restablecer contraseña', () => {
  it('suspender bloquea al administrador y a sus operadores; reactivar los habilita', async () => {
    const { body } = await sa.post(URL).send({ ...NEW_BUSINESS, password: 'ClaveRosa2026' });
    const id = body.business.id;
    const op = await createUser({ role: 'operator', orgId: id });
    const adminAgent = await request.agent(app);
    await adminAgent.post('/api/auth/login').send({ login: 'rosa.diaz', password: 'ClaveRosa2026' });
    const opAgent = await loginAs(op);

    expect((await sa.post(`${URL}/${id}/suspend`)).body.status).toBe('suspended');
    // Sus sesiones abiertas se cierran (401) y no pueden volver a entrar (403 "cuenta suspendida").
    expect((await adminAgent.get('/api/auth/me')).status).toBe(401);
    expect((await opAgent.get('/api/auth/me')).status).toBe(401);
    const blocked = await request(app).post('/api/auth/login').send({ login: 'rosa.diaz', password: 'ClaveRosa2026' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toMatch(/suspendida/);
    expect((await request(app).post('/api/auth/login').send({ login: op.username, password: 'Clave12345' })).status).toBe(403);

    expect((await sa.post(`${URL}/${id}/activate`)).body.status).toBe('active');
    // Al reactivar, las sesiones antiguas siguen cerradas: deben iniciar sesión de nuevo.
    expect((await adminAgent.get('/api/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ login: 'rosa.diaz', password: 'ClaveRosa2026' })).status).toBe(200);

    const actions = (await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { id: 'asc' } })).map((l) => l.action);
    expect(actions).toEqual(['create', 'suspend', 'activate']);
  });

  it('restablecer contraseña cierra la sesión del administrador y da una nueva', async () => {
    const { body } = await sa.post(URL).send({ ...NEW_BUSINESS, password: 'ClaveRosa2026' });
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ login: 'rosa.diaz', password: 'ClaveRosa2026' });

    const res = await sa.post(`${URL}/${body.business.id}/reset-password`).send({});
    expect(res.status).toBe(200);
    expect((await adminAgent.get('/api/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ login: 'rosa.diaz', password: 'ClaveRosa2026' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ login: 'rosa.diaz', password: res.body.temporaryPassword })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'password_reset', orgId: null } })).toBe(1);
  });
});
