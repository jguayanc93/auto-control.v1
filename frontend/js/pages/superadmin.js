// Panel del superadmin: negocios (cada uno con su administrador).
import { confirmAction, startPage, toast } from '../app.js';
import { api } from '../api.js';
import { icon } from '../ui/icons.js';
import { credentialsMixin } from '../ui/credentials.js';
import { mix } from '../utils/mix.js';
import { dateTime, initials } from '../utils/format.js';

const URL = '/superadmin/businesses';
const blankForm = () => ({ businessName: '', adminName: '', username: '', email: '', password: '' });
const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const byName = (a, b) => a.name.localeCompare(b.name, 'es');

startPage({
  page: 'superadmin',
  title: 'Negocios',
  roles: ['superadmin'],
  component: () => mix(credentialsMixin(), {
    items: [],
    loading: true,
    q: '',
    filter: 'all',
    /** null | 'form' | 'detail' | 'credentials' */
    sheet: null,
    mode: 'create',
    current: null,
    form: blankForm(),
    fields: {},
    saving: false,
    busy: false,
    icons: {
      plus: icon('plus'), x: icon('x'), building: icon('building', 'size-6'),
      car: icon('car', 'size-4'), users: icon('users', 'size-4'), lock: icon('lock'), edit: icon('pencil'),
      alert: icon('alert'), check: icon('check'),
    },
    dateTime,
    initials,

    async init() {
      this.$watch('sheet', (v) => document.body.classList.toggle('overflow-hidden', Boolean(v)));
      await this.load();
    },

    async load() {
      this.loading = true;
      try {
        this.items = (await api.get(URL)).items;
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    get filtered() {
      const q = normalize(this.q.trim());
      return this.items.filter((b) =>
        (this.filter === 'all' || b.status === this.filter) &&
        (!q || normalize(`${b.name} ${b.admin?.name} ${b.admin?.username} ${b.admin?.email}`).includes(q)));
    },

    get stats() {
      const active = this.items.filter((b) => b.status === 'active').length;
      return {
        total: this.items.length,
        active,
        suspended: this.items.length - active,
        vehicles: this.items.reduce((s, b) => s + b.counts.vehicles, 0),
      };
    },

    // ───── Crear / editar ─────
    openCreate() {
      this.mode = 'create';
      this.form = blankForm();
      this.fields = {};
      this.sheet = 'form';
    },

    openDetail(b) {
      this.current = b;
      this.sheet = 'detail';
    },

    openEdit() {
      const b = this.current;
      this.mode = 'edit';
      this.form = {
        businessName: b.name, adminName: b.admin?.name ?? '',
        username: b.admin?.username ?? '', email: b.admin?.email ?? '', password: '',
      };
      this.fields = {};
      this.sheet = 'form';
    },

    async save() {
      this.saving = true;
      this.fields = {};
      try {
        if (this.mode === 'create') {
          const r = await api.post(URL, this.form);
          this.items = [...this.items, r.business].sort(byName);
          if (r.credentials.temporaryPassword) {
            this.showCredentials({
              username: r.credentials.username, password: r.credentials.temporaryPassword,
              recipientName: r.business.admin.name, context: `Negocio: ${r.business.name}`,
            });
          } else {
            this.sheet = null;
            toast(`Negocio "${r.business.name}" creado`);
          }
        } else {
          const { businessName, adminName, email } = this.form;
          const r = await api.patch(`${URL}/${this.current.id}`, { businessName, adminName, email });
          this.replace(r);
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

    replace(b) {
      this.items = this.items.map((x) => (x.id === b.id ? b : x)).sort(byName);
      if (this.current?.id === b.id) this.current = b;
    },

    // ───── Suspender / reactivar ─────
    async toggleStatus() {
      const b = this.current;
      const suspend = b.status === 'active';
      const ok = await confirmAction(suspend
        ? { title: `¿Suspender "${b.name}"?`, message: 'Se cerrarán sus sesiones y ni el administrador ni sus operadores podrán ingresar hasta que lo reactives. Sus datos se conservan.', confirmText: 'Suspender', danger: true }
        : { title: `¿Reactivar "${b.name}"?`, message: 'El administrador y sus operadores podrán volver a iniciar sesión.', confirmText: 'Reactivar' });
      if (!ok) return;

      this.busy = true;
      try {
        this.replace(await api.post(`${URL}/${b.id}/${suspend ? 'suspend' : 'activate'}`));
        toast(suspend ? 'Negocio suspendido' : 'Negocio reactivado');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.busy = false;
      }
    },

    // ───── Contraseña ─────
    async resetPassword() {
      const b = this.current;
      const ok = await confirmAction({
        title: '¿Restablecer contraseña?',
        message: `Se generará una contraseña nueva para ${b.admin.name} (@${b.admin.username}) y se cerrarán sus sesiones abiertas.`,
        confirmText: 'Restablecer',
      });
      if (!ok) return;

      this.busy = true;
      try {
        const r = await api.post(`${URL}/${b.id}/reset-password`, {});
        this.showCredentials({ username: r.username, password: r.temporaryPassword, recipientName: b.admin.name, context: `Negocio: ${b.name}` });
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.busy = false;
      }
    },
  }),
});
