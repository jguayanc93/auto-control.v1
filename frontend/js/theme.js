// Tema de Tailwind (CDN v4) compartido por todas las páginas.
// Se carga ANTES del script de Tailwind: inserta el <style type="text/tailwindcss"> que Tailwind compila.
// Cuando se pase a Tailwind CLI (sin CDN), este contenido se mueve tal cual a un archivo .css.
(function () {
  const css = String.raw`
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --color-brand-50: #eff6ff;
  --color-brand-100: #dbeafe;
  --color-brand-200: #bfdbfe;
  --color-brand-500: #3b82f6;
  --color-brand-600: #2563eb;
  --color-brand-700: #1d4ed8;
  --color-navy-950: #0b1120;
  --color-navy-900: #101827;
  --color-navy-800: #1a2436;
  --color-navy-700: #26364d;
}

@layer base {
  html { -webkit-tap-highlight-color: transparent; }
  body { @apply bg-slate-100 text-slate-900 antialiased; }
  [x-cloak] { display: none !important; }
}

@layer components {
  .btn { @apply inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold select-none transition active:scale-[.98] disabled:opacity-60 disabled:pointer-events-none; }
  .btn-primary { @apply bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700; }
  .btn-secondary { @apply bg-white text-slate-700 border border-slate-300 hover:bg-slate-50; }
  .btn-ghost { @apply text-slate-600 hover:bg-slate-100; }
  .btn-danger { @apply bg-white text-rose-600 border border-rose-200 hover:bg-rose-50; }
  .btn-block { @apply w-full; }

  /* text-base (16px) evita que iPhone haga zoom al tocar un campo */
  .input { @apply block w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100; }
  .input-error { @apply border-rose-400 focus:border-rose-500 focus:ring-rose-100; }
  .label { @apply block mb-1.5 text-sm font-medium text-slate-700; }
  .field-error { @apply mt-1 text-xs text-rose-600; }

  .card { @apply bg-white rounded-2xl border border-slate-200/80 shadow-sm; }
  .pill { @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold; }
  /* Panel que sube desde abajo en celular / modal centrado en PC */
  .sheet-wrap { @apply fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6; }
  .sheet-backdrop { @apply absolute inset-0 bg-slate-900/50; }
  .sheet { @apply relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl lg:max-w-lg lg:rounded-3xl; }
  .sheet-header { @apply flex items-center gap-3 border-b border-slate-100 px-5 py-4; }
  .sheet-body { @apply overflow-y-auto overscroll-contain px-5 py-5; }
  .sheet-footer { @apply flex gap-3 border-t border-slate-100 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-4; }
  .icon-btn { @apply inline-flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 active:bg-slate-200; }

  .page-title { @apply text-xl font-bold tracking-tight text-slate-900 lg:text-2xl; }
  .page-sub { @apply text-sm text-slate-500; }
}`;
  const style = document.createElement('style');
  style.type = 'text/tailwindcss';
  style.textContent = css;
  document.head.appendChild(style);

  // Oculta la página hasta que el layout y los estilos estén listos (evita "parpadeo").
  const hide = document.createElement('style');
  hide.textContent = 'html:not(.ready) body{opacity:0}body{transition:opacity .15s}';
  document.head.appendChild(hide);
  setTimeout(() => document.documentElement.classList.add('ready'), 2500); // por si algo falla
})();
