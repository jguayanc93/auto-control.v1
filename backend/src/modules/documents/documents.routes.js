// /api/documents — ver y subir: admin y operador. Editar datos y eliminar: solo admin.
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { BUSINESS, requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { uploadSingle } from '../../middleware/upload.js';
import { idParams } from '../../lib/fields.js';
import { createDocumentSchema, listDocumentsQuery, updateDocumentSchema } from './documents.schema.js';
import * as service from './documents.service.js';

const router = Router();
router.use(requireAuth, requireRole(...BUSINESS));

router.get('/', validate({ query: listDocumentsQuery }), async (req, res) => {
  res.json({ items: await service.list(req.ctx, req.valid.query) });
});

router.get('/alerts', async (req, res) => {
  res.json(await service.alerts(req.ctx));
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json(await service.get(req.ctx, req.valid.params.id));
});

/** Ver (inline) o descargar (?download=1) el archivo. */
router.get('/:id/file', validate({ params: idParams }), async (req, res) => {
  const f = await service.getFile(req.ctx, req.valid.params.id);
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.set({
    'Content-Type': f.mimeType,
    'Content-Length': f.data.length,
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
    'Cache-Control': 'private, max-age=300',
  });
  res.send(f.data);
});

// multipart/form-data: campo `file` + datos del documento
router.post('/', uploadSingle, validate({ body: createDocumentSchema }), async (req, res) => {
  res.status(201).json(await service.create(req.ctx, req.valid.body, req.file));
});

router.patch('/:id', requireRole('admin'), validate({ params: idParams, body: updateDocumentSchema }), async (req, res) => {
  res.json(await service.update(req.ctx, req.valid.params.id, req.valid.body));
});

router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  await service.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

export default router;
