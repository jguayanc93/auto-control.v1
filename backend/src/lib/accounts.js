// Utilidades compartidas para cuentas de usuario (superadmin → administradores, administrador → operadores).
import { prisma } from './prisma.js';
import { conflict } from './errors.js';

/** Verifica que usuario y correo estén libres; error 409 con el campo marcado. */
export async function ensureAvailable({ username, email }, exceptUserId) {
  const fields = {};
  if (username) {
    const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (u && u.id !== exceptUserId) fields.username = 'Ese usuario ya está en uso';
  }
  if (email) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u && u.id !== exceptUserId) fields.email = 'Ese correo ya está registrado';
  }
  if (Object.keys(fields).length) throw conflict(Object.values(fields)[0], { fields });
}
