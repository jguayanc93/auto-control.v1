import { z } from 'zod';
import { emailField, emptyToUndefined, newPasswordField, usernameField } from '../auth/auth.schema.js';

export const idParams = z.object({ id: z.uuid('Identificador inválido') });

const businessName = z.string().trim().min(2, 'Ingresa el nombre del negocio').max(120, 'Máximo 120 caracteres');
const personName = z.string().trim().min(2, 'Ingresa el nombre del administrador').max(120, 'Máximo 120 caracteres');

export const createBusinessSchema = z.object({
  businessName,
  adminName: personName,
  username: usernameField,
  email: z.preprocess(emptyToUndefined, emailField.optional()),
  /** Si se omite se genera una contraseña temporal. */
  password: z.preprocess(emptyToUndefined, newPasswordField.optional()),
});

export const updateBusinessSchema = z
  .object({
    businessName: businessName.optional(),
    adminName: personName.optional(),
    /** '' borra el correo */
    email: z.preprocess((v) => (v === '' ? null : v), emailField.nullable().optional()),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'No hay cambios para guardar' });

export const resetPasswordSchema = z.object({
  password: z.preprocess(emptyToUndefined, newPasswordField.optional()),
});
