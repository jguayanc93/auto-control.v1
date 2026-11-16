import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.17.5/dist/module.esm.min.js';
import { api } from '../api.js';
import { HOME } from '../session.js';

/** Solo se permite volver a rutas internas (evita redirecciones a otros sitios). */
function safeNext() {
  const next = new URLSearchParams(location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : null;
}

Alpine.data('login', () => ({
  login: '',
  password: '',
  show: false,
  loading: false,
  error: '',
  fields: {},

  async init() {
    // Si ya tiene sesión abierta, entrar directo.
    try {
      const s = await api.get('/auth/me', { redirectOn401: false });
      this.go(s.user.role);
    } catch { /* sin sesión: mostrar formulario */ }
  },

  go(role) {
    location.replace(safeNext() ?? HOME[role]);
  },

  async submit() {
    this.error = '';
    this.fields = {};
    if (!this.login.trim()) this.fields.login = 'Ingresa tu usuario o correo';
    if (!this.password) this.fields.password = 'Ingresa tu contraseña';
    if (Object.keys(this.fields).length) return;

    this.loading = true;
    try {
      const s = await api.post('/auth/login', { login: this.login, password: this.password }, { redirectOn401: false });
      this.go(s.user.role);
    } catch (err) {
      this.error = err.message;
      this.fields = err.fields ?? {};
      this.loading = false;
    }
  },
}));

Alpine.start();
document.documentElement.classList.add('ready');
