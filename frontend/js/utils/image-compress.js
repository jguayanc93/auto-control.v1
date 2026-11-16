// Reduce fotos antes de subirlas (las del celular pesan 4–8 MB; quedan en ~300–500 KB).
// Los PDF y las imágenes ya livianas se envían tal cual.

const MAX_SIDE = 1600;
const QUALITY = 0.8;
const SKIP_BELOW_BYTES = 400 * 1024;

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch { /* respaldo abajo */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {File} file
 * @returns {Promise<File>} la imagen comprimida en JPEG, o el archivo original
 */
export async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.size <= SKIP_BELOW_BYTES) return file;
  try {
    const bmp = await loadBitmap(file);
    const w = bmp.width;
    const h = bmp.height;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, '') || 'foto';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file; // si el navegador no puede procesarla, se sube la original
  }
}

/** 1536000 → '1.5 MB' */
export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
