// Documentos de los vehículos: subir (foto o PDF), ver, alertas de vencimiento.
import { confirmAction, startPage, toast } from '../app.js';
import { api } from '../api.js';
import { icon } from '../ui/icons.js';
import { date, DOC_STATUS, DOC_TYPE, expiryText, plate, todayISO } from '../utils/format.js';
import { compressImage, fileSize } from '../utils/image-compress.js';

const vehicleParam = new URLSearchParams(location.search).get('v');
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const blankForm = () => ({ vehicleId: vehicleParam ?? '', type: 'soat', issuedOn: '', expiresOn: '', notes: '' });

startPage({
  page: 'documentos',
  title: 'Documentos',
  component: () => ({
    items: [],
    vehicles: [],
    loading: true,
    filter: 'all',
    vehicleFilter: vehicleParam ?? '',
    q: '',
    /** null | 'detail' | 'upload' | 'edit' */
    sheet: null,
    current: null,
    form: blankForm(),
    file: null,
    preview: null,
    preparing: false,
    fields: {},
    saving: false,
    today: todayISO(),
    FILTERS: [['all', 'Todos'], ['vencido', 'Vencidos'], ['por_vencer', 'Por vencer'], ['vigente', 'Vigentes'], ['sin_fecha', 'Sin fecha']],
    DOC_TYPE,
    DOC_STATUS,
    fmt: { date, plate, expiryText, fileSize },
    icons: {
      plus: icon('plus'), x: icon('x'), file: icon('file', 'size-6'), fileSm: icon('file', 'size-5'), search: icon('search', 'size-4'),
      camera: icon('camera'), upload: icon('upload'), edit: icon('pencil'), trash: icon('trash'), alert: icon('alert', 'size-4'),
      eye: icon('eye'), download: icon('download'),
    },

    async init() {
      this.$watch('sheet', (v) => document.body.classList.toggle('overflow-hidden', Boolean(v)));
      this.$watch('vehicleFilter', (v) => history.replaceState(null, '', v ? `?v=${v}` : location.pathname));
      await Promise.all([this.load(), this.loadVehicles()]);
    },

    async load() {
      try {
        this.items = (await api.get('/documents')).items;
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    async loadVehicles() {
      try {
        this.vehicles = (await api.get('/vehicles')).items;
      } catch { /* el selector quedará vacío */ }
    },

    count(status) {
      const base = this.vehicleFilter ? this.items.filter((d) => d.vehicleId === this.vehicleFilter) : this.items;
      return status === 'all' ? base.length : base.filter((d) => d.status === status).length;
    },

    get filtered() {
      const q = norm(this.q.trim()).replace(/-/g, '');
      return this.items.filter((d) =>
        (this.filter === 'all' || d.status === this.filter) &&
        (!this.vehicleFilter || d.vehicleId === this.vehicleFilter) &&
        (!q || norm(`${d.vehicle.plate} ${DOC_TYPE[d.type]} ${d.number ?? ''}`).includes(q)));
    },

    get attention() {
      return { expired: this.count('vencido'), expiring: this.count('por_vencer') };
    },

    fileUrl(d, download = false) {
      return `/api/documents/${d.id}/file${download ? '?download=1' : ''}`;
    },

    isImage(d) {
      return d?.mimeType?.startsWith('image/');
    },

    // ───── Detalle ─────
    openDetail(d) {
      this.current = d;
      this.sheet = 'detail';
    },

    // ───── Subir ─────
    openUpload() {
      this.form = blankForm();
      if (!this.form.vehicleId && this.vehicles.length === 1) this.form.vehicleId = this.vehicles[0].id;
      this.clearFile();
      this.fields = {};
      this.sheet = 'upload';
    },

    clearFile() {
      if (this.preview) URL.revokeObjectURL(this.preview);
      this.file = null;
      this.preview = null;
    },

    async pickFile(event) {
      const picked = event.target.files?.[0];
      event.target.value = ''; // permite volver a elegir el mismo archivo
      if (!picked) return;
      const ok = ['application/pdf', 'image/jpeg', 'image/png'].includes(picked.type) || picked.type.startsWith('image/');
      if (!ok) return toast('Solo se aceptan PDF, JPG o PNG', 'error');
      this.preparing = true;
      try {
        const file = await compressImage(picked);
        if (file.size > 5 * 1024 * 1024) return toast('El archivo supera los 5 MB', 'error');
        this.clearFile();
        this.file = file;
        this.preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
        delete this.fields.file;
      } finally {
        this.preparing = false;
      }
    },

    async upload() {
      this.fields = {};
      if (!this.file) this.fields.file = 'Toma una foto o elige un archivo';
      if (!this.form.vehicleId) this.fields.vehicleId = 'Selecciona un vehículo';
      if (Object.keys(this.fields).length) return;

      const form = new FormData();
      for (const [k, v] of Object.entries(this.form)) if (v !== '') form.append(k, v);
      form.append('file', this.file, this.file.name);

      this.saving = true;
      try {
        const doc = await api.upload('/documents', form);
        this.items = [doc, ...this.items];
        await this.load();
        this.clearFile();
        this.sheet = null;
        toast(`${DOC_TYPE[doc.type]} de ${plate(doc.vehicle.plate)} guardado`);
      } catch (err) {
        this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    // ───── Editar / eliminar (admin) ─────
    openEdit() {
      const d = this.current;
      this.form = { vehicleId: d.vehicleId, type: d.type, issuedOn: d.issuedOn ?? '', expiresOn: d.expiresOn ?? '', notes: d.notes ?? '' };
      this.fields = {};
      this.sheet = 'edit';
    },

    async saveEdit() {
      this.saving = true;
      this.fields = {};
      const { vehicleId, ...data } = this.form;
      try {
        this.current = await api.patch(`/documents/${this.current.id}`, data);
        await this.load();
        this.sheet = 'detail';
        toast('Documento actualizado');
      } catch (err) {
        this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    async remove() {
      const d = this.current;
      const ok = await confirmAction({
        title: `¿Eliminar ${DOC_TYPE[d.type]} de ${plate(d.vehicle.plate)}?`,
        message: 'Dejará de mostrarse. Quedará registrado en la bitácora.', confirmText: 'Eliminar', danger: true,
      });
      if (!ok) return;
      try {
        await api.del(`/documents/${d.id}`);
        this.items = this.items.filter((x) => x.id !== d.id);
        this.sheet = null;
        toast('Documento eliminado');
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  }),
});
