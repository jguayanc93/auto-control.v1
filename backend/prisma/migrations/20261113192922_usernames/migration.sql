-- Login por nombre de usuario; el correo pasa a ser opcional.

-- 1) Columna nueva, primero sin NOT NULL para poder rellenar las filas existentes
ALTER TABLE "users" ADD COLUMN "username" VARCHAR(30);

-- 2) Usuarios existentes: usuario = parte del correo antes de la @ (+ sufijo si se repite)
UPDATE "users" u
SET "username" = LEFT(LOWER(REGEXP_REPLACE(SPLIT_PART(u."email", '@', 1), '[^a-zA-Z0-9._-]', '', 'g')), 22)
  || CASE WHEN dup.n > 1 THEN '-' || dup.n ELSE '' END
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY LOWER(SPLIT_PART("email", '@', 1)) ORDER BY "created_at") AS n
  FROM "users"
) dup
WHERE dup."id" = u."id";

-- 3) Ahora sí: obligatorio y único
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
