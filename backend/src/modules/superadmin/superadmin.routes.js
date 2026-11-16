// /api/superadmin/businesses — solo superadmin.
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { createBusinessSchema, idParams, resetPasswordSchema, updateBusinessSchema } from './superadmin.schema.js';
import * as service from './superadmin.service.js';

const router = Router();
router.use(requireAuth, requireRole('superadmin'));

router.get('/', async (req, res) => {
  res.json({ items: await service.list() });
});

router.post('/', validate({ body: createBusinessSchema }), async (req, res) => {
  res.status(201).json(await service.create(req.ctx, req.valid.body));
});

router.patch('/:id', validate({ params: idParams, body: updateBusinessSchema }), async (req, res) => {
  res.json(await service.update(req.ctx, req.valid.params.id, req.valid.body));
});

router.post('/:id/suspend', validate({ params: idParams }), async (req, res) => {
  res.json(await service.setStatus(req.ctx, req.valid.params.id, 'suspended'));
});

router.post('/:id/activate', validate({ params: idParams }), async (req, res) => {
  res.json(await service.setStatus(req.ctx, req.valid.params.id, 'active'));
});

router.post('/:id/reset-password', validate({ params: idParams, body: resetPasswordSchema }), async (req, res) => {
  res.json(await service.resetAdminPassword(req.ctx, req.valid.params.id, req.valid.body));
});

export default router;
