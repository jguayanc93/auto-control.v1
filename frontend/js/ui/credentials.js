// Panel "Datos de acceso": muestra usuario + contraseña recién generada (una sola vez)
// con botones para copiar o enviar por WhatsApp.
//
// Uso en una página:
//   HTML:  <div data-ui="credentials-sheet"></div>   (dentro de <main x-data="page">)
//   JS:    component: () => mix(credentialsMixin(), { ... this.showCredentials({...}) ... })
// El componente debe tener la propiedad `sheet` (panel abierto).
import { icon } from './icons.js';
import { copyText } from '../utils/clipboard.js';

export function credentialsMixin() {
  return {
    /** { username, password, recipientName, context? } */
    creds: null,

    showCredentials(creds) {
      this.creds = creds;
      this.sheet = 'credentials';
    },

    closeCredentials() {
      this.sheet = null;
      this.creds = null;
    },

    get credsText() {
      const c = this.creds;
      if (!c) return '';
      return [
        `Hola ${(c.recipientName ?? '').split(' ')[0]}, estos son tus datos de acceso a AUTO-CONTROL:`,
        c.context,
        `Usuario: ${c.username}`,
        `Contraseña: ${c.password}`,
        `Ingresa en: ${location.origin}`,
        'Te recomendamos cambiar la contraseña en "Mi cuenta".',
      ].filter(Boolean).join('\n');
    },

    get whatsappUrl() {
      return `https://wa.me/?text=${encodeURIComponent(this.credsText)}`;
    },

    async copyCreds() {
      const ok = await copyText(this.credsText);
      this.$store.toast.show(ok ? 'Datos copiados' : 'No se pudo copiar. Cópialos manualmente.', ok ? 'success' : 'error');
    },
  };
}

export function credentialsSheetHTML() {
  return `
  <div class="sheet-wrap" x-show="sheet === 'credentials'" x-cloak>
    <div class="sheet-backdrop" x-show="sheet === 'credentials'" x-transition.opacity></div>
    <div class="sheet" x-show="sheet === 'credentials'" role="dialog" aria-modal="true"
      x-transition:enter="transition duration-200 ease-out" x-transition:enter-start="translate-y-full lg:translate-y-4 lg:opacity-0"
      x-transition:leave="transition duration-150 ease-in" x-transition:leave-end="translate-y-full lg:translate-y-4 lg:opacity-0">
      <template x-if="creds">
        <div class="flex min-h-0 flex-col">
          <div class="sheet-body text-center">
            <span class="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">${icon('check', 'size-7')}</span>
            <p class="mt-3 text-lg font-semibold">Datos de acceso</p>
            <p class="mt-1 text-sm text-slate-500" x-text="'Compártelos con ' + creds.recipientName + '.'"></p>

            <div class="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 text-left">
              <div class="flex items-center justify-between gap-3"><span class="text-sm text-slate-500">Usuario</span>
                <span class="font-mono text-base font-semibold select-all" x-text="creds.username"></span></div>
              <div class="flex items-center justify-between gap-3"><span class="text-sm text-slate-500">Contraseña</span>
                <span class="font-mono text-base font-semibold select-all" x-text="creds.password"></span></div>
            </div>

            <p class="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-left text-xs text-amber-800">
              <span class="mt-0.5 shrink-0">${icon('alert', 'size-4')}</span>
              Esta contraseña no se volverá a mostrar. Cópiala o envíala ahora.
            </p>

            <div class="mt-5 grid grid-cols-2 gap-2">
              <button type="button" class="btn btn-secondary" @click="copyCreds">Copiar</button>
              <a class="btn bg-[#25D366] text-white hover:bg-[#1ebe5a]" :href="whatsappUrl" target="_blank" rel="noopener">WhatsApp</a>
            </div>
          </div>
          <div class="sheet-footer">
            <button type="button" class="btn btn-primary btn-block" @click="closeCredentials">Listo</button>
          </div>
        </div>
      </template>
    </div>
  </div>`;
}
