-- AlterTable
ALTER TABLE "events" ADD COLUMN "contact_user_id" TEXT,
ADD COLUMN "day_cutoff_time" TEXT NOT NULL DEFAULT '04:00',
ADD COLUMN "responsible_mode" TEXT NOT NULL DEFAULT 'BY_SHIFT';

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_contact_user_id_fkey" FOREIGN KEY ("contact_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "shift_responsibles" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_responsibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_day_responsibles" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "day_date" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_day_responsibles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_responsibles_shift_id_user_id_key" ON "shift_responsibles"("shift_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_day_responsibles_event_id_day_date_user_id_key" ON "event_day_responsibles"("event_id", "day_date", "user_id");

-- AddForeignKey
ALTER TABLE "shift_responsibles" ADD CONSTRAINT "shift_responsibles_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_responsibles" ADD CONSTRAINT "shift_responsibles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_day_responsibles" ADD CONSTRAINT "event_day_responsibles_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_day_responsibles" ADD CONSTRAINT "event_day_responsibles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
