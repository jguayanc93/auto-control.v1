import { z } from 'zod';
import { emailField, emptyToUndefined, newPasswordField, usernameField } from '../auth/auth.schema.js';

export const idParams = z.object({ id: z.uuid('Identificador inválido') });

const personName = z.string().trim().min(2, 'Ingresa el nombre completo').max(120, 'Máximo 120 caracteres');

export const createOperatorSchema = z.object({
  name: personName,
  username: usernameField,
  email: z.preprocess(emptyToUndefined, emailField.optional()),
  /** Si se omite se genera una contraseña temporal. */
  password: z.preprocess(emptyToUndefined, newPasswordField.optional()),
});

export const updateOperatorSchema = z
  .object({
    name: personName.optional(),
    /** '' borra el correo */
    email: z.preprocess((v) => (v === '' ? null : v), emailField.nullable().optional()),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'No hay cambios para guardar' });

export const resetPasswordSchema = z.object({
  password: z.preprocess(emptyToUndefined, newPasswordField.optional()),
});
