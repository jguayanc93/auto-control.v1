// /api/daily — calendario de cobros.
//   Ver y marcar días: admin y operador. Cambiar o borrar una marca: solo admin.
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { BUSINESS, requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../lib/fields.js';
import { createRecordSchema, monthQuery, updateRecordSchema, vehicleParams } from './daily.schema.js';
import * as service from './daily.service.js';

const router = Router();
router.use(requireAuth, requireRole(...BUSINESS));

router.get('/overview', validate({ query: monthQuery }), async (req, res) => {
  res.json(await service.overview(req.ctx, req.valid.query.month));
});

router.get('/vehicles/:vehicleId', validate({ params: vehicleParams, query: monthQuery }), async (req, res) => {
  res.json(await service.calendar(req.ctx, req.valid.params.vehicleId, req.valid.query.month));
});

router.post('/records', validate({ body: createRecordSchema }), async (req, res) => {
  res.status(201).json(await service.create(req.ctx, req.valid.body));
});

router.patch('/records/:id', requireRole('admin'), validate({ params: idParams, body: updateRecordSchema }), async (req, res) => {
  res.json(await service.update(req.ctx, req.valid.params.id, req.valid.body));
});

router.delete('/records/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  await service.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

export default router;
