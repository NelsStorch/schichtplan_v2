-- «Startseite nur für Mitglieder» ist neu die Vorgabe, auch für bestehende Abteilungen
ALTER TABLE "departments" ALTER COLUMN "members_only" SET DEFAULT true;
UPDATE "departments" SET "members_only" = true;
