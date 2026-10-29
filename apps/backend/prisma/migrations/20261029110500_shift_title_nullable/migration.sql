-- AlterTable: Schichttitel optional machen (NULL erlauben)
ALTER TABLE "shifts" ALTER COLUMN "title" DROP NOT NULL;

-- Bisherige leere Schichttitel auf NULL bereinigen
UPDATE "shifts" SET "title" = NULL WHERE "title" = '';
