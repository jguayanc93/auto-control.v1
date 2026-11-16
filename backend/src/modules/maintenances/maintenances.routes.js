// /api/maintenances — registrar y ver: admin y operador. Corregir y eliminar: solo admin.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { BUSINESS, requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../lib/fields.js';
import { createMaintenanceSchema, listMaintenancesQuery, updateMaintenanceSchema } from './maintenances.schema.js';
import * as service from './maintenances.service.js';
import { exportXlsx } from './maintenances.export.js';

const router = Router();
router.use(requireAuth, requireRole(...BUSINESS));

router.get('/', validate({ query: listMaintenancesQuery }), async (req, res) => {
  res.json({ items: await service.list(req.ctx, req.valid.query) });
});

/** Próximos servicios programados (último de cada tipo por vehículo). */
router.get('/upcoming', validate({ query: z.object({ vehicleId: z.uuid().optional() }) }), async (req, res) => {
  res.json({ items: await service.upcoming(req.ctx, req.valid.query) });
});

router.get('/alerts', async (req, res) => {
  res.json(await service.alerts(req.ctx));
});

/** Excel del registro (?vehicleId= opcional). */
router.get('/export', validate({ query: z.object({ vehicleId: z.uuid().optional() }) }), async (req, res) => {
  const { buffer, fileName } = await exportXlsx(req.ctx, req.valid.query);
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
  });
  res.send(buffer);
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json(await service.get(req.ctx, req.valid.params.id));
});

router.post('/', validate({ body: createMaintenanceSchema }), async (req, res) => {
  res.status(201).json(await service.create(req.ctx, req.valid.body));
});

router.patch('/:id', requireRole('admin'), validate({ params: idParams, body: updateMaintenanceSchema }), async (req, res) => {
  res.json(await service.update(req.ctx, req.valid.params.id, req.valid.body));
});

router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  await service.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

export default router;
