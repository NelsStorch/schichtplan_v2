-- AlterTable
ALTER TABLE "shift_signups" ADD COLUMN "reminder_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "shift_reminders_enabled" BOOLEAN NOT NULL DEFAULT true;
