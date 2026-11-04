-- Indizes auf Fremdschluesseln und die haeufigste Schichtabfrage (Postgres legt sie nicht selbst an).
-- Rein additiv: laeuft auch mit dem alten Code, der bis zum Rollout aktiv ist.

-- CreateIndex
CREATE INDEX "department_members_userId_idx" ON "department_members"("userId");

-- CreateIndex
CREATE INDEX "event_access_grants_user_id_idx" ON "event_access_grants"("user_id");

-- CreateIndex
CREATE INDEX "event_access_grants_link_id_idx" ON "event_access_grants"("link_id");

-- CreateIndex
CREATE INDEX "event_access_links_event_id_idx" ON "event_access_links"("event_id");

-- CreateIndex
CREATE INDEX "event_allowed_departments_department_id_idx" ON "event_allowed_departments"("department_id");

-- CreateIndex
CREATE INDEX "event_allowed_stufen_stufe_id_idx" ON "event_allowed_stufen"("stufe_id");

-- CreateIndex
CREATE INDEX "event_answers_event_id_idx" ON "event_answers"("event_id");

-- CreateIndex
CREATE INDEX "event_answers_user_id_idx" ON "event_answers"("user_id");

-- CreateIndex
CREATE INDEX "event_day_responsibles_user_id_idx" ON "event_day_responsibles"("user_id");

-- CreateIndex
CREATE INDEX "event_deregistrations_user_id_idx" ON "event_deregistrations"("user_id");

-- CreateIndex
CREATE INDEX "event_organizers_userId_idx" ON "event_organizers"("userId");

-- CreateIndex
CREATE INDEX "event_questions_event_id_idx" ON "event_questions"("event_id");

-- CreateIndex
CREATE INDEX "event_templates_departmentId_idx" ON "event_templates"("departmentId");

-- CreateIndex
CREATE INDEX "shift_responsibles_user_id_idx" ON "shift_responsibles"("user_id");

-- CreateIndex
CREATE INDEX "shift_signup_answers_question_id_idx" ON "shift_signup_answers"("question_id");

-- CreateIndex
CREATE INDEX "shift_signup_logs_shift_id_idx" ON "shift_signup_logs"("shift_id");

-- CreateIndex
CREATE INDEX "shift_signups_shiftId_idx" ON "shift_signups"("shiftId");

-- CreateIndex
CREATE INDEX "shift_signups_userId_idx" ON "shift_signups"("userId");

-- CreateIndex
CREATE INDEX "shift_signups_taskId_idx" ON "shift_signups"("taskId");

-- CreateIndex
CREATE INDEX "shift_tasks_shiftId_idx" ON "shift_tasks"("shiftId");

-- CreateIndex
CREATE INDEX "shift_tasks_task_definition_id_idx" ON "shift_tasks"("task_definition_id");

-- CreateIndex
CREATE INDEX "shifts_eventId_startTime_idx" ON "shifts"("eventId", "startTime");

-- CreateIndex
CREATE INDEX "task_definitions_department_id_idx" ON "task_definitions"("department_id");

-- CreateIndex
CREATE INDEX "user_stufen_stufe_id_idx" ON "user_stufen"("stufe_id");

