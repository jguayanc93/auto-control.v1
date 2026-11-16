// Vehículos + contratos de alquiler (+ pestaña Conductores en vehiculos-conductores.js).
import { confirmAction, startPage, toast } from '../app.js';
import { api } from '../api.js';
import { icon } from '../ui/icons.js';
import { mix } from '../utils/mix.js';
import { date, initials, km, money, pendingInfo, plate, telLink, todayISO, VEHICLE_STATUS, waLink } from '../utils/format.js';
import { rentersPart } from './vehiculos-conductores.js';

const blankVehicle = () => ({ plate: '', brand: '', model: '', year: '', color: '', odometer: '', notes: '', status: 'disponible' });
const blankRental = (mode = 'new') => ({
  renterMode: mode,
  renterId: '',
  newRenter: { fullName: '', docNumber: '', phone: '', licenseNumber: '' },
  dailyRate: '',
  startDate: todayISO(),
  notes: '',
});
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const byPlate = (a, b) => a.plate.localeCompare(b.plate);
const daysInclusive = (a, b) => Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1);

startPage({
  page: 'vehiculos',
  title: 'Vehículos',
  component: () => mix(rentersPart(), {
    tab: location.hash === '#conductores' ? 'renters' : 'vehicles',
    vehicles: [],
    loadingVehicles: true,
    q: '',
    filter: 'all',
    /** Panel abierto: null | vehicle | vehicleForm | rentalForm | rentalEdit | finish | renter | renterForm */
    sheet: null,
    /** Panel al que se vuelve al cerrar un formulario */
    back: null,
    vehicle: null,
    vForm: blankVehicle(),
    vMode: 'create',
    rForm: blankRental(),
    editRental: null,
    finishDate: todayISO(),
    fields: {},
    saving: false,
    busy: false,
    today: todayISO(),
    FILTERS: [['all', 'Todos'], ['alquilado', 'Alquilados'], ['disponible', 'Disponibles'], ['taller', 'En taller'], ['inactivo', 'Inactivos']],
    VEHICLE_STATUS,
    fmt: { money, date, plate, pendingInfo, telLink, waLink, initials, km },
    icons: {
      plus: icon('plus'), x: icon('x'), car: icon('car', 'size-6'), users: icon('users', 'size-6'), edit: icon('pencil'),
      trash: icon('trash'), chevron: icon('chevronRight', 'size-4'), phone: icon('phone', 'size-4'), wa: icon('message', 'size-4'),
      calendar: icon('calendar'), file: icon('file'), wrench: icon('wrench'), alert: icon('alert', 'size-4'), search: icon('search', 'size-4'), flag: icon('flag'), key: icon('plus', 'size-4'),
    },

    async init() {
      this.$watch('sheet', (v) => document.body.classList.toggle('overflow-hidden', Boolean(v)));
      this.$watch('tab', (t) => history.replaceState(null, '', t === 'renters' ? '#conductores' : location.pathname));
      await Promise.all([this.loadVehicles(), this.loadRenters()]);
    },

    async loadVehicles() {
      try {
        this.vehicles = (await api.get('/vehicles')).items;
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.loadingVehicles = false;
      }
    },

    get filteredVehicles() {
      const q = norm(this.q.trim()).replace(/-/g, '');
      return this.vehicles.filter((v) =>
        (this.filter === 'all' || v.status === this.filter) &&
        (!q || norm(`${v.plate} ${v.brand} ${v.model} ${v.activeRental?.renter.fullName ?? ''}`).includes(q)));
    },

    count(status) {
      return status === 'all' ? this.vehicles.length : this.vehicles.filter((v) => v.status === status).length;
    },

    get pendingTotal() {
      return this.vehicles.reduce((s, v) => s + (v.activeRental?.pendingDays ?? 0), 0);
    },

    closeSub() {
      this.sheet = this.back;
      this.back = null;
    },

    // ───── Detalle de vehículo ─────
    async openVehicle(v) {
      this.vehicle = { ...v, rentals: null };
      this.sheet = 'vehicle';
      try {
        this.vehicle = await api.get(`/vehicles/${v.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    },

    async refreshVehicle() {
      const fresh = await api.get(`/vehicles/${this.vehicle.id}`);
      this.vehicle = fresh;
      this.vehicles = this.vehicles.map((x) => (x.id === fresh.id ? fresh : x));
    },

    // ───── Crear / editar vehículo ─────
    openVehicleCreate() {
      this.vMode = 'create';
      this.vForm = blankVehicle();
      this.fields = {};
      this.back = null;
      this.sheet = 'vehicleForm';
    },

    openVehicleEdit() {
      const v = this.vehicle;
      this.vMode = 'edit';
      this.vForm = { plate: plate(v.plate), brand: v.brand, model: v.model, year: v.year ?? '', color: v.color ?? '', odometer: v.odometer ?? '', notes: v.notes ?? '', status: v.status };
      this.fields = {};
      this.back = 'vehicle';
      this.sheet = 'vehicleForm';
    },

    async saveVehicle() {
      this.saving = true;
      this.fields = {};
      const { status, ...data } = this.vForm;
      try {
        if (this.vMode === 'create') {
          const v = await api.post('/vehicles', data);
          this.vehicles = [...this.vehicles, v].sort(byPlate);
          toast(`Vehículo ${plate(v.plate)} registrado`);
          await this.openVehicle(v); // para poder iniciar el alquiler de inmediato
        } else {
          await api.patch(`/vehicles/${this.vehicle.id}`, status === 'alquilado' ? data : { ...data, status });
          await this.refreshVehicle();
          this.vehicles.sort(byPlate);
          this.sheet = 'vehicle';
          toast('Cambios guardados');
        }
      } catch (err) {
        this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    async deleteVehicle() {
      const v = this.vehicle;
      const ok = await confirmAction({ title: `¿Eliminar ${plate(v.plate)}?`, message: 'Solo se puede eliminar si no tiene historial. Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true });
      if (!ok) return;
      this.busy = true;
      try {
        await api.del(`/vehicles/${v.id}`);
        this.vehicles = this.vehicles.filter((x) => x.id !== v.id);
        this.sheet = null;
        toast('Vehículo eliminado');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.busy = false;
      }
    },

    // ───── Contratos ─────
    openRentalCreate() {
      this.rForm = blankRental(this.renters.length ? 'existing' : 'new');
      this.fields = {};
      this.back = 'vehicle';
      this.sheet = 'rentalForm';
    },

    async saveRental() {
      this.saving = true;
      this.fields = {};
      const f = this.rForm;
      const body = {
        vehicleId: this.vehicle.id, dailyRate: f.dailyRate, startDate: f.startDate, notes: f.notes,
        ...(f.renterMode === 'existing' ? { renterId: f.renterId } : { newRenter: f.newRenter }),
      };
      try {
        await api.post('/rentals', body);
        await Promise.all([this.refreshVehicle(), this.loadRenters()]);
        this.sheet = 'vehicle';
        toast('Alquiler iniciado');
      } catch (err) {
        this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    openRentalEdit(r) {
      this.editRental = r;
      this.rForm = { ...blankRental(), dailyRate: r.dailyRate, startDate: r.startDate, notes: r.notes ?? '' };
      this.fields = {};
      this.back = this.sheet;
      this.sheet = 'rentalEdit';
    },

    async saveRentalEdit() {
      this.saving = true;
      this.fields = {};
      const { dailyRate, startDate, notes } = this.rForm;
      try {
        await api.patch(`/rentals/${this.editRental.id}`, { dailyRate, startDate, notes });
        await Promise.all([this.refreshVehicle(), this.loadRenters()]);
        this.sheet = 'vehicle';
        toast('Contrato actualizado');
      } catch (err) {
        this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    openFinish() {
      this.finishDate = todayISO();
      this.fields = {};
      this.back = 'vehicle';
      this.sheet = 'finish';
    },

    /** Vista previa según la fecha de fin elegida. */
    get finishPreview() {
      const r = this.vehicle?.activeRental;
      if (!r || !this.finishDate) return null;
      const days = daysInclusive(r.startDate, this.finishDate);
      return { days, pending: Math.max(0, days - r.markedDays) };
    },

    async finishRental() {
      this.saving = true;
      this.fields = {};
      try {
        await api.post(`/rentals/${this.vehicle.activeRental.id}/finish`, { endDate: this.finishDate });
        await Promise.all([this.refreshVehicle(), this.loadRenters()]);
        this.sheet = 'vehicle';
        toast('Contrato finalizado. El vehículo quedó disponible.');
      } catch (err) {
        this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },

    async deleteRental(r) {
      const ok = await confirmAction({ title: '¿Eliminar este contrato?', message: 'Úsalo solo si se registró por error. Si tiene pagos no se podrá eliminar.', confirmText: 'Eliminar', danger: true });
      if (!ok) return;
      this.busy = true;
      try {
        await api.del(`/rentals/${r.id}`);
        await Promise.all([this.refreshVehicle(), this.loadRenters()]);
        toast('Contrato eliminado');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.busy = false;
      }
    },
  }),
});
