// /api/rentals — ver, iniciar y finalizar contratos: admin y operador.
// Corregir y eliminar: solo admin (el operador no edita registros).
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { BUSINESS, requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../lib/fields.js';
import { createRentalSchema, finishRentalSchema, listRentalsQuery, updateRentalSchema } from './rentals.schema.js';
import * as service from './rentals.service.js';

const router = Router();
router.use(requireAuth, requireRole(...BUSINESS));

router.get('/', validate({ query: listRentalsQuery }), async (req, res) => {
  res.json({ items: await service.list(req.ctx, req.valid.query) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json(await service.get(req.ctx, req.valid.params.id));
});

router.post('/', validate({ body: createRentalSchema }), async (req, res) => {
  res.status(201).json(await service.create(req.ctx, req.valid.body));
});

router.patch('/:id', requireRole('admin'), validate({ params: idParams, body: updateRentalSchema }), async (req, res) => {
  res.json(await service.update(req.ctx, req.valid.params.id, req.valid.body));
});

router.post('/:id/finish', validate({ params: idParams, body: finishRentalSchema }), async (req, res) => {
  res.json(await service.finish(req.ctx, req.valid.params.id, req.valid.body));
});

router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  await service.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

export default router;
