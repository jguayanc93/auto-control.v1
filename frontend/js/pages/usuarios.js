// Equipo del negocio: el administrador gestiona a sus operadores.
import { confirmAction, startPage, toast } from '../app.js';
import { api } from '../api.js';
import { icon } from '../ui/icons.js';
import { credentialsMixin } from '../ui/credentials.js';
import { mix } from '../utils/mix.js';
import { dateTime, initials } from '../utils/format.js';

const URL = '/users';
const blankForm = () => ({ name: '', username: '', email: '', password: '' });
const byName = (a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'es') : a.role === 'admin' ? -1 : 1);

startPage({
  page: 'usuarios',
  title: 'Usuarios',
  roles: ['admin'],
  component: () => mix(credentialsMixin(), {
    items: [],
    loading: true,
    /** null | 'form' | 'detail' | 'credentials' */
    sheet: null,
    mode: 'create',
    current: null,
    form: blankForm(),
    fields: {},
    saving: false,
    busy: false,
    icons: {
      plus: icon('plus'), x: icon('x'), users: icon('users', 'size-6'), lock: icon('lock'), edit: icon('pencil'),
      alert: icon('alert'), check: icon('check', 'size-4'), cross: icon('x', 'size-4'), chevron: icon('chevronRight', 'size-4'),
      checkLg: icon('check'),
    },
    dateTime,
    initials,

    async init() {
      this.$watch('sheet', (v) => document.body.classList.toggle('overflow-hidden', Boolean(v)));
      try {
        this.items = (await api.get(URL)).items;
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    get operators() {
      return this.items.filter((u) => u.role === 'operator');
    },

    get me() {
      return this.items.find((u) => u.id === this.user.id);
    },

    lastSeen(u) {
      return u.lastLoginAt ? `Último acceso: ${dateTime(u.lastLoginAt)}` : 'Aún no ingresa';
    },

    // ───── Crear / editar ─────
    openCreate() {
      this.mode = 'create';
      this.form = blankForm();
      this.fields = {};
      this.sheet = 'form';
    },

    openDetail(u) {
      this.current = u;
      this.sheet = 'detail';
    },

    openEdit() {
      const u = this.current;
      this.mode = 'edit';
      this.form = { name: u.name, username: u.username, email: u.email ?? '', password: '' };
      this.fields = {};
      this.sheet = 'form';
    },

    closeForm() {
      this.sheet = this.mode === 'edit' ? 'detail' : null;
    },

    async save() {
      this.saving = true;
      this.fields = {};
      try {
        if (this.mode === 'create') {
          const r = await api.post(URL, this.form);
          this.items = [...this.items, r.user].sort(byName);
          if (r.credentials.temporaryPassword) {
            this.showCredentials({ username: r.credentials.username, password: r.credentials.temporaryPassword, recipientName: r.user.name, context: `Negocio: ${this.org.name}` });
          } else {
            this.sheet = null;
            toast(`Operador ${r.user.name} creado`);
          }
        } else {
          const { name, email } = this.form;
          this.replace(await api.patch(`${URL}/${this.current.id}`, { name, email }));
          this.sheet = 'detail';
          toast('Cambios guardados');
        }
      } catch (err) {
        this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    replace(u) {
      this.items = this.items.map((x) => (x.id === u.id ? u : x)).sort(byName);
      if (this.current?.id === u.id) this.current = u;
    },

    // ───── Suspender / reactivar ─────
    async toggleStatus() {
      const u = this.current;
      const suspend = u.status === 'active';
      const ok = await confirmAction(suspend
        ? { title: `¿Suspender a ${u.name}?`, message: 'Se cerrará su sesión y no podrá ingresar hasta que lo reactives. Lo que registró se conserva.', confirmText: 'Suspender', danger: true }
        : { title: `¿Reactivar a ${u.name}?`, message: 'Podrá volver a iniciar sesión con su usuario y contraseña.', confirmText: 'Reactivar' });
      if (!ok) return;

      this.busy = true;
      try {
        this.replace(await api.post(`${URL}/${u.id}/${suspend ? 'suspend' : 'activate'}`));
        toast(suspend ? 'Operador suspendido' : 'Operador reactivado');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.busy = false;
      }
    },

    // ───── Contraseña ─────
    async resetPassword() {
      const u = this.current;
      const ok = await confirmAction({
        title: '¿Restablecer contraseña?',
        message: `Se generará una contraseña nueva para ${u.name} (@${u.username}) y se cerrarán sus sesiones abiertas.`,
        confirmText: 'Restablecer',
      });
      if (!ok) return;

      this.busy = true;
      try {
        const r = await api.post(`${URL}/${u.id}/reset-password`, {});
        this.showCredentials({ username: r.username, password: r.temporaryPassword, recipientName: u.name, context: `Negocio: ${this.org.name}` });
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.busy = false;
      }
    },
  }),
});
