-- CreateTable
CREATE TABLE "event_messages" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "sent_by_user_id" TEXT,
    "sent_by_name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "target_label" TEXT NOT NULL,
    "recipient_count" INTEGER NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_messages_event_id_created_at_idx" ON "event_messages"("event_id", "created_at");

-- AddForeignKey
ALTER TABLE "event_messages" ADD CONSTRAINT "event_messages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
