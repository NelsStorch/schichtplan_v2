-- AlterTable
ALTER TABLE "events" ADD COLUMN "overlap_tolerance_minutes" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "event_templates" ADD COLUMN "overlap_tolerance_minutes" INTEGER NOT NULL DEFAULT 15;
