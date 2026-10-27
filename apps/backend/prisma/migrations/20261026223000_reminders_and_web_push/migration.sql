-- AlterTable: users (customizable email & push reminder settings)
ALTER TABLE "users"
  ADD COLUMN "email_reminder_minutes" INTEGER[] NOT NULL DEFAULT ARRAY[1440]::INTEGER[],
  ADD COLUMN "push_reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "push_reminder_minutes" INTEGER[] NOT NULL DEFAULT ARRAY[60, 1440]::INTEGER[],
  ADD COLUMN "push_notify_replacement" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "push_notify_messages" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: events (optional OK reminder note for shift reminders)
ALTER TABLE "events"
  ADD COLUMN "reminder_note" TEXT;

-- AlterTable: shift_signups (track sent email & push reminder lead times)
ALTER TABLE "shift_signups"
  ADD COLUMN "sent_email_reminders" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "sent_push_reminders" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- Migrate existing reminder_sent_at flag so already-reminded signups aren't reminded again for 24h
UPDATE "shift_signups"
SET "sent_email_reminders" = ARRAY[1440]::INTEGER[]
WHERE "reminder_sent_at" IS NOT NULL;

-- AlterTable: shift_responsibles (track sent email & push reminder lead times)
ALTER TABLE "shift_responsibles"
  ADD COLUMN "sent_email_reminders" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "sent_push_reminders" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- CreateTable: push_subscriptions (Web Push subscriptions per device, privacy-friendly without UA/IP)
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
