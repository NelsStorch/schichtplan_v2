-- Datenarme Nutzungsstatistik: Tageszähler, Anfrage-Statistik pro Route-Muster, tägliche Momentaufnahmen
-- und der letzte Nutzungstag pro Konto (nur Datum)

-- AlterTable
ALTER TABLE "users" ADD COLUMN "last_seen_on" DATE;

-- CreateTable
CREATE TABLE "usage_counters" (
    "day" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "dim" TEXT NOT NULL DEFAULT '',
    "department_id" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("day","metric","dim","department_id")
);

-- CreateTable
CREATE TABLE "request_stats" (
    "granularity" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status_class" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "total_ms" DOUBLE PRECISION NOT NULL,
    "max_ms" DOUBLE PRECISION NOT NULL,
    "buckets" INTEGER[],

    CONSTRAINT "request_stats_pkey" PRIMARY KEY ("granularity","period","route","method","status_class")
);

-- CreateTable
CREATE TABLE "stats_snapshots" (
    "day" DATE NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "stats_snapshots_pkey" PRIMARY KEY ("day","key")
);

-- CreateIndex
CREATE INDEX "usage_counters_metric_day_idx" ON "usage_counters"("metric", "day");

-- CreateIndex
CREATE INDEX "request_stats_period_idx" ON "request_stats"("period");

-- CreateIndex
CREATE INDEX "users_last_seen_on_idx" ON "users"("last_seen_on");
