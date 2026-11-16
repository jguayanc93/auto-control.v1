// Cliente de la API. Todas las llamadas pasan por aquí.
//   const data = await api.get('/vehicles')
//   await api.post('/payments', { ... })
// Errores: lanza ApiError con .status, .message (en español) y .fields (errores por campo).

export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.fields = details?.fields ?? {};
  }
}

export function goToLogin() {
  const next = location.pathname + location.search;
  location.href = `/login.html${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;
}

/**
 * @param {string} path  Ruta sin el prefijo /api (ej. '/auth/me')
 * @param {{ method?: string, body?: any, form?: FormData, redirectOn401?: boolean, signal?: AbortSignal }} [opts]
 */
export async function api(path, { method = 'GET', body, form, redirectOn401 = true, signal } = {}) {
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' }, signal };
  if (form) init.body = form;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, init);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'No hay conexión con el servidor. Revisa tu internet e inténtalo otra vez.', 'NETWORK');
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (res.status === 401 && redirectOn401) {
    goToLogin();
    return new Promise(() => {}); // la página se está yendo: no continuar
  }
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.message ?? 'Ocurrió un error. Inténtalo otra vez.', e.code, e.details);
  }
  return data;
}

api.get = (path, opts) => api(path, { ...opts, method: 'GET' });
api.post = (path, body, opts) => api(path, { ...opts, method: 'POST', body });
api.patch = (path, body, opts) => api(path, { ...opts, method: 'PATCH', body });
api.del = (path, opts) => api(path, { ...opts, method: 'DELETE' });
api.upload = (path, form, opts) => api(path, { ...opts, method: 'POST', form });
