-- CreateTable
CREATE TABLE "shift_tasks" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requiredSlots" INTEGER NOT NULL DEFAULT 1,
    "minAge" INTEGER,
    "ageRequirementType" TEXT NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_tasks_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "shift_signups" ADD COLUMN "taskId" TEXT;

-- CreateTable
CREATE TABLE "event_templates" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "signupMode" TEXT NOT NULL DEFAULT 'OPEN',
    "requireEmailForGuests" BOOLEAN NOT NULL DEFAULT false,
    "requirePhoneForGuests" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_templates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "shift_tasks" ADD CONSTRAINT "shift_tasks_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_signups" ADD CONSTRAINT "shift_signups_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "shift_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_templates" ADD CONSTRAINT "event_templates_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill default shift_task for existing shifts so data is consistent:
INSERT INTO "shift_tasks" ("id", "shiftId", "title", "description", "requiredSlots", "minAge", "ageRequirementType", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", "title", "description", "requiredSlots", "minAge", 'ALL', NOW(), NOW()
FROM "shifts";

-- Backfill shift_signups to reference the newly created shift_task:
UPDATE "shift_signups" ss
SET "taskId" = st.id
FROM "shift_tasks" st
WHERE ss."shiftId" = st."shiftId"
  AND ss."taskId" IS NULL;
