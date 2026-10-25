-- AlterTable: calendar_token zu users hinzufügen für Webcal Live-Feed
ALTER TABLE "users" ADD COLUMN "calendar_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_calendar_token_key" ON "users"("calendar_token");
