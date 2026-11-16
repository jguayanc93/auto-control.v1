import { z } from 'zod';
import { date, emptyToUndefined, money, optionalText, uuidField } from '../../lib/fields.js';
import { isMonth } from '../../lib/dates.js';
import { DAY_STATUSES } from '../../lib/calendar.js';

export const PAYMENT_METHODS = ['efectivo', 'yape', 'plin', 'transferencia', 'otro'];

export const monthQuery = z.object({
  month: z.string().refine(isMonth, 'Mes inválido (YYYY-MM)').optional(),
});

export const vehicleParams = z.object({ vehicleId: z.uuid('Identificador inválido') });

const status = z.enum(DAY_STATUSES, { error: 'Selecciona qué pasó ese día' });
/** Si no se envía, se usa la tarifa (verde) o la mitad (amarillo). */
const amount = z.preprocess(emptyToUndefined, money({ min: 0, label: 'el monto' }).optional());
const method = z.preprocess(emptyToUndefined, z.enum(PAYMENT_METHODS, { error: 'Método inválido' }).optional());

export const createRecordSchema = z.object({
  vehicleId: uuidField('Selecciona un vehículo'),
  date: date('la fecha'),
  status,
  amount,
  method,
  note: optionalText(255),
});

export const updateRecordSchema = z
  .object({ status: status.optional(), amount, method, note: optionalText(255) })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'No hay cambios para guardar' });
