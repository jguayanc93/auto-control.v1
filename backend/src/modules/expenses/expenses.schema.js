import { z } from 'zod';
import { money, optionalText, pastOrToday, uuidField } from '../../lib/fields.js';
import { isMonth } from '../../lib/dates.js';

export const EXPENSE_CATEGORIES = ['mantenimiento', 'servicio', 'accesorio', 'otro'];
/** 'mantenimiento' queda solo para gastos antiguos: ahora se registra en el módulo Mantenimiento. */
const category = z.enum(['servicio', 'accesorio', 'otro'], {
  error: (issue) => (issue.input === 'mantenimiento'
    ? 'Los mantenimientos y reparaciones se registran en el módulo Mantenimiento'
    : 'Selecciona el tipo de gasto'),
});

export const createExpenseSchema = z.object({
  vehicleId: uuidField('Selecciona un vehículo'),
  date: pastOrToday('la fecha'),
  category,
  amount: money({ label: 'el monto' }),
  description: optionalText(255),
});

export const updateExpenseSchema = z
  .object({
    date: pastOrToday('la fecha').optional(),
    category: category.optional(),
    amount: money({ label: 'el monto' }).optional(),
    description: optionalText(255),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'No hay cambios para guardar' });

export const listExpensesQuery = z.object({
  vehicleId: z.uuid().optional(),
  month: z.string().refine(isMonth, 'Mes inválido (YYYY-MM)').optional(),
});
