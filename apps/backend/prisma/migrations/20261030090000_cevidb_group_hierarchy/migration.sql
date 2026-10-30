-- Cevi.DB-Gruppenstruktur: Zwischenspeicher aus der Gruppen-API (keine Personendaten)
CREATE TABLE "cevidb_groups" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "jungschar_id" INTEGER,
    "ortsgruppe_id" INTEGER,
    "jungschar_count" INTEGER,
    "fetched_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cevidb_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cevidb_groups_ortsgruppe_id_idx" ON "cevidb_groups"("ortsgruppe_id");

-- Aus Rollen und Gruppenstruktur abgeleitet, beim Cevi.DB-Login ersetzt
ALTER TABLE "users" ADD COLUMN "cevidb_jungschar_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "users" ADD COLUMN "cevidb_leader_group_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
