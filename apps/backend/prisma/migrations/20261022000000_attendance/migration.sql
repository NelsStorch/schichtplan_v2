-- AlterTable
ALTER TABLE "events" ADD COLUMN "attendance_mode" TEXT NOT NULL DEFAULT 'OFF',
ADD COLUMN "checkin_token" TEXT;

-- AlterTable
ALTER TABLE "shift_signups" ADD COLUMN "attendance" TEXT,
ADD COLUMN "attendance_at" TIMESTAMP(3),
ADD COLUMN "attendance_source" TEXT,
ADD COLUMN "attendance_by_name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "events_checkin_token_key" ON "events"("checkin_token");

-- AlterTable
ALTER TABLE "shift_signup_logs" ADD COLUMN "attendance" TEXT;
