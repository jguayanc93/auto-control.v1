// Pestaña "Conductores" de la página de Vehículos.
import { confirmAction, toast } from '../app.js';
import { api } from '../api.js';

const blankRenter = () => ({ fullName: '', docNumber: '', phone: '', licenseNumber: '', notes: '' });
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function rentersPart() {
  return {
    renters: [],
    loadingRenters: true,
    rq: '',
    renter: null,
    rnForm: blankRenter(),
    rnMode: 'create',

    async loadRenters() {
      try {
        this.renters = (await api.get('/renters')).items;
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.loadingRenters = false;
      }
    },

    get filteredRenters() {
      const q = norm(this.rq.trim());
      if (!q) return this.renters;
      return this.renters.filter((r) => norm(`${r.fullName} ${r.docNumber ?? ''} ${r.phone ?? ''}`).includes(q));
    },

    async openRenter(r) {
      this.renter = { ...r, rentals: null };
      this.sheet = 'renter';
      try {
        this.renter = await api.get(`/renters/${r.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    },

    openRenterCreate() {
      this.rnMode = 'create';
      this.rnForm = blankRenter();
      this.fields = {};
      this.back = null;
      this.sheet = 'renterForm';
    },

    openRenterEdit() {
      const r = this.renter;
      this.rnMode = 'edit';
      this.rnForm = { fullName: r.fullName, docNumber: r.docNumber ?? '', phone: r.phone ?? '', licenseNumber: r.licenseNumber ?? '', notes: r.notes ?? '' };
      this.fields = {};
      this.back = 'renter';
      this.sheet = 'renterForm';
    },

    async saveRenter() {
      this.saving = true;
      this.fields = {};
      try {
        if (this.rnMode === 'create') {
          const r = await api.post('/renters', this.rnForm);
          await this.loadRenters();
          this.sheet = null;
          toast(`Conductor ${r.fullName} registrado`);
        } else {
          await api.patch(`/renters/${this.renter.id}`, this.rnForm);
          [this.renter] = await Promise.all([api.get(`/renters/${this.renter.id}`), this.loadRenters()]);
          this.sheet = 'renter';
          toast('Cambios guardados');
        }
      } catch (err) {
        this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    async deleteRenter() {
      const r = this.renter;
      const ok = await confirmAction({ title: `¿Eliminar a ${r.fullName}?`, message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true });
      if (!ok) return;
      this.busy = true;
      try {
        await api.del(`/renters/${r.id}`);
        this.renters = this.renters.filter((x) => x.id !== r.id);
        this.sheet = null;
        toast('Conductor eliminado');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.busy = false;
      }
    },
  };
}
