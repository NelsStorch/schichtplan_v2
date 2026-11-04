-- AlterTable: Verpflegungs- und Getränke-Tokens für Events
ALTER TABLE "events" ADD COLUMN "catering_tokens_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "catering_token_items" TEXT[] DEFAULT ARRAY['1x Helfermenü', '1x Getränk']::TEXT[],
ADD COLUMN "catering_early_hours" INTEGER NOT NULL DEFAULT 2;

-- CreateTable: CateringToken
CREATE TABLE "catering_tokens" (
    "id" TEXT NOT NULL,
    "shift_signup_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "redeemed_at" TIMESTAMP(3),
    "redeemed_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catering_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catering_tokens_shift_signup_id_idx" ON "catering_tokens"("shift_signup_id");

-- AddForeignKey
ALTER TABLE "catering_tokens" ADD CONSTRAINT "catering_tokens_shift_signup_id_fkey" FOREIGN KEY ("shift_signup_id") REFERENCES "shift_signups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
