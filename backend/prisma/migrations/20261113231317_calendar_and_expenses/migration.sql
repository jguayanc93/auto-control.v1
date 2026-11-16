-- Pagos diarios: calendario por vehículo (daily_records) y gastos (expenses). Reemplaza 'payments' (vacía).
-- CreateEnum
CREATE TYPE "DayStatus" AS ENUM ('pagado', 'medio', 'no_pago', 'fuera_servicio');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('mantenimiento', 'servicio', 'accesorio', 'otro');

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_created_by_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_org_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_rental_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_vehicle_id_fkey";

-- DropTable
DROP TABLE "payments";

-- CreateTable
CREATE TABLE "daily_records" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "rental_id" UUID,
    "date" DATE NOT NULL,
    "status" "DayStatus" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "method" "PaymentMethod",
    "note" VARCHAR(255),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" VARCHAR(255),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_records_org_id_date_idx" ON "daily_records"("org_id", "date");

-- CreateIndex
CREATE INDEX "daily_records_rental_id_idx" ON "daily_records"("rental_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_records_vehicle_id_date_key" ON "daily_records"("vehicle_id", "date");

-- CreateIndex
CREATE INDEX "expenses_org_id_date_idx" ON "expenses"("org_id", "date");

-- CreateIndex
CREATE INDEX "expenses_vehicle_id_date_idx" ON "expenses"("vehicle_id", "date");

-- AddForeignKey
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rentals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

