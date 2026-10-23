-- Bestehende Abteilungsleiter*innen laut Cevi.DB (cevidb_department_leader = true)
-- ausschliesslich in ihrer eigenen Heimabteilung zur Abteilungsleitung (ADMIN) befördern bzw. eintragen.

-- 1. Falls cevidb_department_leader noch false war, aber in ceviDbData vorhanden:
UPDATE "users"
SET "cevidb_department_leader" = true
WHERE "cevidb_department_leader" = false
  AND "ceviDbData" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof("ceviDbData"::jsonb->'roles') = 'array' THEN ("ceviDbData"::jsonb->'roles') ELSE '[]'::jsonb END) AS r
    WHERE r->>'role_class' = 'Group::Jungschar::Abteilungsleiter'
       OR r->>'role' = 'Group::Jungschar::Abteilungsleiter'
  );

-- 2. Falls cevidb_ortsgruppe_id noch null war, aber in ceviDbData vorhanden:
UPDATE "users"
SET "cevidb_ortsgruppe_id" = ("ceviDbData"->>'ortsgruppe_id')::integer
WHERE "cevidb_ortsgruppe_id" IS NULL
  AND "ceviDbData" IS NOT NULL
  AND "ceviDbData"->>'ortsgruppe_id' ~ '^[0-9]{1,9}$';

-- 3. Falls home_department_id noch null war, aber passende Abteilung existiert:
UPDATE "users" u
SET "home_department_id" = d."id",
    "home_department_source" = COALESCE(u."home_department_source", 'CEVIDB'),
    "department_setup_at" = COALESCE(u."department_setup_at", CURRENT_TIMESTAMP)
FROM "departments" d
WHERE u."home_department_id" IS NULL
  AND u."cevidb_ortsgruppe_id" IS NOT NULL
  AND d."ceviDbGroupId" = u."cevidb_ortsgruppe_id";

-- 4. Abteilungsleiter*innen (cevidb_department_leader = true) ausschliesslich in ihrer eigenen Heimabteilung als ADMIN eintragen bzw. befördern:
INSERT INTO "department_members" ("id", "departmentId", "userId", "role")
SELECT gen_random_uuid()::text, u."home_department_id", u."id", 'ADMIN'
FROM "users" u
WHERE u."cevidb_department_leader" = true
  AND u."home_department_id" IS NOT NULL
ON CONFLICT ("departmentId", "userId") DO UPDATE SET "role" = 'ADMIN';
