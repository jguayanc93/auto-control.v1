// /api/renters — ver y crear: admin y operador. Editar y eliminar: solo admin.
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { BUSINESS, requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../lib/fields.js';
import { createRenterSchema, listRentersQuery, updateRenterSchema } from './renters.schema.js';
import * as service from './renters.service.js';

const router = Router();
router.use(requireAuth, requireRole(...BUSINESS));

router.get('/', validate({ query: listRentersQuery }), async (req, res) => {
  res.json({ items: await service.list(req.ctx, req.valid.query) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json(await service.get(req.ctx, req.valid.params.id));
});

router.post('/', validate({ body: createRenterSchema }), async (req, res) => {
  res.status(201).json(await service.create(req.ctx, req.valid.body));
});

router.patch('/:id', requireRole('admin'), validate({ params: idParams, body: updateRenterSchema }), async (req, res) => {
  res.json(await service.update(req.ctx, req.valid.params.id, req.valid.body));
});

router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  await service.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

export default router;
