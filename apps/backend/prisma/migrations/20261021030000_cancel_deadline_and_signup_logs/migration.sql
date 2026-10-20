-- AlterTable
ALTER TABLE "events" ADD COLUMN "cancel_deadline_days" INTEGER;

-- AlterTable
ALTER TABLE "event_templates" ADD COLUMN "cancel_deadline_days" INTEGER;

-- CreateTable
CREATE TABLE "shift_signup_logs" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "shift_id" TEXT,
    "action" TEXT NOT NULL,
    "helper_user_id" TEXT,
    "helper_name" TEXT NOT NULL,
    "performed_by_user_id" TEXT,
    "performed_by_name" TEXT,
    "shift_title" TEXT NOT NULL,
    "shift_start_time" TIMESTAMP(3),
    "shift_end_time" TIMESTAMP(3),
    "task_title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_signup_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_signup_logs_event_id_created_at_idx" ON "shift_signup_logs"("event_id", "created_at");

-- AddForeignKey
ALTER TABLE "shift_signup_logs" ADD CONSTRAINT "shift_signup_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_signup_logs" ADD CONSTRAINT "shift_signup_logs_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_signup_logs" ADD CONSTRAINT "shift_signup_logs_helper_user_id_fkey" FOREIGN KEY ("helper_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_signup_logs" ADD CONSTRAINT "shift_signup_logs_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
