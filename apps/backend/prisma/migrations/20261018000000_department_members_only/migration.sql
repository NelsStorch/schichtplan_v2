-- Abteilungs-Startseite optional nur für Mitglieder (Vorgabe: offen)
ALTER TABLE "departments" ADD COLUMN "members_only" BOOLEAN NOT NULL DEFAULT false;
