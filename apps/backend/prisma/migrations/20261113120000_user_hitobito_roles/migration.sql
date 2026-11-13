-- Rollen aus Hitobito (Rollentyp und Gruppe) für die Berechtigungs-Diagnose im Admin-Portal.
-- Wird bei jedem Login ersetzt; bestehende Konten bekommen ihren Stand beim nächsten Login.
CREATE TABLE "user_hitobito_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_class" TEXT NOT NULL,
    "role_name" TEXT,
    "group_id" INTEGER,
    "group_name" TEXT,

    CONSTRAINT "user_hitobito_roles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_hitobito_roles_user_id_idx" ON "user_hitobito_roles"("user_id");

ALTER TABLE "user_hitobito_roles" ADD CONSTRAINT "user_hitobito_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
