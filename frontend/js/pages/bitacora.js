// Bitácora: quién hizo qué y cuándo. Solo lectura.
//   admin → su negocio · superadmin → acciones de la plataforma (cuentas y negocios)
import { startPage, toast } from '../app.js';
import { api } from '../api.js';
import { icon } from '../ui/icons.js';
import { initials, money, plate } from '../utils/format.js';

/** Módulos (entity) en lenguaje natural: [nombre del filtro, "un ..."] */
const ENTITY = {
  vehicle: ['Vehículos', 'un vehículo'],
  renter: ['Conductores', 'un conductor'],
  rental: ['Contratos', 'un contrato'],
  daily_record: ['Calendario de cobros', 'un día del calendario'],
  expense: ['Gastos', 'un gasto'],
  document: ['Documentos', 'un documento'],
  maintenance: ['Mantenimiento', 'un mantenimiento'],
  user: ['Usuarios y accesos', 'un usuario'],
  organization: ['Negocios', 'un negocio'],
};
const PLATFORM_ENTITIES = ['user', 'organization'];

const ACTION = {
  create: 'Registros', update: 'Modificaciones', delete: 'Eliminaciones', login: 'Inicios de sesión',
  login_failed: 'Accesos fallidos', suspend: 'Suspensiones', activate: 'Reactivaciones',
  password_change: 'Cambios de contraseña', password_reset: 'Contraseñas restablecidas',
};

/** Etiquetas de los campos guardados en `changes`. */
const FIELD = {
  vehiculo: 'Vehículo', plate: 'Placa', brand: 'Marca', model: 'Modelo', year: 'Año', color: 'Color', status: 'Estado',
  odometer: 'Kilometraje', notes: 'Notas', notas: 'Notas', observaciones: 'Observaciones', fullName: 'Nombre', docNumber: 'DNI',
  phone: 'Teléfono', licenseNumber: 'Licencia', name: 'Nombre', email: 'Correo', username: 'Usuario', role: 'Rol',
  login: 'Usuario ingresado', negocio: 'Negocio', conductor: 'Conductor', tarifaDiaria: 'Tarifa diaria', dailyRate: 'Tarifa diaria',
  inicio: 'Inicio', fin: 'Fin', startDate: 'Inicio', endDate: 'Fin', estado: 'Estado', fecha: 'Fecha', monto: 'Monto',
  metodo: 'Método de pago', nota: 'Nota', tipo: 'Tipo', numero: 'Número', archivo: 'Archivo', emision: 'Emisión',
  vencimiento: 'Vencimiento', descripcion: 'Descripción', km: 'Kilometraje', repuestos: 'Repuestos', mano_de_obra: 'Mano de obra',
  total: 'Total', costo: 'Costo', taller: 'Taller', detalle: 'Detalle', proximo_km: 'Próximo km', proxima_fecha: 'Próxima fecha',
};
const HIDDEN = new Set(['id', 'orgId', 'createdById', 'createdAt', 'updatedAt', 'vehicleId', 'renterId', 'rentalId', 'userId']);
const MONEY_FIELDS = new Set(['monto', 'tarifaDiaria', 'dailyRate', 'repuestos', 'mano_de_obra', 'total', 'costo']);
const VALUE = {
  disponible: 'Disponible', alquilado: 'Alquilado', taller: 'En taller', inactivo: 'Inactivo', activo: 'Activo', finalizado: 'Finalizado',
  admin: 'Administrador', operator: 'Operador', superadmin: 'Superadmin', efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin',
  transferencia: 'Transferencia', active: 'Activo', suspended: 'Suspendido',
};

const limaDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(iso));
const timeFmt = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: true });
const dayFmt = new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const isDiff = (v) => v && typeof v === 'object' && 'antes' in v && 'despues' in v;

