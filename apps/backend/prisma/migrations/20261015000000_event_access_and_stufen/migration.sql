-- Zugangs-Typen, Pflichtangaben, eigene Fragen und Zugangs-Links für Anlässe,
-- dazu Heimabteilung und Stufen pro Person.

-- Neue Spalten zuerst anlegen, damit die alten Werte übernommen werden können
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "department_setup_at" TIMESTAMP(3),
ADD COLUMN     "home_department_id" TEXT,
ADD COLUMN     "home_department_source" TEXT;

ALTER TABLE "events" ADD COLUMN     "access_type" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "leaders_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "required_fields" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "event_templates" ADD COLUMN     "access_type" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "leaders_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "required_fields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Alte Anmeldemodi übernehmen: Eintragen braucht jetzt immer ein Konto (Cevi-Name-Profil reicht).
-- NAME_ONLY, OPEN, LOGIN_REQUIRED -> PUBLIC; CEVIDB_ONLY -> CEVIDB_ALL (jede Cevi.DB-Person)
UPDATE "events" SET
  "access_type" = CASE WHEN "signupMode" = 'CEVIDB_ONLY' THEN 'CEVIDB_ALL' ELSE 'PUBLIC' END,
  "required_fields" = array_remove(ARRAY[
    CASE WHEN "requireEmailForGuests" THEN 'EMAIL' END,
    CASE WHEN "requirePhoneForGuests" THEN 'PHONE' END
  ], NULL);

UPDATE "event_templates" SET
  "access_type" = CASE WHEN "signupMode" = 'CEVIDB_ONLY' THEN 'CEVIDB_ALL' ELSE 'PUBLIC' END,
  "required_fields" = array_remove(ARRAY[
    CASE WHEN "requireEmailForGuests" THEN 'EMAIL' END,
    CASE WHEN "requirePhoneForGuests" THEN 'PHONE' END
  ], NULL);

ALTER TABLE "events" DROP COLUMN "requireEmailForGuests",
DROP COLUMN "requirePhoneForGuests",
DROP COLUMN "signupMode";

ALTER TABLE "event_templates" DROP COLUMN "requireEmailForGuests",
DROP COLUMN "requirePhoneForGuests",
DROP COLUMN "signupMode";

-- CreateTable
CREATE TABLE "department_stufen" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cevidb_group_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_stufen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stufen" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stufe_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TEILNEHMER',
    "source" TEXT NOT NULL DEFAULT 'SELF',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_stufen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_allowed_departments" (
    "event_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,

    CONSTRAINT "event_allowed_departments_pkey" PRIMARY KEY ("event_id","department_id")
);

-- CreateTable
CREATE TABLE "event_allowed_stufen" (
    "event_id" TEXT NOT NULL,
    "stufe_id" TEXT NOT NULL,

    CONSTRAINT "event_allowed_stufen_pkey" PRIMARY KEY ("event_id","stufe_id")
);

-- CreateTable
CREATE TABLE "event_questions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_answers" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_access_links" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PERSONAL',
    "bound_user_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_access_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_access_grants" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "department_stufen_department_id_name_key" ON "department_stufen"("department_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "department_stufen_department_id_cevidb_group_id_key" ON "department_stufen"("department_id", "cevidb_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_stufen_user_id_stufe_id_key" ON "user_stufen"("user_id", "stufe_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_answers_question_id_user_id_key" ON "event_answers"("question_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_access_links_token_key" ON "event_access_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "event_access_grants_event_id_user_id_key" ON "event_access_grants"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "department_stufen" ADD CONSTRAINT "department_stufen_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stufen" ADD CONSTRAINT "user_stufen_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stufen" ADD CONSTRAINT "user_stufen_stufe_id_fkey" FOREIGN KEY ("stufe_id") REFERENCES "department_stufen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_home_department_id_fkey" FOREIGN KEY ("home_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_allowed_departments" ADD CONSTRAINT "event_allowed_departments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_allowed_departments" ADD CONSTRAINT "event_allowed_departments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_allowed_stufen" ADD CONSTRAINT "event_allowed_stufen_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_allowed_stufen" ADD CONSTRAINT "event_allowed_stufen_stufe_id_fkey" FOREIGN KEY ("stufe_id") REFERENCES "department_stufen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_questions" ADD CONSTRAINT "event_questions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_answers" ADD CONSTRAINT "event_answers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_answers" ADD CONSTRAINT "event_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "event_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_answers" ADD CONSTRAINT "event_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_access_links" ADD CONSTRAINT "event_access_links_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_access_grants" ADD CONSTRAINT "event_access_grants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_access_grants" ADD CONSTRAINT "event_access_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_access_grants" ADD CONSTRAINT "event_access_grants_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "event_access_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

