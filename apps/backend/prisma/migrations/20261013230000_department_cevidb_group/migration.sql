-- Zuordnung Abteilung <-> Cevi.DB-Ortsgruppe (profile.ortsgruppe_id)
ALTER TABLE "departments" ADD COLUMN "ceviDbGroupId" INTEGER;

CREATE UNIQUE INDEX "departments_ceviDbGroupId_key" ON "departments"("ceviDbGroupId");

-- Bestehende Abteilung Illnau-Effretikon: Ortsgruppe 161 in Cevi.DB (nur wirksam, wo der Slug existiert)
UPDATE "departments" SET "ceviDbGroupId" = 161 WHERE "slug" = 'illnau' AND "ceviDbGroupId" IS NULL;

-- Bereits angemeldete Cevi.DB-Personen sofort zuordnen (Profil liegt seit der letzten Anmeldung in users.ceviDbData).
-- Bestehende Mitgliedschaften und Rollen bleiben unverändert.
INSERT INTO "department_members" ("id", "departmentId", "userId", "role")
SELECT gen_random_uuid()::text, d."id", u."id", 'HELPER'
FROM "users" u
JOIN "departments" d
  ON d."ceviDbGroupId" = CASE
       WHEN u."ceviDbData"->>'ortsgruppe_id' ~ '^[0-9]{1,9}$' THEN (u."ceviDbData"->>'ortsgruppe_id')::integer
     END
ON CONFLICT ("departmentId", "userId") DO NOTHING;
