import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { addDays, todayISO } from '../src/lib/dates.js';
import { detectFileType, docStatus, safeFileName } from '../src/lib/documents.js';

const T = todayISO();
const PDF = Buffer.from('%PDF-1.4\n% documento de prueba\n%%EOF\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

let admin, adminAgent, opAgent, vehicle;
beforeEach(async () => {
  await resetDb();
  admin = await createUser({ role: 'admin', orgName: 'Negocio A' });
  adminAgent = await loginAs(admin);
  opAgent = await loginAs(await createUser({ role: 'operator', orgId: admin.orgId }));
  vehicle = (await adminAgent.post('/api/vehicles').send({ plate: 'ATA297', brand: 'Nissan', model: 'Sentra' })).body;
});

function upload(agent, { file = PDF, name = 'soat.pdf', type = 'soat', expiresOn = addDays(T, 200), ...extra } = {}) {
  const req = agent.post('/api/documents').field('vehicleId', extra.vehicleId ?? vehicle.id).field('type', type);
  if (expiresOn) req.field('expiresOn', expiresOn);
  for (const [k, v] of Object.entries(extra)) if (k !== 'vehicleId') req.field(k, v);
  return file ? req.attach('file', file, { filename: name }) : req;
}

describe('utilidades', () => {
  it('detecta el tipo real por los primeros bytes', () => {
    expect(detectFileType(PDF)).toBe('application/pdf');
    expect(detectFileType(PNG)).toBe('image/png');
    expect(detectFileType(JPG)).toBe('image/jpeg');
    expect(detectFileType(Buffer.from('<html>hola</html>'))).toBeNull();
  });

  it('estado según vencimiento (aviso 30 días antes)', () => {
    const d = (n) => new Date(`${addDays(T, n)}T00:00:00Z`);
    expect(docStatus(d(-1), T)).toBe('vencido');
    expect(docStatus(d(0), T)).toBe('por_vencer');
    expect(docStatus(d(30), T)).toBe('por_vencer');
    expect(docStatus(d(31), T)).toBe('vigente');
    expect(docStatus(null, T)).toBe('sin_fecha');
  });

  it('limpia el nombre del archivo y usa la extensión real', () => {
    expect(safeFileName('SOAT 2026 (copia).exe', 'application/pdf')).toBe('SOAT 2026 copia.pdf');
    expect(safeFileName('../../etc/passwd', 'image/png')).toBe('passwd.png');
    expect(safeFileName('C:\\Users\\x\\Foto Ñandú.jpeg', 'image/jpeg')).toBe('Foto Nandu.jpg');
  });
});

describe('subir y ver documentos', () => {
  it('acepta los tipos de gas y tarjeta de circulación; el número es opcional', async () => {
    for (const type of ['tarjeta_circulacion', 'revision_chip_gas', 'revision_quinquenal_gas']) {
      const res = await upload(opAgent, { type, notes: 'Copia simple' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ type, number: null, notes: 'Copia simple' });
    }
  });

  it('el operador sube un PDF; se guarda en la BD y se puede descargar igual', async () => {
    const res = await upload(opAgent, { number: 'SOAT-123' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'soat', number: 'SOAT-123', status: 'vigente', mimeType: 'application/pdf', sizeBytes: PDF.length, fileName: 'soat.pdf' });

    const file = await opAgent.get(`/api/documents/${res.body.id}/file`).buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(Buffer.compare(file.body, PDF)).toBe(0);

    const stored = await prisma.documentFile.findUnique({ where: { documentId: res.body.id } });
    expect(stored.sha256).toHaveLength(64);
    expect(await prisma.auditLog.count({ where: { entity: 'document', action: 'create', orgId: admin.orgId } })).toBe(1);
  });

  it('acepta fotos JPG y PNG', async () => {
    expect((await upload(opAgent, { file: JPG, name: 'foto.jpg', type: 'revision_tecnica' })).body.mimeType).toBe('image/jpeg');
    expect((await upload(opAgent, { file: PNG, name: 'captura.png', type: 'tarjeta_propiedad', expiresOn: '' })).body).toMatchObject({ mimeType: 'image/png', status: 'sin_fecha' });
  });

  it('rechaza archivos que no son PDF/JPG/PNG aunque tengan la extensión', async () => {
    const res = await upload(opAgent, { file: Buffer.from('<script>alert(1)</script>'), name: 'falso.pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.file).toMatch(/PDF, JPG o PNG/);
  });

  it('exige archivo y valida los datos', async () => {
    expect((await upload(opAgent, { file: null })).status).toBe(400);
    const res = await upload(opAgent, { type: 'x', issuedOn: addDays(T, 10), expiresOn: T });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields)).toContain('type');
  });

  it('rechaza archivos de más de 5 MB', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(opAgent, { file: big });
    expect(res.status).toBe(413);
  });

  it('lista primero los vencidos y por vencer, con días restantes', async () => {
    await upload(opAgent, { type: 'licencia', expiresOn: addDays(T, 300) });
    await upload(opAgent, { type: 'soat', expiresOn: addDays(T, -5) });
    await upload(opAgent, { type: 'revision_tecnica', expiresOn: addDays(T, 10) });
    const items = (await opAgent.get('/api/documents')).body.items;
    expect(items.map((d) => d.status)).toEqual(['vencido', 'por_vencer', 'vigente']);
    expect(items[0].daysToExpire).toBe(-5);
    expect(items[0].vehicle.plate).toBe('ATA297');

    const alerts = (await opAgent.get('/api/documents/alerts')).body;
    expect(alerts).toMatchObject({ expired: 1, expiring: 1 });
    expect((await opAgent.get('/api/documents').query({ status: 'vencido' })).body.items).toHaveLength(1);
  });
});

describe('permisos y aislamiento', () => {
  it('solo el admin edita y elimina; al eliminar deja de verse pero se conserva', async () => {
    const doc = (await upload(opAgent)).body;
    expect((await opAgent.patch(`/api/documents/${doc.id}`).send({ number: 'X' })).status).toBe(403);
    expect((await opAgent.delete(`/api/documents/${doc.id}`)).status).toBe(403);

    const edited = await adminAgent.patch(`/api/documents/${doc.id}`).send({ number: 'SOAT-999', expiresOn: addDays(T, 5) });
    expect(edited.body).toMatchObject({ number: 'SOAT-999', status: 'por_vencer' });
    const log = await prisma.auditLog.findFirst({ where: { entity: 'document', action: 'update' } });
    expect(log.changes.numero).toEqual({ antes: null, despues: 'SOAT-999' });

    expect((await adminAgent.delete(`/api/documents/${doc.id}`)).status).toBe(204);
    expect((await adminAgent.get(`/api/documents/${doc.id}`)).status).toBe(404);
    expect((await adminAgent.get(`/api/documents/${doc.id}/file`)).status).toBe(404);
    expect(await prisma.documentFile.count()).toBe(1); // el archivo se conserva
  });

  it('otro negocio no ve, descarga ni sube a vehículos ajenos', async () => {
    const doc = (await upload(opAgent)).body;
    const agentB = await loginAs(await createUser({ role: 'admin', orgName: 'Negocio B' }));
    expect((await agentB.get('/api/documents')).body.items).toHaveLength(0);
    expect((await agentB.get(`/api/documents/${doc.id}/file`)).status).toBe(404);
    expect((await upload(agentB)).status).toBe(404);
  });

  it('un vehículo con documentos no se puede eliminar', async () => {
    await upload(opAgent);
    expect((await adminAgent.delete(`/api/vehicles/${vehicle.id}`)).status).toBe(409);
  });
});
