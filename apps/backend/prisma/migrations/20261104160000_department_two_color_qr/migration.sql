-- Zweitfarbe und QR-Code-Stil (CORNERS, GRADIENT, SOLID) für Abteilungen
ALTER TABLE "departments" ADD COLUMN "secondary_color" TEXT;
ALTER TABLE "departments" ADD COLUMN "qr_style" TEXT NOT NULL DEFAULT 'CORNERS';