function formatValue(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (key === 'plate' || key === 'vehiculo') return plate(String(v));
  if (MONEY_FIELDS.has(key)) return money(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/');
  if (typeof v === 'object') return JSON.stringify(v);
  return VALUE[v] ?? String(v);
}

/** Resumen corto del registro: 'ABC-123 · Frenos · S/ 120.00' */
const SUMMARY_KEYS = ['vehiculo', 'plate', 'tipo', 'estado', 'conductor', 'fullName', 'negocio', 'name', 'username', 'login', 'fecha', 'monto', 'total', 'costo'];
function summary(changes) {
  if (!changes || typeof changes !== 'object') return '';
  const parts = [];
  for (const k of SUMMARY_KEYS) {
    if (!(k in changes) || parts.length >= 4) continue;
    const raw = isDiff(changes[k]) ? (changes[k].despues ?? changes[k].antes) : changes[k];
    if (raw === null || raw === undefined || raw === '') continue;
    parts.push(formatValue(k, raw));
  }
  return parts.join(' · ');
}

function sentence(e) {
  const thing = ENTITY[e.entity]?.[1] ?? e.entity;
  switch (e.action) {
    case 'create':
      if (e.entity === 'daily_record') return 'marcó un día del calendario';
      if (e.entity === 'rental') return 'inició un contrato';
      if (e.entity === 'document') return 'subió un documento';
      return `registró ${thing}`;
    case 'update':
      if (e.entity === 'rental' && e.changes?.estado?.despues === 'finalizado') return 'finalizó un contrato';
      return `modificó ${thing}`;
    case 'delete': return `eliminó ${thing}`;
    case 'login': return 'inició sesión';
    case 'login_failed': return 'Intento de acceso fallido';
    case 'suspend': return `suspendió ${thing}`;
    case 'activate': return `reactivó ${thing}`;
    case 'password_change': return 'cambió su contraseña';
    case 'password_reset': return `restableció la contraseña de ${thing}`;
    default: return `${e.action} ${thing}`;
  }
}

const TONE = {
  create: 'bg-emerald-50 text-emerald-700', update: 'bg-brand-50 text-brand-700', delete: 'bg-rose-50 text-rose-700',
  login_failed: 'bg-rose-50 text-rose-700', suspend: 'bg-amber-50 text-amber-700', activate: 'bg-emerald-50 text-emerald-700',
};

startPage({
  page: 'bitacora',
  title: 'Bitácora',
  roles: ['admin', 'superadmin'],
  component: () => ({
    items: [],
    users: [],
    nextCursor: null,
    loading: true,
    loadingMore: false,
    open: null,
    showFilters: false,
    filters: { userId: '', entity: '', action: '', from: '', to: '' },
    ACTION,
    icons: { chevron: icon('chevronRight', 'size-4'), x: icon('x', 'size-4'), search: icon('search', 'size-4') },

    async init() {
      this.$watch('filters', () => this.load(), { deep: true });
      await Promise.all([this.load(), this.loadUsers()]);
    },

    get modules() {
      return Object.entries(ENTITY)
        .filter(([k]) => this.user.role !== 'superadmin' || PLATFORM_ENTITIES.includes(k))
        .map(([k, v]) => [k, v[0]]);
    },

    get activeFilters() {
      return Object.values(this.filters).filter(Boolean).length;
    },

    clearFilters() {
      this.filters = { userId: '', entity: '', action: '', from: '', to: '' };
    },

    query(cursor) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(this.filters)) if (v) p.set(k, v);
      if (cursor) p.set('cursor', cursor);
      return `/audit?${p}`;
    },

    async load() {
      this.loading = true;
      try {
        const res = await api.get(this.query());
        this.items = res.items;
        this.nextCursor = res.nextCursor;
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    async more() {
      this.loadingMore = true;
      try {
        const res = await api.get(this.query(this.nextCursor));
        this.items = [...this.items, ...res.items];
        this.nextCursor = res.nextCursor;
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        this.loadingMore = false;
      }
    },

    async loadUsers() {
      try {
        this.users = (await api.get('/audit/users')).items;
      } catch { /* el filtro quedará vacío */ }
    },

    /** Agrupado por día (hora de Lima). */
    get days() {
      const out = [];
      for (const e of this.items) {
        const day = limaDay(e.createdAt);
        let g = out.at(-1);
        if (g?.day !== day) out.push((g = { day, label: dayFmt.format(new Date(`${day}T00:00:00Z`)), items: [] }));
        g.items.push(e);
      }
      return out;
    },

    who(e) {
      if (e.user) return e.user.name;
      return e.action === 'login_failed' ? '' : 'Sistema';
    },
    initials: (e) => (e.user ? initials(e.user.name) : '?'),
    sentence,
    summary: (e) => summary(e.changes),
    time: (e) => timeFmt.format(new Date(e.createdAt)),
    tone: (e) => TONE[e.action] ?? 'bg-slate-100 text-slate-600',
    module: (e) => ENTITY[e.entity]?.[0] ?? e.entity,

    /** Filas del detalle: [etiqueta, antes|null, después|valor, esCambio] */
    rows(e) {
      if (!e.changes || typeof e.changes !== 'object') return [];
      return Object.entries(e.changes)
        .filter(([k]) => !HIDDEN.has(k))
        .map(([k, v]) => (isDiff(v)
          ? { label: FIELD[k] ?? k, before: formatValue(k, v.antes), after: formatValue(k, v.despues), diff: true }
          : { label: FIELD[k] ?? k, after: formatValue(k, v), diff: false }));
    },

    toggle(e) {
      this.open = this.open === e.id ? null : e.id;
    },
  }),
});
