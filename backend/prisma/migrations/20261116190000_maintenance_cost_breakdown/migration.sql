-- Mantenimiento: costo desglosado en repuestos + mano de obra (total = suma).
-- AlterTable
ALTER TABLE "maintenances" ADD COLUMN     "labor_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "parts_cost" DECIMAL(10,2) NOT NULL DEFAULT 0;


-- Registros anteriores: el costo total se toma como repuestos.
UPDATE "maintenances" SET "parts_cost" = "cost";
