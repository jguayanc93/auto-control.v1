// Recepción de archivos (multipart/form-data) en memoria; luego se guardan en la BD.
import multer from 'multer';
import { env } from '../config/env.js';

/** Un solo archivo en el campo `file`, con el límite de tamaño configurado. */
export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 20 },
}).single('file');
