import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { app, createUser, loginAs, PASSWORD, prisma, request, resetDb } from './helpers.js';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { BUSINESS, requireRole } from '../src/middleware/requireRole.js';
import cookieParser from 'cookie-parser';
import { errorHandler } from '../src/middleware/errorHandler.js';

beforeEach(resetDb);

describe('POST /api/auth/login', () => {
  it('inicia sesión con usuario y deja cookie httpOnly', async () => {
    const user = await createUser({ role: 'admin', username: 'carlos.r' });
    const res = await request(app).post('/api/auth/login').send({ login: '  Carlos.R ', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, role: 'admin' });
    expect(res.body.org.name).toBe('Negocio Test');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/ac_session=.+HttpOnly.+SameSite=Lax/i);
  });

  it('también inicia sesión con el correo', async () => {
    const user = await createUser({ email: 'Admin@Test.local' });
    const res = await request(app).post('/api/auth/login').send({ login: 'ADMIN@test.local', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, username: user.username, email: 'admin@test.local' });
  });

  it('rechaza contraseña incorrecta y lo registra en la bitácora', async () => {
    const user = await createUser({ username: 'xuser' });
    const res = await request(app).post('/api/auth/login').send({ login: 'xuser', password: 'mala' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Usuario o contraseña incorrectos');
    const log = await prisma.auditLog.findFirst({ where: { action: 'login_failed' } });
    expect(log).toMatchObject({ userId: user.id, orgId: user.orgId, entity: 'user' });
  });

  it('mismo mensaje si el usuario no existe (no revela qué usuarios hay)', async () => {
    const res = await request(app).post('/api/auth/login').send({ login: 'nadie', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Usuario o contraseña incorrectos');
  });

  it('exige usuario y contraseña', async () => {
    const res = await request(app).post('/api/auth/login').send({ login: '', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toMatchObject({ login: expect.any(String), password: expect.any(String) });
  });

  it('bloquea usuarios suspendidos', async () => {
    await createUser({ username: 'suspendido', status: 'suspended' });
    const res = await request(app).post('/api/auth/login').send({ login: 'suspendido', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('bloquea a los operadores si su negocio está suspendido', async () => {
    const admin = await createUser({ role: 'admin' });
    const op = await createUser({ role: 'operator', orgId: admin.orgId });
    const agent = await loginAs(op);
    await prisma.organization.update({ where: { id: admin.orgId }, data: { status: 'suspended' } });
    expect((await agent.get('/api/auth/me')).status).toBe(403);
  });

  it('registra el login exitoso', async () => {
    const user = await createUser();
    await loginAs(user);
    expect(await prisma.auditLog.count({ where: { action: 'login', userId: user.id } })).toBe(1);
    expect((await prisma.user.findUnique({ where: { id: user.id } })).lastLoginAt).not.toBeNull();
  });
});

describe('sesión', () => {
  it('/me exige sesión', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('/me devuelve el usuario actual; el superadmin no tiene negocio', async () => {
    const agent = await loginAs(await createUser({ role: 'superadmin' }));
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('superadmin');
    expect(res.body.org).toBeNull();
  });

  it('logout borra la cookie (no se registra en la bitácora)', async () => {
    const user = await createUser();
    const agent = await loginAs(user);
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'logout' } })).toBe(0);
  });

  it('suspender a un usuario corta su sesión de inmediato', async () => {
    const user = await createUser();
    const agent = await loginAs(user);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'suspended' } });
    expect((await agent.get('/api/auth/me')).status).toBe(403);
  });
});

describe('POST /api/auth/change-password', () => {
  it('cambia la contraseña y cierra las otras sesiones', async () => {
    const user = await createUser();
    const phone = await loginAs(user);
    const pc = await loginAs(user);

    const res = await pc.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'NuevaClave99' });
    expect(res.status).toBe(200);
    expect((await pc.get('/api/auth/me')).status).toBe(200); // la sesión actual sigue
    expect((await phone.get('/api/auth/me')).status).toBe(401); // la otra se cerró

    const login = await request(app).post('/api/auth/login').send({ login: user.username, password: 'NuevaClave99' });
    expect(login.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'password_change' } })).toBe(1);
  });

  it('exige la contraseña actual correcta', async () => {
    const agent = await loginAs(await createUser());
    const res = await agent.post('/api/auth/change-password').send({ currentPassword: 'mala', newPassword: 'NuevaClave99' });
    expect(res.status).toBe(401);
  });

  it('exige mínimo 8 caracteres', async () => {
    const agent = await loginAs(await createUser());
    const res = await agent.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'corta' });
    expect(res.status).toBe(400);
  });
});

describe('requireRole', () => {
  // Mini app con rutas de ejemplo para probar la matriz de permisos.
  const mini = express();
  mini.use(cookieParser());
  mini.post('/crear', requireAuth, requireRole(...BUSINESS), (req, res) => res.json({ orgId: req.ctx.orgId }));
  mini.delete('/eliminar', requireAuth, requireRole('admin'), (req, res) => res.json({ ok: true }));
  mini.post('/admins', requireAuth, requireRole('superadmin'), (req, res) => res.json({ ok: true }));
  mini.use(errorHandler);

  async function cookieFor(user) {
    const res = await request(app).post('/api/auth/login').send({ login: user.username, password: PASSWORD });
    return res.headers['set-cookie'];
  }
  const call = async (method, path, user) => (await request(mini)[method](path).set('Cookie', await cookieFor(user))).status;

  it('admin: crea y elimina; no gestiona administradores', async () => {
    const admin = await createUser({ role: 'admin' });
    expect(await call('post', '/crear', admin)).toBe(200);
    expect(await call('delete', '/eliminar', admin)).toBe(200);
    expect(await call('post', '/admins', admin)).toBe(403);
  });

  it('operador: crea pero NO elimina', async () => {
    const admin = await createUser({ role: 'admin' });
    const op = await createUser({ role: 'operator', orgId: admin.orgId });
    expect(await call('post', '/crear', op)).toBe(200);
    expect(await call('delete', '/eliminar', op)).toBe(403);
  });

  it('superadmin: gestiona administradores pero NO entra a datos de negocio', async () => {
    const sa = await createUser({ role: 'superadmin' });
    expect(await call('post', '/admins', sa)).toBe(200);
    expect(await call('post', '/crear', sa)).toBe(403);
  });
});
