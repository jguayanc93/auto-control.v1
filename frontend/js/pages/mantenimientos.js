// Mantenimiento: próximos servicios (alertas por km/fecha) + historial con costos.
import { confirmAction, startPage, toast } from '../app.js';
import { api } from '../api.js';
import { icon } from '../ui/icons.js';
import { date, km, MAINT_STATUS, MAINT_TYPES, money, monthLabel, nextText, plate, todayISO } from '../utils/format.js';

const params = new URLSearchParams(location.search);
const vehicleParam = params.get('v');
const cents = (v) => Math.round(Number(String(v ?? '').replace(',', '.') || 0) * 100);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const blankForm = (vehicleId = vehicleParam ?? '') => ({
  vehicleId, doneOn: todayISO(), type: '', km: '', partsCost: '', laborCost: '', workshop: '', detail: '', nextKm: '', nextDate: '',
});

/** '2026-11-16' + 3 meses → '2027-02-16' (si el día no existe, último día del mes). */
function addMonthsISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}

startPage({
  page: 'mantenimientos',
  title: 'Mantenimiento',
  component: () => ({
    items: [],
    upcoming: [],
    /** Otros gastos (calendario de cobros), para la pestaña "Gastos por mes" */
    expenses: [],
    vehicles: [],
    loading: true,
    /** 'proximos' | 'historial' | 'gastos' */
    tab: 'proximos',
    vehicleFilter: vehicleParam ?? '',
    q: '',
    /** null | 'detail' | 'form' */
    sheet: null,
    mode: 'create',
    current: null,
    form: blankForm(),
    fields: {},
    saving: false,
    today: todayISO(),
    MAINT_STATUS,
    MAINT_TYPES,
    fmt: { date, km, money, plate, nextText, monthLabel },
    icons: {
      plus: icon('plus'), x: icon('x'), wrench: icon('wrench', 'size-6'), wrenchSm: icon('wrench', 'size-5'), search: icon('search', 'size-4'),
      edit: icon('pencil'), trash: icon('trash'), download: icon('download', 'size-4'), alert: icon('alert', 'size-4'), again: icon('plus', 'size-4'),
    },

    async init() {
      this.$watch('sheet', (v) => document.body.classList.toggle('overflow-hidden', Boolean(v)));
      this.$watch('vehicleFilter', (v) => history.replaceState(null, '', v ? `?v=${v}` : location.pathname));
      await Promise.all([this.load(), this.loadVehicles()]);
      if (!this.upcoming.length && this.items.length) this.tab = 'historial';
      // Enlaces desde el calendario: ?m=<id> abre el detalle, ?nuevo=1 abre el formulario
      const open = params.get('m') && this.items.find((m) => m.id === params.get('m'));
      if (open) this.openDetail(open);
      else if (params.get('nuevo')) this.openCreate();
      if (open || params.get('nuevo')) history.replaceState(null, '', vehicleParam ? `?v=${vehicleParam}` : location.pathname);
    },

    async load() {
      try {
        const [history, next, expenses] = await Promise.all([api.get('/maintenances'), api.get('/maintenances/upcoming'), api.get('/expenses')]);
        this.items = history.items;
        this.upcoming = next.items;
        this.expenses = expenses.items;
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

    byVehicle(list) {
      return this.vehicleFilter ? list.filter((m) => m.vehicleId === this.vehicleFilter) : list;
    },

    get filteredUpcoming() {
      return this.byVehicle(this.upcoming);
    },

    get attention() {
      const list = this.filteredUpcoming;
      return { overdue: list.filter((m) => m.next.status === 'atrasado').length, soon: list.filter((m) => m.next.status === 'proximo').length };
    },

    get filteredHistory() {
      const q = norm(this.q.trim()).replace(/-/g, '');
      return this.byVehicle(this.items).filter((m) => !q || norm(`${m.vehicle.plate} ${m.type} ${m.workshop ?? ''} ${m.detail ?? ''}`).includes(q));
    },

    /** Historial agrupado por mes con el total gastado. */
    get groups() {
      const groups = [];
      for (const m of this.filteredHistory) {
        const month = m.doneOn.slice(0, 7);
        let g = groups.at(-1);
        if (g?.month !== month) groups.push((g = { month, parts: 0, labor: 0, total: 0, items: [] }));
        g.items.push(m);
        g.parts += cents(m.partsCost);
        g.labor += cents(m.laborCost);
        g.total += cents(m.cost);
      }
      return groups.map((x) => ({ ...x, parts: x.parts / 100, labor: x.labor / 100, total: x.total / 100 }));
    },

    /**
     * Gastos mensuales generados por cada vehículo: mantenimiento + otros gastos.
     * [{ month, maintenance, other, total, rows: [{ vehicle, maintenance, other, total }] }]
     */
    get monthly() {
      const months = new Map();
      const add = (vehicle, month, key, amount) => {
        if (!months.has(month)) months.set(month, new Map());
        const rows = months.get(month);
        if (!rows.has(vehicle.id)) rows.set(vehicle.id, { vehicle, maintenance: 0, other: 0 });
        rows.get(vehicle.id)[key] += cents(amount);
      };
      for (const m of this.byVehicle(this.items)) add(m.vehicle, m.doneOn.slice(0, 7), 'maintenance', m.cost);
      for (const e of this.byVehicle(this.expenses)) {
        const v = this.vehicles.find((x) => x.id === e.vehicleId) ?? { id: e.vehicleId, plate: e.plate };
        add(v, e.date.slice(0, 7), 'other', e.amount);
      }
      return [...months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([month, rows]) => {
          const list = [...rows.values()]
            .map((r) => ({ ...r, total: (r.maintenance + r.other) / 100, maintenance: r.maintenance / 100, other: r.other / 100 }))
            .sort((a, b) => b.total - a.total);
          const sum = (k) => list.reduce((s, r) => s + Math.round(r[k] * 100), 0) / 100;
          return { month, rows: list, maintenance: sum('maintenance'), other: sum('other'), total: sum('total') };
        });
    },

    get formTotal() {
      return (cents(this.form.partsCost) + cents(this.form.laborCost)) / 100;
    },

    get workshops() {
      return [...new Set(this.items.map((m) => m.workshop).filter(Boolean))].slice(0, 20);
    },

    /** Excel del registro (respeta el filtro de vehículo). */
    get exportUrl() {
      return `/api/maintenances/export${this.vehicleFilter ? `?vehicleId=${this.vehicleFilter}` : ''}`;
    },

    get formVehicle() {
      return this.vehicles.find((v) => v.id === this.form.vehicleId) ?? null;
    },

    /** Línea con el objetivo del próximo servicio: 'A los 50,000 km · 15 feb 2027'. */
    target(m) {
      return [m.nextKm != null && `A los ${km(m.nextKm)}`, m.nextDate && date(m.nextDate)].filter(Boolean).join(' · ');
    },

    // ───── Detalle ─────
    openDetail(m) {
      this.current = m;
      this.sheet = 'detail';
    },

    // ───── Registrar / editar ─────
    openCreate(prefill = {}) {
      this.mode = 'create';
      this.form = { ...blankForm(), ...prefill };
      if (!this.form.vehicleId && this.vehicles.length === 1) this.form.vehicleId = this.vehicles[0].id;
      this.fields = {};
      this.sheet = 'form';
    },

    /** Registrar otra vez el mismo servicio (cuando llega la fecha o el km). */
    openAgain(m) {
      this.openCreate({ vehicleId: m.vehicleId, type: m.type, workshop: m.workshop ?? '' });
    },

    openEdit() {
      const m = this.current;
      this.mode = 'edit';
      this.form = {
        vehicleId: m.vehicleId, doneOn: m.doneOn, type: m.type, km: m.km ?? '', partsCost: m.partsCost, laborCost: m.laborCost, workshop: m.workshop ?? '',
        detail: m.detail ?? '', nextKm: m.nextKm ?? '', nextDate: m.nextDate ?? '',
      };
      this.fields = {};
      this.sheet = 'form';
    },

    closeForm() {
      this.sheet = this.mode === 'edit' ? 'detail' : null;
    },

    addKm(n) {
      const base = Number(this.form.km) || this.formVehicle?.odometer || 0;
      this.form.nextKm = String(base + n);
    },

    addMonths(n) {
      this.form.nextDate = addMonthsISO(this.form.doneOn || todayISO(), n);
    },

    async save() {
      this.saving = true;
      this.fields = {};
      const { vehicleId, ...data } = this.form;
      try {
        if (this.mode === 'create') {
          const m = await api.post('/maintenances', { vehicleId, ...data });
          await Promise.all([this.load(), this.loadVehicles()]);
          this.sheet = null;
          toast(`${m.type} de ${plate(m.vehicle.plate)} registrado`);
        } else {
          this.current = await api.patch(`/maintenances/${this.current.id}`, data);
          await Promise.all([this.load(), this.loadVehicles()]);
          this.sheet = 'detail';
          toast('Mantenimiento actualizado');
        }
      } catch (err) {
        this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    async remove() {
      const m = this.current;
      const ok = await confirmAction({
        title: `¿Eliminar ${m.type} de ${plate(m.vehicle.plate)}?`,
        message: 'Dejará de mostrarse. Quedará registrado en la bitácora.', confirmText: 'Eliminar', danger: true,
      });
      if (!ok) return;
      try {
        await api.del(`/maintenances/${m.id}`);
        await this.load();
        this.sheet = null;
        toast('Mantenimiento eliminado');
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  }),
});
