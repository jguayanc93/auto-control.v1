import { z } from 'zod';
import { optionalText, text } from '../../lib/fields.js';

const phone = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/[\s()-]/g, '') || null : v),
  z.string().regex(/^\+?\d{6,15}$/, 'Teléfono inválido').nullable().optional(),
);

export const renterFields = {
  fullName: text('el nombre del conductor', 120, 2),
  docNumber: optionalText(20),
  phone,
  licenseNumber: optionalText(20),
  notes: optionalText(1000),
};

export const createRenterSchema = z.object(renterFields);

export const updateRenterSchema = z
  .object({ ...renterFields, fullName: renterFields.fullName.optional() })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'No hay cambios para guardar' });

export const listRentersQuery = z.object({ q: z.string().trim().max(60).optional() });
