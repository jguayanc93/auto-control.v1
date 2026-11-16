import { beforeEach, describe, expect, it } from 'vitest';
import { app, createUser, loginAs, PASSWORD, prisma, request, resetDb } from './helpers.js';

const URL = '/api/users';
const NEW_OP = { name: 'Lucía Torres', username: 'lucia.t' };

let admin, adminAgent;
beforeEach(async () => {
  await resetDb();
  admin = await createUser({ role: 'admin', username: 'admin.a', orgName: 'Negocio A' });
  adminAgent = await loginAs(admin);
});

const login = (username, password = PASSWORD) => request(app).post('/api/auth/login').send({ login: username, password });

describe('acceso', () => {
  it('operador y superadmin NO gestionan usuarios', async () => {
    const op = await createUser({ role: 'operator', orgId: admin.orgId });
    const sa = await createUser({ role: 'superadmin' });
    for (const u of [op, sa]) {
      const agent = await loginAs(u);
      expect((await agent.get(URL)).status).toBe(403);
      expect((await agent.post(URL).send(NEW_OP)).status).toBe(403);
    }
  });
});

describe('crear operador', () => {
  it('crea un operador del mismo negocio con contraseña temporal', async () => {
    const res = await adminAgent.post(URL).send(NEW_OP);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Lucía Torres', username: 'lucia.t', role: 'operator', status: 'active' });

    const me = await login('lucia.t', res.body.credentials.temporaryPassword);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('operator');
    expect(me.body.org.id).toBe(admin.orgId);

    const log = await prisma.auditLog.findFirst({ where: { action: 'create', entity: 'user' } });
    expect(log).toMatchObject({ orgId: admin.orgId, userId: admin.id, entityId: res.body.user.id });
  });

  it('ignora intentos de crear con otro rol u otro negocio', async () => {
    const other = await createUser({ role: 'admin', orgName: 'Negocio B' });
    const res = await adminAgent.post(URL).send({ ...NEW_OP, role: 'admin', orgId: other.orgId });
    expect(res.status).toBe(201);
    const created = await prisma.user.findUnique({ where: { id: res.body.user.id } });
    expect(created).toMatchObject({ role: 'operator', orgId: admin.orgId });
  });

  it('usuario repetido → 409', async () => {
    await adminAgent.post(URL).send(NEW_OP);
    const res = await adminAgent.post(URL).send({ ...NEW_OP, name: 'Otra Persona' });
    expect(res.status).toBe(409);
    expect(res.body.error.details.fields.username).toBeTruthy();
  });
});

describe('aislamiento entre negocios', () => {
  it('cada administrador solo ve y gestiona su propio equipo', async () => {
    const opA = (await adminAgent.post(URL).send(NEW_OP)).body.user;
    const adminB = await createUser({ role: 'admin', orgName: 'Negocio B' });
    const opB = await createUser({ role: 'operator', orgId: adminB.orgId });
    const agentB = await loginAs(adminB);

    const listB = (await agentB.get(URL)).body.items.map((u) => u.id);
    expect(listB.sort()).toEqual([adminB.id, opB.id].sort());

    // B no puede tocar al operador de A (404: ni siquiera revela que existe)
    expect((await agentB.patch(`${URL}/${opA.id}`).send({ name: 'Hackeado' })).status).toBe(404);
    expect((await agentB.post(`${URL}/${opA.id}/suspend`)).status).toBe(404);
    expect((await agentB.post(`${URL}/${opA.id}/reset-password`).send({})).status).toBe(404);
    expect((await prisma.user.findUnique({ where: { id: opA.id } })).name).toBe('Lucía Torres');
  });

  it('el administrador no puede modificarse a sí mismo ni a otro admin por esta vía', async () => {
    expect((await adminAgent.post(`${URL}/${admin.id}/suspend`)).status).toBe(404);
    const coAdmin = await createUser({ role: 'admin', orgId: admin.orgId });
    expect((await adminAgent.post(`${URL}/${coAdmin.id}/reset-password`).send({})).status).toBe(404);
  });
});

describe('editar, suspender, reactivar y restablecer', () => {
  it('edita nombre y correo y lo registra', async () => {
    const op = (await adminAgent.post(URL).send(NEW_OP)).body.user;
    const res = await adminAgent.patch(`${URL}/${op.id}`).send({ name: 'Lucía Torres Vega', email: 'lucia@negocio.pe' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Lucía Torres Vega', email: 'lucia@negocio.pe' });
    const log = await prisma.auditLog.findFirst({ where: { action: 'update', entity: 'user' } });
    expect(log.changes).toMatchObject({ name: { antes: 'Lucía Torres', despues: 'Lucía Torres Vega' } });
  });

  it('suspender cierra su sesión y bloquea el login; reactivar lo habilita', async () => {
    const res = await adminAgent.post(URL).send({ ...NEW_OP, password: 'ClaveLucia1' });
    const id = res.body.user.id;
    const opAgent = request.agent(app);
    await opAgent.post('/api/auth/login').send({ login: 'lucia.t', password: 'ClaveLucia1' });

    expect((await adminAgent.post(`${URL}/${id}/suspend`)).body.status).toBe('suspended');
    expect((await opAgent.get('/api/auth/me')).status).toBe(401);
    expect((await login('lucia.t', 'ClaveLucia1')).status).toBe(403);
    // El administrador sigue trabajando normalmente
    expect((await adminAgent.get('/api/auth/me')).status).toBe(200);

    expect((await adminAgent.post(`${URL}/${id}/activate`)).body.status).toBe('active');
    expect((await login('lucia.t', 'ClaveLucia1')).status).toBe(200);

    const logs = await prisma.auditLog.findMany({ where: { entityId: id, orgId: admin.orgId }, orderBy: { id: 'asc' } });
    // La bitácora registra tanto la gestión del admin como los intentos de login del operador
    expect(logs.filter((l) => l.userId === admin.id).map((l) => l.action)).toEqual(['create', 'suspend', 'activate']);
    expect(logs.filter((l) => l.userId === id).map((l) => l.action)).toEqual(['login', 'login_failed', 'login']);
  });

  it('restablecer contraseña da una nueva y cierra la sesión anterior', async () => {
    const res = await adminAgent.post(URL).send({ ...NEW_OP, password: 'ClaveLucia1' });
    const opAgent = request.agent(app);
    await opAgent.post('/api/auth/login').send({ login: 'lucia.t', password: 'ClaveLucia1' });

    const reset = await adminAgent.post(`${URL}/${res.body.user.id}/reset-password`).send({});
    expect(reset.status).toBe(200);
    expect((await opAgent.get('/api/auth/me')).status).toBe(401);
    expect((await login('lucia.t', 'ClaveLucia1')).status).toBe(401);
    expect((await login('lucia.t', reset.body.temporaryPassword)).status).toBe(200);
  });
});
