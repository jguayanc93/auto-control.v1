import { z } from 'zod';
import { date, emptyToNull, optionalText, uuidField } from '../../lib/fields.js';

export const DOCUMENT_TYPES = [
  'soat', 'revision_tecnica', 'tarjeta_propiedad', 'tarjeta_circulacion',
  'revision_chip_gas', 'revision_quinquenal_gas', 'contrato', 'licencia', 'otro',
];
export const DOC_STATUSES = ['vencido', 'por_vencer', 'vigente', 'sin_fecha'];

const type = z.enum(DOCUMENT_TYPES, { error: 'Selecciona el tipo de documento' });
/** Fecha opcional ('' → null para borrarla al editar). */
const optionalDate = (label) => z.preprocess(emptyToNull, date(label).nullable().optional());

const fields = {
  type,
  /** Ya no se pide en el formulario; se conserva para documentos anteriores. */
  number: optionalText(40),
  issuedOn: optionalDate('la fecha de emisión'),
  expiresOn: optionalDate('la fecha de vencimiento'),
  notes: optionalText(1000),
};

const datesInOrder = (d) => !d.issuedOn || !d.expiresOn || d.issuedOn <= d.expiresOn;
const datesMsg = { message: 'El vencimiento no puede ser anterior a la emisión', path: ['expiresOn'] };

/** Campos de texto que llegan junto al archivo (multipart). */
export const createDocumentSchema = z.object({ vehicleId: uuidField('Selecciona un vehículo'), ...fields }).refine(datesInOrder, datesMsg);

export const updateDocumentSchema = z
  .object({ ...fields, type: type.optional() })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'No hay cambios para guardar' })
  .refine(datesInOrder, datesMsg);

export const listDocumentsQuery = z.object({
  vehicleId: z.uuid().optional(),
  status: z.enum(DOC_STATUSES).optional(),
});
