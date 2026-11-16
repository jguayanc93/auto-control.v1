-- Vehículos, conductores y contratos: sin eliminación lógica (solo se eliminan si no tienen historial).
-- DropIndex
DROP INDEX "renters_org_id_deleted_at_idx";

-- DropIndex
DROP INDEX "vehicles_org_id_deleted_at_idx";

-- AlterTable
ALTER TABLE "rentals" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "renters" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "deleted_at";

-- CreateIndex
CREATE INDEX "rentals_renter_id_idx" ON "rentals"("renter_id");

-- CreateIndex
CREATE INDEX "renters_org_id_idx" ON "renters"("org_id");

