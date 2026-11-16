// Formato de salida de contratos (compartido por vehículos, conductores y contratos).
import { prisma } from '../../lib/prisma.js';
import { fromDbDate } from '../../lib/dates.js';
import { fromCents, toCents } from '../../lib/money.js';
import { rentalStats } from '../../lib/rentals.js';

export const RENTAL_INCLUDE = {
  vehicle: { select: { id: true, plate: true, brand: true, model: true } },
  renter: { select: { id: true, fullName: true, phone: true, docNumber: true } },
};

/** Cobrado (céntimos) y días marcados por contrato: Map<rentalId, { paidCents, markedDays }>. */
export async function statsByRental(rentalIds, db = prisma) {
  if (!rentalIds.length) return new Map();
  const rows = await db.dailyRecord.groupBy({
    by: ['rentalId'],
    where: { rentalId: { in: rentalIds } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.rentalId, { paidCents: toCents(r._sum.amount?.toString() ?? 0), markedDays: r._count._all }]));
}

export function rentalDTO(r, stats) {
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    renterId: r.renterId,
    vehicle: r.vehicle,
    renter: r.renter,
    dailyRate: fromCents(toCents(r.dailyRate.toString())),
    startDate: fromDbDate(r.startDate),
    endDate: fromDbDate(r.endDate),
    status: r.status,
    notes: r.notes,
    createdAt: r.createdAt,
    ...rentalStats(r, stats),
  };
}

/** Convierte una lista de contratos de Prisma a DTO con sus estadísticas. */
export async function rentalsWithStats(rentals, db = prisma) {
  const stats = await statsByRental(rentals.map((r) => r.id), db);
  return rentals.map((r) => rentalDTO(r, stats.get(r.id)));
}
