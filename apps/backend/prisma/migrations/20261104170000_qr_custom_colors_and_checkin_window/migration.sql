-- AlterTable: Eigene QR-Code-Farben für Abteilungen
ALTER TABLE "departments" ADD COLUMN "qr_custom_colors" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "qr_color_primary" TEXT,
ADD COLUMN "qr_color_secondary" TEXT;

-- AlterTable: Konfigurierbares Check-in-Zeitfenster für Events (Vorlauf & Nachlauf in Minuten)
ALTER TABLE "events" ADD COLUMN "checkin_early_minutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "checkin_late_minutes" INTEGER NOT NULL DEFAULT 30;
