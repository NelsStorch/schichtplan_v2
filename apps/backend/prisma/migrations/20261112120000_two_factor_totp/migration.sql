-- Zwei-Faktor-Anmeldung (TOTP) mit Wiederherstellungscodes
ALTER TABLE "users" ADD COLUMN "totp_secret" TEXT,
ADD COLUMN "totp_pending_secret" TEXT,
ADD COLUMN "totp_enabled_at" TIMESTAMP(3),
ADD COLUMN "totp_last_step" INTEGER,
ADD COLUMN "totp_on_provider_login" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "two_factor_recovery_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "two_factor_recovery_codes_user_id_idx" ON "two_factor_recovery_codes"("user_id");

ALTER TABLE "two_factor_recovery_codes" ADD CONSTRAINT "two_factor_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
