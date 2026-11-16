// /api/expenses — registrar y ver: admin y operador. Corregir y eliminar: solo admin.
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { BUSINESS, requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../lib/fields.js';
import { createExpenseSchema, listExpensesQuery, updateExpenseSchema } from './expenses.schema.js';
import * as service from './expenses.service.js';

const router = Router();
router.use(requireAuth, requireRole(...BUSINESS));

router.get('/', validate({ query: listExpensesQuery }), async (req, res) => {
  res.json({ items: await service.list(req.ctx, req.valid.query) });
});

router.post('/', validate({ body: createExpenseSchema }), async (req, res) => {
  res.status(201).json(await service.create(req.ctx, req.valid.body));
});

router.patch('/:id', requireRole('admin'), validate({ params: idParams, body: updateExpenseSchema }), async (req, res) => {
  res.json(await service.update(req.ctx, req.valid.params.id, req.valid.body));
});

router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  await service.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

export default router;
