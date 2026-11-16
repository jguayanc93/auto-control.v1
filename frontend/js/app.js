// Arranque común de las páginas privadas:
//  1) verifica la sesión (si no hay, va al login)
//  2) verifica que el rol pueda ver la página
//  3) dibuja el layout (sidebar en PC, barra inferior en celular)
//  4) inicia Alpine con el componente de la página
//
// Uso en js/pages/x.js:
//   startPage({ page: 'vehiculos', title: 'Vehículos', component: () => ({ ... }) })
// y en el HTML: <main id="page" x-data="page"> ... </main>
import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.17.5/dist/module.esm.min.js';
import { can, HOME, loadSession, logout, ROLE_LABEL } from './session.js';
import { icon } from './ui/icons.js';
import { initials } from './utils/format.js';
import { credentialsSheetHTML } from './ui/credentials.js';

/** Piezas de UI reutilizables: <div data-ui="nombre"></div> se reemplaza por su HTML. */
const UI_PARTS = { 'credentials-sheet': credentialsSheetHTML };

export { Alpine };
export const BUSINESS = ['admin', 'operator'];

const NAV_BUSINESS = [
  { key: 'inicio', label: 'Inicio', href: '/inicio.html', icon: 'home' },
  { key: 'vehiculos', label: 'Vehículos', href: '/vehiculos.html', icon: 'car' },
  { key: 'pagos', label: 'Pagos', href: '/pagos.html', icon: 'wallet' },
  { key: 'documentos', label: 'Documentos', href: '/documentos.html', icon: 'file' },
  { key: 'mantenimientos', label: 'Mantenimiento', href: '/mantenimientos.html', icon: 'wrench' },
  { key: 'usuarios', label: 'Usuarios', href: '/usuarios.html', icon: 'users', perm: 'users:manage' },
  { key: 'bitacora', label: 'Bitácora', href: '/bitacora.html', icon: 'list', perm: 'audit:view' },
];
const NAV_SUPER = [
  { key: 'superadmin', label: 'Negocios', href: '/superadmin.html', icon: 'building' },
  { key: 'bitacora', label: 'Bitácora', href: '/bitacora.html', icon: 'list' },
];
const ACCOUNT = { key: 'cuenta', label: 'Mi cuenta', href: '/cuenta.html', icon: 'user' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Mensaje flotante: toast('Pago registrado') / toast('No se pudo guardar', 'error') */
export function toast(message, type = 'success') {
  Alpine.store('toast').show(message, type);
}

/**
 * Diálogo de confirmación. Devuelve true si el usuario confirma.
 *   if (!(await confirmAction({ title: '¿Eliminar?', message: '...', confirmText: 'Eliminar', danger: true }))) return;
 */
export function confirmAction({ title, message = '', confirmText = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    Object.assign(Alpine.store('confirm'), { open: true, title, message, confirmText, danger, resolve });
  });
}

/**
 * @param {object} opts
 * @param {string} opts.page   Clave de la página (marca el menú activo)
 * @param {string} opts.title   Título que se muestra en la cabecera
 * @param {string[]} [opts.roles] Roles que pueden ver la página
 * @param {() => object} [opts.component] Estado y métodos de Alpine para la página
 */
export async function startPage({ page, title, roles = BUSINESS, component = () => ({}) }) {
  let session;
  try {
    session = await loadSession();
  } catch (err) {
    return showFatal(err);
  }
  const { user } = session;
  if (!roles.includes(user.role)) return location.replace(HOME[user.role]);

  renderShell({ page, title, session });
  for (const el of document.querySelectorAll('[data-ui]')) el.outerHTML = UI_PARTS[el.dataset.ui]?.() ?? '';

  Alpine.store('shell', { more: false, logout });
  Alpine.store('toast', {
    items: [],
    show(message, type) {
      const id = crypto.randomUUID();
      this.items.push({ id, message, type });
      setTimeout(() => this.dismiss(id), type === 'error' ? 6000 : 3500);
    },
    dismiss(id) {
      this.items = this.items.filter((t) => t.id !== id);
    },
  });

  Alpine.store('confirm', {
    open: false, title: '', message: '', confirmText: '', danger: false, resolve: null,
    answer(value) {
      this.open = false;
      this.resolve?.(value);
      this.resolve = null;
    },
  });

  Alpine.data('page', () => {
    const base = { session, user, org: session.org, can: (perm) => can(user, perm) };
    // defineProperties conserva los getters (get total() {...}) del componente
    return Object.defineProperties(base, Object.getOwnPropertyDescriptors(component()));
  });

  window.Alpine = Alpine; // útil para depurar desde la consola
  Alpine.start();
  requestAnimationFrame(() => document.documentElement.classList.add('ready'));
}

