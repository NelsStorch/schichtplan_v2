-- AlterTable
ALTER TABLE "users" ADD COLUMN "ceviDbData" JSONB,
ADD COLUMN "ceviDbSyncedAt" TIMESTAMP(3);
