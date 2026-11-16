-- Mantenimiento: kilometraje actual del vehículo + índice para el historial por vehículo.
-- DropIndex
DROP INDEX "maintenances_vehicle_id_idx";

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "odometer" INTEGER;

-- CreateIndex
CREATE INDEX "maintenances_vehicle_id_done_on_idx" ON "maintenances"("vehicle_id", "done_on");

