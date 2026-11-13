-- Mehrere Abteilungen/Vereine pro Person: ausdrückliche (und bestätigte) Mitgliedschaft neben der Heimabteilung
-- Zero-Downtime: nur additive, nullable Spalten
ALTER TABLE "department_members" ADD COLUMN "joined_at" TIMESTAMP(3);
ALTER TABLE "department_members" ADD COLUMN "confirmed_at" TIMESTAMP(3);
ALTER TABLE "department_members" ADD COLUMN "confirmed_by_id" TEXT;
