-- AlterTable: Nachname optional machen (NULL erlauben)
ALTER TABLE "users" ALTER COLUMN "lastName" DROP NOT NULL;

-- Bisherige Platzhalter-Nachnamen auf NULL bereinigen
UPDATE "users" SET "lastName" = NULL WHERE "lastName" = '(Helfer)';
