// Errores de negocio con su código HTTP. Los servicios lanzan estos errores
// y el errorHandler los convierte en { error: { message, code, details } }.

export class AppError extends Error {
  /**
   * @param {number} status  Código HTTP
   * @param {string} message Mensaje para mostrar al usuario (en español)
   * @param {string} code    Código estable para el frontend
   * @param {unknown} [details]
   */
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg = 'Solicitud inválida', details) => new AppError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Debes iniciar sesión') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'No tienes permiso para esta acción') => new AppError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Registro no encontrado') => new AppError(404, msg, 'NOT_FOUND');
export const conflict = (msg = 'El registro ya existe', details) => new AppError(409, msg, 'CONFLICT', details);