function renderShell({ page, title, session }) {
  const { user, org } = session;
  const nav = (user.role === 'superadmin' ? NAV_SUPER : NAV_BUSINESS).filter((i) => !i.perm || can(user, i.perm));
  const bottom = nav.slice(0, 4);
  const more = [...nav.slice(4), ACCOUNT];
  const moreActive = more.some((i) => i.key === page);
  const subtitle = org?.name ?? 'Administración de la plataforma';
  const avatar = esc(initials(user.name));

  const sideLink = (i) => {
    const active = i.key === page;
    return `<a href="${i.href}" ${active ? 'aria-current="page"' : ''}
      class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}">
      ${icon(i.icon)}<span>${i.label}</span></a>`;
  };
  const bottomLink = (i) => {
    const active = i.key === page;
    return `<a href="${i.href}" ${active ? 'aria-current="page"' : ''}
      class="flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${active ? 'text-brand-600' : 'text-slate-500'}">
      <span class="flex h-7 w-12 items-center justify-center rounded-full ${active ? 'bg-brand-50' : ''}">${icon(i.icon, 'size-[22px]')}</span>${i.label}</a>`;
  };
  const sheetLink = (i) => `<a href="${i.href}" class="flex items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-medium ${i.key === page ? 'bg-brand-50 text-brand-700' : 'text-slate-700 active:bg-slate-100'}">
      <span class="flex size-10 items-center justify-center rounded-xl ${i.key === page ? 'bg-brand-100' : 'bg-slate-100'}">${icon(i.icon)}</span>
      <span class="flex-1">${i.label}</span>${icon('chevronRight', 'size-4 text-slate-400')}</a>`;

  const main = document.getElementById('page');
  main.classList.add('mx-auto', 'w-full', 'max-w-6xl', 'px-4', 'pt-4', 'pb-28', 'lg:px-8', 'lg:pt-8', 'lg:pb-12');

  const shell = document.createElement('div');
  shell.className = 'min-h-dvh lg:pl-64';
  shell.innerHTML = `
  <aside class="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-navy-900 px-4 py-6 lg:flex">
    <div class="flex items-center gap-3 px-2">
      <div class="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white">${icon('car')}</div>
      <div><p class="font-extrabold tracking-wider text-white">AUTO-CONTROL</p>
      <p class="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Gestión de flota</p></div>
    </div>
    <nav class="mt-8 flex-1 space-y-1">${nav.map(sideLink).join('')}</nav>
    <div class="space-y-1 border-t border-white/10 pt-4">
      <div class="flex items-center gap-3 px-3 pb-3">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">${avatar}</div>
        <div class="min-w-0"><p class="truncate text-sm font-semibold text-white">${esc(user.name)}</p>
        <p class="truncate text-xs text-slate-400">${ROLE_LABEL[user.role]}</p></div>
      </div>
      ${sideLink(ACCOUNT)}
      <button type="button" x-data @click="$store.shell.logout()" class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white">${icon('logout')}<span>Cerrar sesión</span></button>
    </div>
  </aside>

  <header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur pt-[env(safe-area-inset-top)]">
    <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 lg:h-16 lg:px-8">
      <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white lg:hidden">${icon('car', 'size-5')}</div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-[15px] font-semibold leading-tight lg:text-lg">${esc(title)}</p>
        <p class="truncate text-xs text-slate-500">${esc(subtitle)}</p>
      </div>
      <a href="/cuenta.html" title="Mi cuenta" class="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">${avatar}</a>
    </div>
  </header>

  <div data-slot></div>

  <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
    <div class="grid" style="grid-template-columns: repeat(${bottom.length + 1}, minmax(0, 1fr))">
      ${bottom.map(bottomLink).join('')}
      <button type="button" x-data @click="$store.shell.more = true"
        class="flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${moreActive ? 'text-brand-600' : 'text-slate-500'}">
        <span class="flex h-7 w-12 items-center justify-center rounded-full ${moreActive ? 'bg-brand-50' : ''}">${icon('menu', 'size-[22px]')}</span>Más</button>
    </div>
  </nav>

  <div x-data x-show="$store.shell.more" x-cloak class="fixed inset-0 z-50 lg:hidden" @keydown.escape.window="$store.shell.more = false">
    <div class="absolute inset-0 bg-slate-900/40" x-show="$store.shell.more" x-transition.opacity @click="$store.shell.more = false"></div>
    <div x-show="$store.shell.more"
      x-transition:enter="transition duration-200 ease-out" x-transition:enter-start="translate-y-full" x-transition:enter-end="translate-y-0"
      x-transition:leave="transition duration-150 ease-in" x-transition:leave-start="translate-y-0" x-transition:leave-end="translate-y-full"
      class="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
      <div class="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200"></div>
      <div class="mb-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
        <div class="flex size-11 items-center justify-center rounded-full bg-brand-600 font-bold text-white">${avatar}</div>
        <div class="min-w-0"><p class="truncate font-semibold">${esc(user.name)}</p>
        <p class="truncate text-xs text-slate-500">${ROLE_LABEL[user.role]} · ${esc(subtitle)}</p></div>
      </div>
      <div class="space-y-1">${more.map(sheetLink).join('')}</div>
      <button type="button" @click="$store.shell.logout()" class="btn btn-danger btn-block mt-4">${icon('logout')}Cerrar sesión</button>
    </div>
  </div>

  <div x-data x-show="$store.confirm.open" x-cloak class="fixed inset-0 z-[70] flex items-center justify-center p-6"
    @keydown.escape.window="$store.confirm.open && $store.confirm.answer(false)">
    <div class="absolute inset-0 bg-slate-900/50" x-show="$store.confirm.open" x-transition.opacity @click="$store.confirm.answer(false)"></div>
    <div class="card relative w-full max-w-sm p-5" x-show="$store.confirm.open" x-transition role="alertdialog" aria-modal="true">
      <p class="font-semibold" x-text="$store.confirm.title"></p>
      <p class="mt-1.5 text-sm text-slate-500" x-show="$store.confirm.message" x-text="$store.confirm.message"></p>
      <div class="mt-5 grid grid-cols-2 gap-3">
        <button type="button" class="btn btn-secondary" @click="$store.confirm.answer(false)">Cancelar</button>
        <button type="button" class="btn text-white" :class="$store.confirm.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-600 hover:bg-brand-700'"
          @click="$store.confirm.answer(true)" x-text="$store.confirm.confirmText"></button>
      </div>
    </div>
  </div>

  <div x-data aria-live="polite" class="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:top-auto lg:right-6 lg:bottom-6 lg:items-end">
    <template x-for="t in $store.toast.items" :key="t.id">
      <div x-transition.opacity @click="$store.toast.dismiss(t.id)"
        class="pointer-events-auto w-full max-w-sm rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg"
        :class="t.type === 'error' ? 'bg-rose-600' : 'bg-navy-900'" x-text="t.message"></div>
    </template>
  </div>`;

  main.replaceWith(shell);
  shell.querySelector('[data-slot]').replaceWith(main);
}

function showFatal(err) {
  const suspended = err?.status === 403;
  document.body.innerHTML = `
    <div class="flex min-h-dvh items-center justify-center p-6">
      <div class="card w-full max-w-sm p-6 text-center">
        <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">${icon('alert', 'size-6')}</div>
        <p class="font-semibold">${suspended ? 'Cuenta suspendida' : 'No se pudo cargar la página'}</p>
        <p class="mt-1 text-sm text-slate-500">${esc(err?.message ?? 'Error desconocido')}</p>
        ${suspended
          ? '<a href="/login.html" class="btn btn-primary btn-block mt-5">Ir al inicio de sesión</a>'
          : '<button onclick="location.reload()" class="btn btn-primary btn-block mt-5">Reintentar</button>'}
      </div>
    </div>`;
  document.documentElement.classList.add('ready');
}
