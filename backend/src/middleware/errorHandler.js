// Respuesta de error uniforme: { error: { message, code, details? } }
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';

export function apiNotFound(req, res) {
  res.status(404).json({ error: { message: 'Ruta no encontrada', code: 'NOT_FOUND' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = 500;
  let body = { message: 'Ocurrió un error inesperado. Intenta nuevamente.', code: 'INTERNAL' };

  if (err instanceof AppError) {
    status = err.status;
    body = { message: err.message, code: err.code, details: err.details };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { message: 'El formato de los datos enviados no es válido', code: 'BAD_JSON' };
  } else if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    body = { message: `El archivo supera el máximo de ${env.MAX_UPLOAD_MB} MB`, code: 'TOO_LARGE' };
  } else if (err?.name === 'MulterError') {
    status = 400;
    body = { message: 'No se pudo recibir el archivo. Adjunta un solo archivo en el campo indicado.', code: 'BAD_UPLOAD' };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      body = { message: 'Ya existe un registro con esos datos', code: 'CONFLICT', details: { fields: err.meta?.target } };
    } else if (err.code === 'P2025') {
      status = 404;
      body = { message: 'Registro no encontrado', code: 'NOT_FOUND' };
    }
  }

  if (status >= 500) console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n`, err);
  if (!body.details) delete body.details;
  res.status(status).json({ error: body });
}
