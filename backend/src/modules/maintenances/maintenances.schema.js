import { z } from 'zod';
import { date, emptyToNull, money, optionalInt, optionalText, pastOrToday, text, uuidField } from '../../lib/fields.js';
import { isMonth } from '../../lib/dates.js';

export const NEXT_STATUSES = ['atrasado', 'proximo', 'al_dia'];

const km = optionalInt(0, 9_999_999, 'Kilometraje');
const optionalDate = (label) => z.preprocess(emptyToNull, date(label).nullable().optional());
/** Montos de repuestos y mano de obra: pueden ser 0 (garantía, cortesía). Vacío → 0. */
const amount = (label) => z.preprocess((v) => (v === '' || v == null ? '0' : v), money({ min: 0, label }));

const fields = {
  doneOn: pastOrToday('la fecha'),
  type: text('el tipo de servicio', 80),
  km,
  partsCost: amount('el costo de repuestos'),
  laborCost: amount('el costo de mano de obra'),
  workshop: optionalText(120),
  detail: optionalText(1000),
  nextKm: km,
  nextDate: optionalDate('la fecha del próximo servicio'),
};

/** Reglas entre campos (se revalidan en el servicio al editar con los valores guardados). */
export function checkOrder(d) {
  const errors = {};
  if (d.km != null && d.nextKm != null && d.nextKm <= d.km) errors.nextKm = 'Debe ser mayor al kilometraje del servicio';
  if (d.doneOn && d.nextDate && d.nextDate <= d.doneOn) errors.nextDate = 'Debe ser posterior a la fecha del servicio';
  return errors;
}

const orderRefine = (d, ctx) => {
  for (const [path, message] of Object.entries(checkOrder(d))) ctx.addIssue({ code: 'custom', path: [path], message });
};

export const createMaintenanceSchema = z.object({ vehicleId: uuidField('Selecciona un vehículo'), ...fields }).superRefine(orderRefine);

export const updateMaintenanceSchema = z
  .object({
    ...fields,
    doneOn: fields.doneOn.optional(),
    type: fields.type.optional(),
    partsCost: fields.partsCost.optional(),
    laborCost: fields.laborCost.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'No hay cambios para guardar' });

export const listMaintenancesQuery = z.object({
  vehicleId: z.uuid().optional(),
  month: z.string().refine(isMonth, 'Mes inválido (YYYY-MM)').optional(),
});
