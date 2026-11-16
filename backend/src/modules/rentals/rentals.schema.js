import { z } from 'zod';
import { emptyToUndefined, money, optionalText, pastOrToday, uuidField } from '../../lib/fields.js';
import { createRenterSchema } from '../renters/renters.schema.js';

export const createRentalSchema = z
  .object({
    vehicleId: uuidField('Selecciona un vehículo'),
    /** Conductor existente… */
    renterId: z.preprocess(emptyToUndefined, uuidField('Selecciona un conductor').optional()),
    /** …o uno nuevo que se registra en el mismo paso */
    newRenter: createRenterSchema.optional(),
    dailyRate: money({ label: 'la tarifa diaria' }),
    startDate: pastOrToday('la fecha de inicio'),
    notes: optionalText(1000),
  })
  .refine((d) => d.renterId || d.newRenter, { message: 'Selecciona o registra un conductor', path: ['renterId'] });

/** Correcciones del administrador. */
export const updateRentalSchema = z
  .object({
    dailyRate: money({ label: 'la tarifa diaria' }).optional(),
    startDate: pastOrToday('la fecha de inicio').optional(),
    notes: optionalText(1000),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'No hay cambios para guardar' });

export const finishRentalSchema = z.object({
  endDate: pastOrToday('la fecha de fin'),
});

export const listRentalsQuery = z.object({
  status: z.enum(['activo', 'finalizado']).optional(),
  vehicleId: z.uuid().optional(),
  renterId: z.uuid().optional(),
});
