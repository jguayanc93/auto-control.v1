// /api/vehicles — ver y crear: admin y operador. Editar y eliminar: solo admin.
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { BUSINESS, requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../lib/fields.js';
import { createVehicleSchema, listVehiclesQuery, updateVehicleSchema } from './vehicles.schema.js';
import * as service from './vehicles.service.js';

const router = Router();
router.use(requireAuth, requireRole(...BUSINESS));

router.get('/', validate({ query: listVehiclesQuery }), async (req, res) => {
  res.json({ items: await service.list(req.ctx, req.valid.query) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json(await service.get(req.ctx, req.valid.params.id));
});

router.post('/', validate({ body: createVehicleSchema }), async (req, res) => {
  res.status(201).json(await service.create(req.ctx, req.valid.body));
});

router.patch('/:id', requireRole('admin'), validate({ params: idParams, body: updateVehicleSchema }), async (req, res) => {
  res.json(await service.update(req.ctx, req.valid.params.id, req.valid.body));
});

router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  await service.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

export default router;
