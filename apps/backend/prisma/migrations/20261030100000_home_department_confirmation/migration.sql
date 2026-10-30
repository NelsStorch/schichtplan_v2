-- Zugehörigkeit von der Abteilungsleitung bestätigt: wer und wann (nur bei home_department_source = 'CONFIRMED' gesetzt)
ALTER TABLE "users" ADD COLUMN "home_department_confirmed_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "home_department_confirmed_by_id" TEXT;

ALTER TABLE "users" ADD CONSTRAINT "users_home_department_confirmed_by_id_fkey" FOREIGN KEY ("home_department_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
