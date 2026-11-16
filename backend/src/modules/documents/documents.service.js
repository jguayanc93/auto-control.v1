// Documentos de los vehículos (SOAT, revisión técnica, tarjeta de propiedad...).
// El archivo se guarda DENTRO de la BD (tabla document_files, binario) y se sirve con su tipo real.
// Subir: admin y operador. Editar datos y eliminar: solo admin (eliminación lógica: el archivo se conserva).
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { fromDbDate, toDbDate, todayISO } from '../../lib/dates.js';
import { daysToExpire, detectFileType, docStatus, safeFileName, sha256 } from '../../lib/documents.js';

export const TYPE_LABEL = {
  soat: 'SOAT', revision_tecnica: 'Revisión técnica', tarjeta_propiedad: 'Tarjeta de propiedad',
  tarjeta_circulacion: 'Tarjeta de circulación', revision_chip_gas: 'Revisión anual chip de gas',
  revision_quinquenal_gas: 'Revisión quinquenal balón de gas',
  contrato: 'Contrato', licencia: 'Licencia', otro: 'Otro',
};

const INCLUDE = { vehicle: { select: { id: true, plate: true, brand: true, model: true } }, createdBy: { select: { name: true } } };

export function documentDTO(d, today = todayISO()) {
  return {
    id: d.id,
    vehicleId: d.vehicleId,
    vehicle: d.vehicle,
    type: d.type,
    number: d.number,
    issuedOn: fromDbDate(d.issuedOn),
    expiresOn: fromDbDate(d.expiresOn),
    status: docStatus(d.expiresOn, today),
    daysToExpire: daysToExpire(d.expiresOn, today),
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    notes: d.notes,
    createdBy: d.createdBy?.name ?? null,
    createdAt: d.createdAt,
  };
}

const auditView = (d) => ({
  vehiculo: d.vehicle?.plate,
  tipo: TYPE_LABEL[d.type],
  numero: d.number,
  emision: fromDbDate(d.issuedOn),
  vencimiento: fromDbDate(d.expiresOn),
  archivo: d.fileName,
  observaciones: d.notes,
});

async function findDocument(ctx, id) {
  const d = await prisma.document.findFirst({ where: { id, orgId: ctx.orgId, deletedAt: null }, include: INCLUDE });
  if (!d) throw notFound('Documento no encontrado');
  return d;
}

/** Orden: primero los que requieren atención (vencidos, por vencer), luego por fecha de vencimiento. */
const PRIORITY = { vencido: 0, por_vencer: 1, vigente: 2, sin_fecha: 3 };

export async function list(ctx, { vehicleId, status } = {}) {
  const today = todayISO();
  const docs = await prisma.document.findMany({
    where: { orgId: ctx.orgId, deletedAt: null, vehicleId },
    include: INCLUDE,
    orderBy: [{ expiresOn: 'asc' }, { createdAt: 'desc' }],
  });
  return docs
    .map((d) => documentDTO(d, today))
    .filter((d) => !status || d.status === status)
    .sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status]);
}

export async function get(ctx, id) {
  return documentDTO(await findDocument(ctx, id));
}

/**
 * @param {object} data  campos validados
 * @param {{ buffer: Buffer, originalname: string } | undefined} file  archivo de multer
 */
export async function create(ctx, data, file) {
  if (!file?.buffer?.length) throw badRequest('Adjunta el archivo del documento', { fields: { file: 'Adjunta un PDF o una foto' } });
  const mimeType = detectFileType(file.buffer);
  if (!mimeType) throw badRequest('Solo se aceptan archivos PDF, JPG o PNG', { fields: { file: 'Formato no permitido (usa PDF, JPG o PNG)' } });

  const vehicle = await prisma.vehicle.findFirst({ where: { id: data.vehicleId, orgId: ctx.orgId }, select: { id: true } });
  if (!vehicle) throw notFound('Vehículo no encontrado');

  return prisma.$transaction(async (tx) => {
    const d = await tx.document.create({
      data: {
        orgId: ctx.orgId, vehicleId: vehicle.id, createdById: ctx.userId,
        type: data.type, number: data.number, notes: data.notes,
        issuedOn: data.issuedOn ? toDbDate(data.issuedOn) : null,
        expiresOn: data.expiresOn ? toDbDate(data.expiresOn) : null,
        fileName: safeFileName(file.originalname, mimeType), mimeType, sizeBytes: file.buffer.length,
        file: { create: { data: file.buffer, sha256: sha256(file.buffer) } },
      },
      include: INCLUDE,
    });
    await audit(tx, { ctx, action: 'create', entity: 'document', entityId: d.id, changes: auditView(d) });
    return documentDTO(d);
  });
}

export async function update(ctx, id, data) {
  const before = await findDocument(ctx, id);
  const merged = {
    issuedOn: data.issuedOn !== undefined ? data.issuedOn : fromDbDate(before.issuedOn),
    expiresOn: data.expiresOn !== undefined ? data.expiresOn : fromDbDate(before.expiresOn),
  };
  if (merged.issuedOn && merged.expiresOn && merged.issuedOn > merged.expiresOn) {
    throw badRequest('El vencimiento no puede ser anterior a la emisión', { fields: { expiresOn: 'Debe ser posterior a la emisión' } });
  }

  return prisma.$transaction(async (tx) => {
    const after = await tx.document.update({
      where: { id },
      data: {
        type: data.type, number: data.number, notes: data.notes,
        issuedOn: data.issuedOn === undefined ? undefined : data.issuedOn ? toDbDate(data.issuedOn) : null,
        expiresOn: data.expiresOn === undefined ? undefined : data.expiresOn ? toDbDate(data.expiresOn) : null,
      },
      include: INCLUDE,
    });
    const changes = diff(auditView(before), auditView(after));
    if (Object.keys(changes).length) await audit(tx, { ctx, action: 'update', entity: 'document', entityId: id, changes });
    return documentDTO(after);
  });
}

/** Eliminación lógica: deja de verse, pero el archivo y el historial se conservan. */
export async function remove(ctx, id) {
  const d = await findDocument(ctx, id);
  await prisma.$transaction([
    prisma.document.update({ where: { id }, data: { deletedAt: new Date() } }),
    audit(prisma, { ctx, action: 'delete', entity: 'document', entityId: id, changes: auditView(d) }),
  ]);
}

/** Archivo para ver o descargar. */
export async function getFile(ctx, id) {
  const d = await prisma.document.findFirst({
    where: { id, orgId: ctx.orgId, deletedAt: null },
    select: { fileName: true, mimeType: true, file: { select: { data: true } } },
  });
  if (!d?.file) throw notFound('Documento no encontrado');
  return { fileName: d.fileName, mimeType: d.mimeType, data: Buffer.from(d.file.data) };
}

/** Conteo para alertas (Inicio). */
export async function alerts(ctx) {
  const docs = await list(ctx);
  return {
    expired: docs.filter((d) => d.status === 'vencido').length,
    expiring: docs.filter((d) => d.status === 'por_vencer').length,
    items: docs.filter((d) => d.status === 'vencido' || d.status === 'por_vencer'),
  };
}
