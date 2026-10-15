-- Mindestanzahl Schichten pro Person (optional) bei Events und EventTemplates
-- sowie Abmeldungen (Person muss an diesem Anlass keine Schichten übernehmen).

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "min_shifts_per_person" INTEGER;

-- AlterTable
ALTER TABLE "event_templates" ADD COLUMN     "min_shifts_per_person" INTEGER;

-- CreateTable
CREATE TABLE "event_deregistrations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "event_deregistrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_deregistrations_event_id_user_id_key" ON "event_deregistrations"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "event_deregistrations" ADD CONSTRAINT "event_deregistrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_deregistrations" ADD CONSTRAINT "event_deregistrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
