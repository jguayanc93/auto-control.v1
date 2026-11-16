// Sesión del usuario en el navegador y permisos para mostrar/ocultar botones.
// OJO: esto es solo para la interfaz. Quien realmente protege los datos es el backend.
import { api } from './api.js';

export const ROLE_LABEL = { superadmin: 'Superadministrador', admin: 'Administrador', operator: 'Operador' };

/** Página de inicio según el rol. */
export const HOME = { superadmin: '/superadmin.html', admin: '/inicio.html', operator: '/inicio.html' };

/** Matriz de permisos (debe coincidir con requireRole del backend). */
const PERMS = {
  'records:create': ['admin', 'operator'],
  'rentals:finish': ['admin', 'operator'],
  'records:edit': ['admin'],
  'records:delete': ['admin'],
  'users:manage': ['admin'],
  'audit:view': ['admin', 'superadmin'],
  'admins:manage': ['superadmin'],
};

/** ¿El usuario puede hacer esta acción? */
export function can(user, perm) {
  return Boolean(user && PERMS[perm]?.includes(user.role));
}

let current;
/** Carga la sesión (una vez por página). Si no hay sesión, redirige al login. */
export function loadSession() {
  current ??= api.get('/auth/me');
  return current;
}

export async function logout() {
  try { await api.post('/auth/logout', undefined, { redirectOn401: false }); } catch { /* igual se sale */ }
  location.href = '/login.html';
}
