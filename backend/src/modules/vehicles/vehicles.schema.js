import { z } from 'zod';
import { optionalInt, optionalText, text } from '../../lib/fields.js';

/** Placa: mayúsculas, sin espacios ni guiones ('abc-123' → 'ABC123'). */
export const plateField = z.preprocess(
  (v) => (typeof v === 'string' ? v.toUpperCase().replace(/[\s-]/g, '') : v),
  z.string({ error: 'Ingresa la placa' }).regex(/^[A-Z0-9]{4,8}$/, 'Placa inválida (ej. ABC-123)'),
);

const year = optionalInt(1950, new Date().getFullYear() + 1, 'Año');
/** Kilometraje actual (también sube solo al registrar un mantenimiento con más km). */
const odometer = optionalInt(0, 9_999_999, 'Kilometraje');

export const createVehicleSchema = z.object({
  plate: plateField,
  brand: text('la marca', 60),
  model: text('el modelo', 60),
  year,
  color: optionalText(30),
  odometer,
  notes: optionalText(1000),
});

export const updateVehicleSchema = z
  .object({
    plate: plateField.optional(),
    brand: text('la marca', 60).optional(),
    model: text('el modelo', 60).optional(),
    year,
    color: optionalText(30),
    odometer,
    notes: optionalText(1000),
    /** 'alquilado' lo maneja el sistema al iniciar/finalizar contratos */
    status: z.enum(['disponible', 'taller', 'inactivo'], { error: 'Estado inválido' }).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'No hay cambios para guardar' });

export const listVehiclesQuery = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(['disponible', 'alquilado', 'taller', 'inactivo']).optional(),
});
