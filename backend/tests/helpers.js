import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/passwords.js';

export const app = createApp();
export const PASSWORD = 'Clave12345';

/** Vacía todas las tablas de la BD de tests. */
export async function resetDb() {
  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Protección: los tests solo pueden vaciar una BD *_test (actual: ${dbName})`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE audit_logs, document_files, documents, maintenances, daily_records, expenses, rentals,
             renters, vehicles, users, organizations RESTART IDENTITY CASCADE`);
}

let hashed;
/** Crea un usuario (y su negocio si es admin/operator sin orgId). */
export async function createUser({ role = 'admin', username, email, orgId, status = 'active', orgName = 'Negocio Test' } = {}) {
  hashed ??= await hashPassword(PASSWORD);
  if (role !== 'superadmin' && !orgId) orgId = (await prisma.organization.create({ data: { name: orgName } })).id;
  return prisma.user.create({
    // El sistema siempre guarda usuario y correo en minúsculas.
    data: {
      username: (username ?? `${role}-${crypto.randomUUID().slice(0, 8)}`).toLowerCase(),
      email: email?.toLowerCase(),
      name: `Test ${role}`, role, orgId, status, passwordHash: hashed,
    },
  });
}

/** Devuelve un agente supertest con la sesión iniciada. */
export async function loginAs(user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ login: user.username, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login falló (${res.status}): ${JSON.stringify(res.body)}`);
  return agent;
}

export { prisma, request };
