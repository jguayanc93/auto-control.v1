// Calendario de cobros de UN vehículo (ventana individual por unidad).
//   🟢 Pagó  🟡 Media cuenta  🔴 No se paga cuenta  🟣 Fuera de servicio
// Más los gastos del vehículo y el resumen del mes (ingresos − gastos).
import { confirmAction, startPage, toast } from '../app.js';
import { api } from '../api.js';
import { icon } from '../ui/icons.js';
import {
  addMonths, DAY_STATUS, date, EXPENSE_CATEGORY, EXPENSE_CATEGORY_NEW, longDate, money, monthLabel, PAYMENT_METHOD, plate, todayISO,
} from '../utils/format.js';

const params = new URLSearchParams(location.search);
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PAID = ['pagado', 'medio'];
const cents = (v) => Math.round(Number(v || 0) * 100);
const blankDayForm = () => ({ adjust: false, amount: '', method: 'efectivo', note: '' });

startPage({
  page: 'pagos',
  title: 'Calendario de cobros',
  component: () => ({
    vehicleId: params.get('v'),
    month: MONTH_RE.test(params.get('m') ?? '') ? params.get('m') : todayISO().slice(0, 7),
    data: null,
    loading: true,
    /** null | 'day' | 'expense' */
    sheet: null,
    selected: null,
    dayForm: blankDayForm(),
    eForm: null,
    editingExpense: null,
    fields: {},
    saving: false,
    WEEKDAYS: ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'],
    DAY_STATUS,
    PAYMENT_METHOD,
    EXPENSE_CATEGORY,
    EXPENSE_CATEGORY_NEW,
    fmt: { money, plate, monthLabel, longDate, date },
    icons: {
      left: icon('chevronLeft'), right: icon('chevronRight'), back: icon('chevronLeft', 'size-5'), x: icon('x'),
      plus: icon('plus', 'size-4'), receipt: icon('receipt', 'size-5'), wrench: icon('wrench', 'size-5'), wrenchSm: icon('wrench', 'size-4'), trash: icon('trash', 'size-4'), alert: icon('alert', 'size-4'),
    },

    async init() {
      if (!this.vehicleId) return location.replace('/pagos.html');
      this.$watch('sheet', (v) => document.body.classList.toggle('overflow-hidden', Boolean(v)));
      await this.load();
    },

    async load() {
      this.loading = true;
      try {
        this.data = await api.get(`/daily/vehicles/${this.vehicleId}?month=${this.month}`);
        document.title = `${plate(this.data.vehicle.plate)} · Calendario · AUTO-CONTROL`;
      } catch (err) {
        toast(err.message, 'error');
        if (err.status === 404) setTimeout(() => location.replace('/pagos.html'), 1500);
      } finally {
        this.loading = false;
      }
    },

    async go(n) {
      this.month = addMonths(this.month, n);
      history.replaceState(null, '', `?v=${this.vehicleId}&m=${this.month}`);
      await this.load();
    },

    // ───── Calendario ─────
    rentalOn(d) {
      return this.data?.rentals.find((r) => r.startDate <= d && (!r.endDate || r.endDate >= d)) ?? null;
    },

    /** Contrato que se muestra arriba: el activo, o el último del mes. */
    get currentRental() {
      const rs = this.data?.rentals ?? [];
      return rs.find((r) => r.status === 'activo') ?? rs.at(-1) ?? null;
    },

    /** Celdas del mes (empieza en domingo, como en el bosquejo). */
    get cells() {
      if (!this.data) return [];
      const [y, m] = this.month.split('-').map(Number);
      const first = new Date(Date.UTC(y, m - 1, 1));
      const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const records = new Map(this.data.records.map((r) => [r.date, r]));
      const pending = new Set(this.data.summary.pendingDates);
      const cells = Array.from({ length: first.getUTCDay() }, () => null);
      for (let n = 1; n <= total; n++) {
        const d = `${this.month}-${String(n).padStart(2, '0')}`;
        cells.push({
          date: d, n, record: records.get(d) ?? null, pending: pending.has(d),
          inContract: Boolean(this.rentalOn(d)), future: d > this.data.today, today: d === this.data.today,
        });
      }
      return cells;
    },

    cellClass(c) {
      if (c.record?.status === 'fuera_servicio') return 'bg-purple-300 text-purple-950 font-semibold';
      if (c.record) return `ring-2 ${DAY_STATUS[c.record.status].ring} font-semibold`;
      if (c.pending) return 'border-2 border-dashed border-amber-400 bg-amber-50 text-amber-900';
      if (!c.inContract || c.future) return 'text-slate-400';
      return '';
    },

    /** Monto sugerido para el día según la tarifa del contrato. */
    suggested(status, d = this.selected?.date) {
      const r = this.rentalOn(d);
      if (!r) return 0;
      if (status === 'pagado') return cents(r.dailyRate) / 100;
      if (status === 'medio') return Math.round(cents(r.dailyRate) / 2) / 100;
      return 0;
    },

    /** ¿Se puede marcar ese estado en el día seleccionado? */
    canMark(status) {
      const c = this.selected;
      if (!c) return false;
      if (status === 'fuera_servicio') return true;
      return c.inContract && !c.future;
    },

    get dayHint() {
      const c = this.selected;
      if (!c || c.record) return '';
      if (!c.inContract) return 'Ese día el vehículo no tenía contrato: solo se puede marcar "Fuera de servicio".';
      if (c.future) return 'Es un día futuro: solo se puede programar "Fuera de servicio".';
      return '';
    },

    // ───── Marcar / cambiar un día ─────
    openDay(c) {
      if (!c) return;
      this.selected = c;
      this.fields = {};
      this.dayForm = c.record
        ? { adjust: false, amount: c.record.amount, method: c.record.method ?? 'efectivo', note: c.record.note ?? '' }
        : blankDayForm();
      this.sheet = 'day';
    },

    async mark(status) {
      if (!this.canMark(status) || this.saving) return;
      this.saving = true;
      this.fields = {};
      const f = this.dayForm;
      const body = { vehicleId: this.vehicleId, date: this.selected.date, status, note: f.note };
      if (PAID.includes(status)) {
        body.method = f.method;
        if (f.adjust && f.amount !== '') body.amount = f.amount;
      }
      try {
        await api.post('/daily/records', body);
        this.sheet = null;
        toast(`${fmtDay(this.selected.date)}: ${DAY_STATUS[status].label}`);
        await this.load();
      } catch (err) {
        this.fields = err.fields ?? {};
        toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    /** Solo admin: cambia el color o el monto/método/nota de un día ya marcado. */
    async updateDay(status) {
      const rec = this.selected.record;
      this.saving = true;
      this.fields = {};
      const f = this.dayForm;
      const body = { note: f.note };
      if (status && status !== rec.status) body.status = status;
      const finalStatus = status ?? rec.status;
      if (PAID.includes(finalStatus)) {
        body.method = f.method;
        // Al cambiar de color el monto se recalcula, salvo que se haya ajustado a mano.
        if (!body.status || f.adjust) body.amount = f.amount;
      }
      try {
        await api.patch(`/daily/records/${rec.id}`, body);
        this.sheet = null;
        toast('Día actualizado');
        await this.load();
      } catch (err) {
        this.fields = err.fields ?? {};
        toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    async clearDay() {
      const ok = await confirmAction({
        title: '¿Quitar la marca de este día?', message: 'El día quedará sin marcar. Quedará registrado en la bitácora.', confirmText: 'Quitar marca', danger: true,
      });
      if (!ok) return;
      try {
        await api.del(`/daily/records/${this.selected.record.id}`);
        this.sheet = null;
        toast('Marca eliminada');
        await this.load();
      } catch (err) {
        toast(err.message, 'error');
      }
    },

    // ───── Gastos ─────
    /** Gastos del mes: otros gastos + mantenimientos (estos se gestionan en su módulo). */
    get allExpenses() {
      if (!this.data) return [];
      const maint = (this.data.maintenances ?? []).map((m) => ({ ...m, kind: 'maintenance', amount: m.cost }));
      const other = this.data.expenses.map((e) => ({ ...e, kind: 'expense' }));
      return [...maint, ...other].sort((a, b) => b.date.localeCompare(a.date));
    },

    maintenanceUrl(m = null) {
      return `/mantenimientos.html?v=${this.vehicleId}${m ? `&m=${m.id}` : '&nuevo=1'}`;
    },

    openExpense(e = null) {
      this.editingExpense = e;
      const defaultDate = this.month === this.data.today.slice(0, 7) ? this.data.today : `${this.month}-01`;
      this.eForm = e
        ? { date: e.date, category: e.category, amount: e.amount, description: e.description ?? '' }
        : { date: defaultDate <= this.data.today ? defaultDate : this.data.today, category: 'servicio', amount: '', description: '' };
      this.fields = {};
      this.sheet = 'expense';
    },

    async saveExpense() {
      this.saving = true;
      this.fields = {};
      try {
        if (this.editingExpense) {
          const { category, ...rest } = this.eForm; // la categoría solo se envía si cambió (gastos antiguos de "Mantenimiento")
          await api.patch(`/expenses/${this.editingExpense.id}`, category === this.editingExpense.category ? rest : this.eForm);
          toast('Gasto actualizado');
        } else {
          await api.post('/expenses', { ...this.eForm, vehicleId: this.vehicleId });
          toast('Gasto registrado');
        }
        this.sheet = null;
        await this.load();
      } catch (err) {
        this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    async deleteExpense() {
      const ok = await confirmAction({ title: '¿Eliminar este gasto?', message: 'Quedará registrado en la bitácora.', confirmText: 'Eliminar', danger: true });
      if (!ok) return;
      try {
        await api.del(`/expenses/${this.editingExpense.id}`);
        this.sheet = null;
        toast('Gasto eliminado');
        await this.load();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  }),
});

function fmtDay(iso) {
  return longDate(iso).replace(/^./, (c) => c.toUpperCase());
}
