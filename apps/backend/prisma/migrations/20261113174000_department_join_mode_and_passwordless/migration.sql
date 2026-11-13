-- Beitrittsmodus, Einladungs-Token und passwortloser Login pro Abteilung/Verein (Zero-Downtime: nur additive Spalten)
ALTER TABLE "departments" ADD COLUMN "allow_passwordless" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "departments" ADD COLUMN "join_mode" TEXT NOT NULL DEFAULT 'LINK_ONLY';
ALTER TABLE "departments" ADD COLUMN "invite_token" TEXT;

CREATE UNIQUE INDEX "departments_invite_token_key" ON "departments"("invite_token");
