-- AlterTable
ALTER TABLE "shifts" ALTER COLUMN "category" DROP NOT NULL;
ALTER TABLE "shifts" ADD COLUMN "is_setup_teardown" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "task_definitions" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "min_age" INTEGER,
    "age_requirement_type" TEXT NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_definitions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "shift_tasks" ADD COLUMN "task_definition_id" TEXT;

-- AddForeignKey
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_tasks" ADD CONSTRAINT "shift_tasks_task_definition_id_fkey" FOREIGN KEY ("task_definition_id") REFERENCES "task_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mark any shift as is_setup_teardown if title or category contains 'aufbau' or 'abbau'
UPDATE "shifts"
SET "is_setup_teardown" = true
WHERE LOWER("title") LIKE '%aufbau%'
   OR LOWER("title") LIKE '%abbau%'
   OR LOWER(COALESCE("category", '')) LIKE '%aufbau%'
   OR LOWER(COALESCE("category", '')) LIKE '%abbau%';

-- Seed task_definitions from distinct shift_tasks per department
INSERT INTO "task_definitions" ("id", "department_id", "title", "description", "min_age", "age_requirement_type", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    e."departmentId",
    st."title",
    MAX(st."description"),
    MAX(st."minAge"),
    MAX(st."ageRequirementType"),
    NOW(),
    NOW()
FROM "shift_tasks" st
JOIN "shifts" s ON s."id" = st."shiftId"
JOIN "events" e ON e."id" = s."eventId"
GROUP BY e."departmentId", st."title";

-- Connect existing shift_tasks to their corresponding task_definition
UPDATE "shift_tasks" st
SET "task_definition_id" = td."id"
FROM "shifts" s
JOIN "events" e ON e."id" = s."eventId"
JOIN "task_definitions" td ON td."department_id" = e."departmentId" AND td."title" = st."title"
WHERE st."shiftId" = s."id" AND st."task_definition_id" IS NULL;
