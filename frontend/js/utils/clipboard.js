/**
 * Copia texto al portapapeles. navigator.clipboard solo funciona con HTTPS o localhost;
 * en la red local (http://192.168...) se usa el método clásico como respaldo.
 * @returns {Promise<boolean>} true si se copió
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* usar respaldo */ }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  Object.assign(ta.style, { position: 'fixed', top: '0', opacity: '0' });
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* sin soporte */ }
  ta.remove();
  return ok;
}
