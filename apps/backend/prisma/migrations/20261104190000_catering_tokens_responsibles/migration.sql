-- AlterTable: CateringToken auch für Schichtleitung (ohne ShiftSignup) ermöglichen
ALTER TABLE "catering_tokens" ALTER COLUMN "shift_signup_id" DROP NOT NULL,
ADD COLUMN "shift_id" TEXT,
ADD COLUMN "user_id" TEXT;

-- CreateIndex
CREATE INDEX "catering_tokens_shift_id_idx" ON "catering_tokens"("shift_id");
CREATE INDEX "catering_tokens_user_id_idx" ON "catering_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "catering_tokens" ADD CONSTRAINT "catering_tokens_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catering_tokens" ADD CONSTRAINT "catering_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
