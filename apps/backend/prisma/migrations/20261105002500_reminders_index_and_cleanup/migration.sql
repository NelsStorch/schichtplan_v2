-- CreateIndex
CREATE INDEX "shifts_startTime_idx" ON "shifts"("startTime");

-- Backfill any remaining reminder_sent_at into sent_email_reminders
UPDATE "shift_signups"
SET "sent_email_reminders" = array_append("sent_email_reminders", 1440)
WHERE "reminder_sent_at" IS NOT NULL
  AND NOT ("sent_email_reminders" @> ARRAY[1440]::INTEGER[]);

-- DropColumn
ALTER TABLE "shift_signups" DROP COLUMN "reminder_sent_at";
