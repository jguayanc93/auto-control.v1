// Inicio: indicadores del negocio y lo que requiere atención (GET /api/dashboard).
import { startPage, toast } from '../app.js';
import { api } from '../api.js';
import { icon } from '../ui/icons.js';
import { DOC_TYPE, expiryText, greeting, MAINT_STATUS, money, monthLabel, nextText, plate } from '../utils/format.js';

const WEEKDAY = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'UTC' });

startPage({
  page: 'inicio',
  title: 'Inicio',
  component: () => ({
    greeting: greeting(),
    data: null,
    loading: true,
    fmt: { money, plate, monthLabel },
    icons: {
      check: icon('check', 'size-6'), chevron: icon('chevronRight', 'size-4'),
      file: icon('file', 'size-5'), wrench: icon('wrench', 'size-5'), calendar: icon('calendar', 'size-5'),
    },

    async init() {
      try {
        this.data = await api.get('/dashboard');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    get firstName() {
      return this.user.name.split(' ')[0];
    },

    get pendingTotal() {
      return (this.data?.pending ?? []).reduce((s, p) => s + p.pendingDays, 0);
    },

    get kpis() {
      const d = this.data;
      if (!d) return [];
      return [
        {
          label: 'Cobrado hoy', value: money(d.todayIncome), href: '/pagos.html',
          sub: `${d.fleet.alquilado} vehículo${d.fleet.alquilado === 1 ? '' : 's'} alquilado${d.fleet.alquilado === 1 ? '' : 's'}`,
          icon: icon('wallet', 'size-4'), tone: 'bg-emerald-50 text-emerald-600',
        },
        {
          label: 'Total ingreso del mes', value: money(d.month.net), href: '/pagos.html',
          sub: `Ingresos ${money(d.month.income)}`, negative: Number(d.month.net) < 0,
          icon: icon('receipt', 'size-4'), tone: 'bg-brand-50 text-brand-600',
        },
        {
          label: 'Vehículos', value: `${d.fleet.alquilado}/${d.fleet.total}`, href: '/vehiculos.html',
          sub: `${d.fleet.disponible} disponible${d.fleet.disponible === 1 ? '' : 's'} · ${d.fleet.taller} en taller`,
          icon: icon('car', 'size-4'), tone: 'bg-slate-100 text-slate-600',
        },
        {
          label: 'Días sin marcar', value: String(this.pendingTotal), href: '/pagos.html',
          sub: this.pendingTotal ? `en ${d.pending.length} vehículo${d.pending.length === 1 ? '' : 's'}` : 'Todo al día',
          icon: icon('calendar', 'size-4'), tone: this.pendingTotal ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600',
        },
      ];
    },

    /** Barras de los últimos 7 días (altura relativa al día de más cobro). */
    get week() {
      const days = this.data?.week ?? [];
      const max = Math.max(...days.map((d) => Number(d.income)), 1);
      return days.map((d) => ({
        ...d,
        label: WEEKDAY.format(new Date(`${d.date}T00:00:00Z`)).replace('.', ''),
        pct: Math.round((Number(d.income) / max) * 100),
        isToday: d.date === this.data.today,
      }));
    },

    get weekTotal() {
      return (this.data?.week ?? []).reduce((s, d) => s + Math.round(Number(d.income) * 100), 0) / 100;
    },

    /** Lista unificada, lo más urgente primero. */
    get attention() {
      const d = this.data;
      if (!d) return [];
      const docs = d.documents.items.map((x) => ({
        key: `d${x.id}`, icon: this.icons.file, href: `/documentos.html?v=${x.vehicleId}`,
        title: `${DOC_TYPE[x.type]} · ${plate(x.plate)}`, sub: expiryText(x.daysToExpire),
        level: x.status === 'vencido' ? 0 : 1, badge: x.status === 'vencido' ? 'Vencido' : 'Por vencer',
      }));
      const maint = d.maintenance.items.map((x) => ({
        key: `m${x.id}`, icon: this.icons.wrench, href: `/mantenimientos.html?v=${x.vehicleId}&m=${x.id}`,
        title: `${x.type} · ${plate(x.plate)}`, sub: nextText(x.next),
        level: x.next.status === 'atrasado' ? 0 : 1, badge: MAINT_STATUS[x.next.status].label,
      }));
      const pending = d.pending.map((x) => ({
        key: `p${x.id}`, icon: this.icons.calendar, href: `/calendario.html?v=${x.id}`,
        title: `${plate(x.plate)} · ${x.renter}`, sub: `${x.pendingDays} día${x.pendingDays === 1 ? '' : 's'} sin marcar en el calendario`,
        level: x.pendingDays > 2 ? 0 : 1, badge: 'Por marcar',
      }));
      return [...docs, ...maint, ...pending].sort((a, b) => a.level - b.level);
    },

    get actions() {
      return [
        { label: 'Marcar cobros', href: '/pagos.html', icon: icon('wallet') },
        { label: 'Vehículos', href: '/vehiculos.html', icon: icon('car') },
        { label: 'Subir documento', href: '/documentos.html', icon: icon('file') },
        { label: 'Mantenimiento', href: '/mantenimientos.html', icon: icon('wrench') },
      ];
    },
  }),
});
