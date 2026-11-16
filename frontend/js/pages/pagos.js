// Pagos diarios: resumen del mes de toda la flota. Cada vehículo abre su calendario.
import { startPage, toast } from '../app.js';
import { api } from '../api.js';
import { icon } from '../ui/icons.js';
import { addMonths, DAY_STATUS, money, monthLabel, plate, todayISO } from '../utils/format.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

startPage({
  page: 'pagos',
  title: 'Pagos diarios',
  component: () => {
    const m = new URLSearchParams(location.search).get('m');
    return {
      month: MONTH_RE.test(m ?? '') ? m : todayISO().slice(0, 7),
      data: null,
      loading: true,
      DAY_STATUS,
      fmt: { money, plate, monthLabel },
      icons: { left: icon('chevronLeft'), right: icon('chevronRight'), chevron: icon('chevronRight', 'size-4'), car: icon('car', 'size-6') },

      async init() {
        await this.load();
      },

      async load() {
        this.loading = true;
        try {
          this.data = await api.get(`/daily/overview?month=${this.month}`);
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          this.loading = false;
        }
      },

      async go(n) {
        this.month = addMonths(this.month, n);
        history.replaceState(null, '', `?m=${this.month}`);
        await this.load();
      },

      get isCurrentMonth() {
        return this.month === todayISO().slice(0, 7);
      },

      /** Alquilados primero; se ocultan los inactivos sin movimiento en el mes. */
      get items() {
        if (!this.data) return [];
        const moved = (v) => v.activeRental || Number(v.summary.income) || Number(v.summary.expenses) || Object.values(v.summary.counts).some(Boolean);
        return this.data.items
          .filter((v) => v.status !== 'inactivo' || moved(v))
          .sort((a, b) => Number(Boolean(b.activeRental)) - Number(Boolean(a.activeRental)) || a.plate.localeCompare(b.plate));
      },

      calendarUrl(v) {
        return `/calendario.html?v=${v.id}&m=${this.month}`;
      },
    };
  },
});
