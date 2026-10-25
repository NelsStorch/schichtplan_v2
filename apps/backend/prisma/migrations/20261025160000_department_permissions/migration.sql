-- Feine Rechte pro Abteilung statt der Rolle «Planung» (PLANNER).
-- ADMIN bleibt die Abteilungsleitung, alle anderen sind HELPER mit einzelnen Rechten.

ALTER TABLE "department_members" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "department_members" ADD COLUMN "leader_source" TEXT;

-- Bisherige Planung: genau die Rechte, die sie bis jetzt hatte
UPDATE "department_members"
SET "role" = 'HELPER',
    "permissions" = ARRAY[
      'EVENTS_VIEW_ALL', 'EVENTS_CREATE', 'SHIFTS_MANAGE', 'HELPERS_MANAGE',
      'MESSAGES_SEND', 'ATTENDANCE_MANAGE', 'EXPORT', 'TEMPLATES_MANAGE'
    ]::TEXT[]
WHERE "role" = 'PLANNER';

-- Unbekannte Rollen (z. B. SUPERADMIN) werden zu HELPER ohne Rechte
UPDATE "department_members" SET "role" = 'HELPER' WHERE "role" NOT IN ('ADMIN', 'HELPER');

-- Herkunft der Abteilungsleitung: aus Cevi.DB, wenn die Person dort Abteilungsleiter*in dieser Heimabteilung ist
UPDATE "department_members" m
SET "leader_source" = CASE
  WHEN u."cevidb_department_leader" = true AND u."home_department_id" = m."departmentId" THEN 'CEVIDB'
  ELSE 'MANUAL'
END
FROM "users" u
WHERE u."id" = m."userId" AND m."role" = 'ADMIN';

-- Kontaktperson statt Kontakt-E-Mail
ALTER TABLE "departments" ADD COLUMN "contact_user_id" TEXT;

-- Bisherige Kontakt-E-Mail übernehmen, wenn sie einer Abteilungsleitung der Abteilung gehört
UPDATE "departments" d
SET "contact_user_id" = (
  SELECT u."id"
  FROM "users" u
  JOIN "department_members" m ON m."userId" = u."id" AND m."departmentId" = d."id" AND m."role" = 'ADMIN'
  WHERE d."contactEmail" IS NOT NULL AND lower(u."email") = lower(d."contactEmail")
  ORDER BY m."createdAt"
  LIMIT 1
);

ALTER TABLE "departments" DROP COLUMN "contactEmail";

ALTER TABLE "departments" ADD CONSTRAINT "departments_contact_user_id_fkey"
  FOREIGN KEY ("contact_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Protokoll der Abteilung
CREATE TABLE "department_audit_logs" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_user_id" TEXT,
    "target_label" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "department_audit_logs_department_id_created_at_idx" ON "department_audit_logs"("department_id", "created_at");

ALTER TABLE "department_audit_logs" ADD CONSTRAINT "department_audit_logs_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
