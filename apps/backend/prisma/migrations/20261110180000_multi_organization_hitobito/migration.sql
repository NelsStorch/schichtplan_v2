-- Multi-Domain & Multi-Verband (Cevi, Pfadi, Jubla, Vereine):
-- Saubere, neutrale Spaltennamen (Option A) und Verbands-Trennung (OrganizationType).

-- 1. CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('CEVI', 'PFADI', 'JUBLA', 'OTHER');

-- 2. AlterTable: departments
ALTER TABLE "departments" ADD COLUMN "organization" "OrganizationType" NOT NULL DEFAULT 'CEVI';
ALTER TABLE "departments" RENAME COLUMN "ceviDbGroupId" TO "hitobito_group_id";
DROP INDEX IF EXISTS "departments_slug_key";
DROP INDEX IF EXISTS "departments_ceviDbGroupId_key";
CREATE UNIQUE INDEX "departments_organization_slug_key" ON "departments"("organization", "slug");
CREATE UNIQUE INDEX "departments_organization_hitobito_group_id_key" ON "departments"("organization", "hitobito_group_id");

-- 3. AlterTable: department_stufen
ALTER TABLE "department_stufen" RENAME COLUMN "cevidb_group_id" TO "hitobito_group_id";
DROP INDEX IF EXISTS "department_stufen_department_id_cevidb_group_id_key";
CREATE UNIQUE INDEX "department_stufen_department_id_hitobito_group_id_key" ON "department_stufen"("department_id", "hitobito_group_id");

-- 4. AlterTable: cevidb_groups -> hitobito_groups
ALTER TABLE "cevidb_groups" RENAME TO "hitobito_groups";
ALTER TABLE "hitobito_groups" ADD COLUMN "provider" "OrganizationType" NOT NULL DEFAULT 'CEVI';
ALTER TABLE "hitobito_groups" DROP CONSTRAINT "cevidb_groups_pkey";
ALTER TABLE "hitobito_groups" ADD CONSTRAINT "hitobito_groups_pkey" PRIMARY KEY ("provider", "id");
DROP INDEX IF EXISTS "cevidb_groups_ortsgruppe_id_idx";
CREATE INDEX "hitobito_groups_provider_ortsgruppe_id_idx" ON "hitobito_groups"("provider", "ortsgruppe_id");

-- 5. AlterTable: user_cevidb_stufen -> user_hitobito_stufen
ALTER TABLE "user_cevidb_stufen" RENAME TO "user_hitobito_stufen";

-- 6. AlterTable: users
ALTER TABLE "users" RENAME COLUMN "ceviName" TO "nickname";
ALTER TABLE "users" ADD COLUMN "provider" "OrganizationType" NOT NULL DEFAULT 'CEVI';
ALTER TABLE "users" ADD COLUMN "provider_id" TEXT;
UPDATE "users" SET "provider_id" = "ceviDbId"::TEXT WHERE "ceviDbId" IS NOT NULL;
ALTER TABLE "users" DROP COLUMN "ceviDbId";
DROP INDEX IF EXISTS "users_ceviDbId_key";
CREATE UNIQUE INDEX "users_provider_provider_id_key" ON "users"("provider", "provider_id");

ALTER TABLE "users" RENAME COLUMN "cevidb_ortsgruppe_id" TO "ortsgruppe_id";
ALTER TABLE "users" RENAME COLUMN "cevidb_ortsgruppe_name" TO "ortsgruppe_name";
ALTER TABLE "users" RENAME COLUMN "cevidb_department_leader" TO "department_leader";
ALTER TABLE "users" RENAME COLUMN "cevidb_leader_group_name" TO "leader_group_name";
ALTER TABLE "users" RENAME COLUMN "cevidb_jungschar_ids" TO "jungschar_ids";
ALTER TABLE "users" RENAME COLUMN "cevidb_leader_group_ids" TO "leader_group_ids";
ALTER TABLE "users" RENAME COLUMN "ceviDbSyncedAt" TO "provider_synced_at";
