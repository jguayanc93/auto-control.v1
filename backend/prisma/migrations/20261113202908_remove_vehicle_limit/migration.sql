-- El límite de vehículos ya no lo fija el superadmin: cada negocio registra los que necesite.
ALTER TABLE "organizations" DROP COLUMN "vehicle_limit";
