-- Cevi.DB-Angaben in eigene Spalten/Tabelle (werden beim Cevi.DB-Login gefüllt; users.ceviDbData wird nicht mehr gelesen)
-- und Antworten pro Eintragung für Fragen mit scope PER_SIGNUP.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cevidb_department_leader" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cevidb_leader_group_name" TEXT,
ADD COLUMN     "cevidb_ortsgruppe_id" INTEGER,
ADD COLUMN     "cevidb_ortsgruppe_name" TEXT;

-- AlterTable
ALTER TABLE "event_questions" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'ONCE';

-- CreateTable
CREATE TABLE "user_cevidb_stufen" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "group_id" INTEGER NOT NULL,
    "group_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_cevidb_stufen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_signup_answers" (
    "id" TEXT NOT NULL,
    "signup_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "shift_signup_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_cevidb_stufen_group_id_idx" ON "user_cevidb_stufen"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_cevidb_stufen_user_id_group_id_key" ON "user_cevidb_stufen"("user_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_signup_answers_signup_id_question_id_key" ON "shift_signup_answers"("signup_id", "question_id");

-- AddForeignKey
ALTER TABLE "user_cevidb_stufen" ADD CONSTRAINT "user_cevidb_stufen_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_signup_answers" ADD CONSTRAINT "shift_signup_answers_signup_id_fkey" FOREIGN KEY ("signup_id") REFERENCES "shift_signups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_signup_answers" ADD CONSTRAINT "shift_signup_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "event_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

