import { z } from 'zod';

const lower = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v);
/** '' o espacios → undefined (para campos opcionales de formularios). */
export const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** Email normalizado: sin espacios y en minúsculas. */
export const emailField = z.preprocess(lower, z.email('Ingresa un correo válido').max(160));

/** Usuario para iniciar sesión: 3 a 30 caracteres, minúsculas, números, punto, guion o guion bajo. */
export const usernameField = z.preprocess(
  lower,
  z.string().regex(/^[a-z0-9._-]{3,30}$/, 'Usa de 3 a 30 caracteres: letras, números, punto o guion (sin espacios)'),
);

/** bcrypt solo usa los primeros 72 bytes: se limita a 72 caracteres. */
export const newPasswordField = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña no puede superar 72 caracteres');

export const loginSchema = z.object({
  /** Usuario o correo */
  login: z.preprocess(lower, z.string().min(1, 'Ingresa tu usuario o correo').max(160)),
  password: z.string().min(1, 'Ingresa tu contraseña').max(200),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual').max(200),
    newPassword: newPasswordField,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'La nueva contraseña debe ser distinta a la actual',
    path: ['newPassword'],
  });
