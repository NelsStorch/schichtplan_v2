-- «Ersatz gesucht»: Eingetragene markieren ihre Schicht, andere übernehmen sie mit einem Klick.
-- Schalter pro Anlass, auch für bestehende Anlässe an (Entscheid 2026-10-26).

-- AlterTable
ALTER TABLE "events" ADD COLUMN "allow_replacement" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "events" ADD COLUMN "replacement_cutoff_hours" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "shift_signups" ADD COLUMN "replacement_wanted_at" TIMESTAMP(3);
ALTER TABLE "shift_signups" ADD COLUMN "replacement_note" TEXT;
ALTER TABLE "shift_signups" ADD COLUMN "replacement_by_name" TEXT;
