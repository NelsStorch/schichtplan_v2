-- AlterTable: Benachrichtigungseinstellungen auf Benutzern
ALTER TABLE "users"
ADD COLUMN "email_notify_catering_tokens" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "push_notify_catering_tokens" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "email_notify_replacement" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "email_notify_messages" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Stand-PIN und Bon-Erinnerung auf Events
ALTER TABLE "events"
ADD COLUMN "catering_staff_pin" TEXT,
ADD COLUMN "catering_reminders_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: CateringBatch (Tranchen für physische Bons)
CREATE TABLE "catering_batches" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "batch_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'COMBI',
    "card_count" INTEGER NOT NULL,
    "token_count" INTEGER NOT NULL,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catering_batches_pkey" PRIMARY KEY ("id")
);

-- AlterTable: CateringToken erweitern um Batch, QR-Code und physische Zuordnung
ALTER TABLE "catering_tokens"
ADD COLUMN "event_id" TEXT,
ADD COLUMN "batch_id" TEXT,
ADD COLUMN "qr_code" TEXT,
ADD COLUMN "card_number" INTEGER,
ADD COLUMN "is_physical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reminder_sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "catering_batches_event_id_batch_number_key" ON "catering_batches"("event_id", "batch_number");
CREATE INDEX "catering_batches_event_id_idx" ON "catering_batches"("event_id");

CREATE INDEX "catering_tokens_event_id_idx" ON "catering_tokens"("event_id");
CREATE INDEX "catering_tokens_batch_id_idx" ON "catering_tokens"("batch_id");
CREATE INDEX "catering_tokens_qr_code_idx" ON "catering_tokens"("qr_code");

-- AddForeignKey
ALTER TABLE "catering_batches" ADD CONSTRAINT "catering_batches_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catering_tokens" ADD CONSTRAINT "catering_tokens_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catering_tokens" ADD CONSTRAINT "catering_tokens_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "catering_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
