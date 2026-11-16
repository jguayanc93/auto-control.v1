// Formatos para Perú.

const moneyFmt = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });

/** 1234.5 | '1234.50' → 'S/ 1,234.50' */
export const money = (value) => `S/ ${moneyFmt.format(Number(value ?? 0))}`;

/** '2026-11-12' → '12 nov. 2026' */
export const date = (iso) => (iso ? dateFmt.format(new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)) : '—');

/** ISO con hora → '12 nov. 2026, 3:45 p. m.' (hora de Lima) */
export const dateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');

/** Hoy en Lima como 'YYYY-MM-DD' (para valores por defecto de inputs type=date). */
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

/** 'Carlos Ramírez' → 'CR' */
export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

/** Saludo según la hora en Lima. */
export function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Lima' }).format(new Date()));
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/** 'ABC123' → 'ABC-123' (formato de placa peruana). */
export const plate = (p = '') => (p.length === 6 ? `${p.slice(0, 3)}-${p.slice(3)}` : p);

export const VEHICLE_STATUS = {
  disponible: { label: 'Disponible', cls: 'bg-emerald-50 text-emerald-700' },
  alquilado: { label: 'Alquilado', cls: 'bg-brand-50 text-brand-700' },
  taller: { label: 'En taller', cls: 'bg-amber-50 text-amber-700' },
  inactivo: { label: 'Inactivo', cls: 'bg-slate-100 text-slate-500' },
};

/** Días del contrato que faltan marcar en el calendario. */
export function pendingInfo(n) {
  if (n > 0) return { label: `${n} por marcar`, cls: 'text-amber-600', tone: 'bg-amber-50 text-amber-700' };
  return { label: 'Al día', cls: 'text-emerald-600', tone: 'bg-emerald-50 text-emerald-700' };
}

/** Estados del calendario de cobros (colores del bosquejo). */
export const DAY_STATUS = {
  pagado: { label: 'Pagó', legend: 'Pago registrado', dot: 'bg-emerald-500', ring: 'ring-emerald-500', soft: 'bg-emerald-50 text-emerald-700', btn: 'bg-emerald-500 text-white' },
  medio: { label: 'Media cuenta', legend: 'Cancela ½ día', dot: 'bg-yellow-400', ring: 'ring-yellow-400', soft: 'bg-yellow-50 text-yellow-800', btn: 'bg-yellow-400 text-yellow-950' },
  no_pago: { label: 'No se paga cuenta', legend: 'No se paga cuenta', dot: 'bg-rose-500', ring: 'ring-rose-500', soft: 'bg-rose-50 text-rose-700', btn: 'bg-rose-500 text-white' },
  fuera_servicio: { label: 'Fuera de servicio', legend: 'Fuera de servicio', dot: 'bg-purple-500', ring: 'ring-purple-500', soft: 'bg-purple-50 text-purple-700', btn: 'bg-purple-500 text-white' },
};

export const PAYMENT_METHOD = { efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia', otro: 'Otro' };
export const EXPENSE_CATEGORY = { mantenimiento: 'Mantenimiento', servicio: 'Servicio', accesorio: 'Accesorio', otro: 'Otro' };
/** Tipos que se pueden elegir al registrar un gasto (los mantenimientos van en su módulo). */
export const EXPENSE_CATEGORY_NEW = { servicio: 'Servicio', accesorio: 'Accesorio', otro: 'Otro' };

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
/** '2026-11' → 'Noviembre 2026' */
export const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
/** '2026-11' + 1 → '2026-12' */
export function addMonths(m, n) {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
/** '2026-11-13' → 'viernes, 13 de noviembre' */
export const longDate = (iso) =>
  new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/** Enlace para llamar. */
export const telLink = (phone) => (phone ? `tel:${phone}` : null);

/** Enlace de WhatsApp (celulares de Perú: 9 dígitos que empiezan con 9 → +51). */
export function waLink(phone, text = '') {
  if (!phone) return null;
  let n = phone.replace(/\D/g, '');
  if (n.length === 9 && n.startsWith('9')) n = `51${n}`;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export const DOC_TYPE = {
  soat: 'SOAT', revision_tecnica: 'Revisión técnica', tarjeta_propiedad: 'Tarjeta de propiedad',
  tarjeta_circulacion: 'Tarjeta de circulación', revision_chip_gas: 'Revisión anual chip de gas',
  revision_quinquenal_gas: 'Revisión quinquenal balón de gas',
  contrato: 'Contrato', licencia: 'Licencia', otro: 'Otro',
};

export const DOC_STATUS = {
  vencido: { label: 'Vencido', tone: 'bg-rose-50 text-rose-700', cls: 'text-rose-600' },
  por_vencer: { label: 'Por vencer', tone: 'bg-amber-50 text-amber-700', cls: 'text-amber-600' },
  vigente: { label: 'Vigente', tone: 'bg-emerald-50 text-emerald-700', cls: 'text-emerald-600' },
  sin_fecha: { label: 'Sin vencimiento', tone: 'bg-slate-100 text-slate-500', cls: 'text-slate-500' },
};

/** -5 → 'venció hace 5 días'; 0 → 'vence hoy'; 12 → 'vence en 12 días' */
export function expiryText(days) {
  if (days == null) return 'Sin fecha de vencimiento';
  if (days < 0) return `Venció hace ${-days} día${days === -1 ? '' : 's'}`;
  if (days === 0) return 'Vence hoy';
  return `Vence en ${days} día${days === 1 ? '' : 's'}`;
}

// ───── Mantenimiento ─────
const kmFmt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
/** 45200 → '45,200 km' */
export const km = (n) => (n == null || n === '' ? '—' : `${kmFmt.format(Number(n))} km`);

export const MAINT_STATUS = {
  atrasado: { label: 'Atrasado', tone: 'bg-rose-50 text-rose-700', cls: 'text-rose-600' },
  proximo: { label: 'Próximo', tone: 'bg-amber-50 text-amber-700', cls: 'text-amber-600' },
  al_dia: { label: 'Al día', tone: 'bg-emerald-50 text-emerald-700', cls: 'text-emerald-600' },
  reemplazado: { label: 'Ya se hizo', tone: 'bg-slate-100 text-slate-500', cls: 'text-slate-500' },
  sin_programar: { label: 'Sin próximo', tone: 'bg-slate-100 text-slate-500', cls: 'text-slate-500' },
};

/** Tipos frecuentes (el campo es libre; estos son atajos). */
export const MAINT_TYPES = ['Cambio de aceite', 'Filtros', 'Frenos', 'Llantas', 'Batería', 'Alineamiento y balanceo', 'Afinamiento', 'Suspensión', 'Reparación', 'Revisión general'];

/** Texto de lo que falta para el próximo servicio: 'Faltan 800 km · en 12 días' */
export function nextText(n) {
  if (!n || n.status === 'sin_programar') return 'Sin próximo servicio';
  const parts = [];
  if (n.kmLeft != null) parts.push(n.kmLeft > 0 ? `Faltan ${km(n.kmLeft)}` : `Pasado por ${km(-n.kmLeft)}`);
  else if (n.nextKm != null) parts.push(`A los ${km(n.nextKm)}`);
  if (n.daysLeft != null) {
    const d = n.daysLeft;
    parts.push(d < 0 ? `venció hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'vence hoy' : `en ${d} día${d === 1 ? '' : 's'}`);
  }
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
