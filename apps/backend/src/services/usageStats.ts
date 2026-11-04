/**
 * Datenarme Nutzungsstatistik (Kennzahlen in packages/shared/src/stats.ts). Gezählt wird nur Kennzahl,
 * feste Unterteilung, Abteilung und Tag, nie Person, IP oder echte URL. Die Zähler sammeln sich im
 * Speicher und werden jede Minute per Upsert addiert (`count = count + n`): Mehrere Backend-Container
 * (Zero-Downtime-Deploy) zählen so richtig zusammen, beim Herunterfahren wird der Rest geschrieben.
 */
import {
  REQUEST_DURATION_BUCKETS_MS,
  normalizeUsageDim,
  zurichDayKey,
  type UsageMetricDim,
  type UsageMetricKey,
} from '@schichtplan/shared';
import type { PrismaClient } from '../db.js';

export const STATS_FLUSH_INTERVAL_MS = 60 * 1000;

/** Höchstens so viele verschiedene Zeilen im Speicher (Schutz, falls jemand Unsinn meldet) */
const MAX_BUFFERED_KEYS = 20_000;

const SEP = '\u0000';

interface RequestAgg {
  count: number;
  totalMs: number;
  maxMs: number;
  buckets: number[];
}

let counters = new Map<string, number>();
let requests = new Map<string, RequestAgg>();

function addCounter(day: string, metric: string, dim: string, departmentId: string, n: number) {
  const key = [day, metric, dim, departmentId].join(SEP);
  const current = counters.get(key);
  if (current === undefined && counters.size >= MAX_BUFFERED_KEYS) return;
  counters.set(key, (current ?? 0) + n);
}

/** Kennzahl zählen (Tag = Schweizer Kalendertag). Unbekannte Unterteilungen werden verworfen. */
export function trackUsage<K extends UsageMetricKey>(
  metric: K,
  options: { dim?: UsageMetricDim<K>; departmentId?: string | null; n?: number; at?: Date } = {}
): void {
  const dim = normalizeUsageDim(metric, options.dim);
  const n = options.n ?? 1;
  if (dim === null || !Number.isFinite(n) || n <= 0) return;
  addCounter(zurichDayKey(options.at ?? new Date()), metric, dim, options.departmentId ?? '', Math.round(n));
}

/** Wie trackUsage, aber mit ungeprüfter Unterteilung (Meldungen aus dem Browser) */
export function trackUsageUnchecked(metric: UsageMetricKey, dim: string | undefined, departmentId: string | null): boolean {
  const clean = normalizeUsageDim(metric, dim);
  if (clean === null) return false;
  addCounter(zurichDayKey(new Date()), metric, clean, departmentId ?? '', 1);
  return true;
}

/** 2xx/3xx/4xx/5xx, Versuchsbremsen (429) separat, damit sie sichtbar bleiben */
export function statusClass(statusCode: number): string {
  if (statusCode === 429) return '429';
  return `${Math.min(5, Math.max(1, Math.floor(statusCode / 100)))}xx`;
}

export function durationBucket(ms: number): number {
  const index = REQUEST_DURATION_BUCKETS_MS.findIndex((limit) => ms <= limit);
  return index === -1 ? REQUEST_DURATION_BUCKETS_MS.length : index;
}

/** Eine Anfrage festhalten: nur Route-Muster (z. B. /api/events/:slug), Methode, Statusklasse, Dauer */
export function recordRequest(route: string, method: string, statusCode: number, durationMs: number, at = new Date()) {
  const hour = new Date(Math.floor(at.getTime() / 3_600_000) * 3_600_000).toISOString();
  const key = [hour, route, method, statusClass(statusCode)].join(SEP);
  let agg = requests.get(key);
  if (!agg) {
    if (requests.size >= MAX_BUFFERED_KEYS) return;
    agg = { count: 0, totalMs: 0, maxMs: 0, buckets: new Array(REQUEST_DURATION_BUCKETS_MS.length + 1).fill(0) };
    requests.set(key, agg);
  }
  agg.count += 1;
  agg.totalMs += durationMs;
  agg.maxMs = Math.max(agg.maxMs, durationMs);
  agg.buckets[durationBucket(durationMs)] += 1;
}

/** Ungefähres Perzentil (obere Grenze der Stufe, in der es liegt) aus den Laufzeit-Stufen */
export function percentileFromBuckets(buckets: number[], p: number): number | null {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const target = total * p;
  let seen = 0;
  for (let i = 0; i < buckets.length; i++) {
    seen += buckets[i];
    if (seen >= target) return REQUEST_DURATION_BUCKETS_MS[i] ?? null;
  }
  return null;
}

/** Nur für Tests: gepufferte Werte ansehen */
export function bufferedUsage() {
  return { counters: new Map(counters), requests: new Map(requests) };
}

/** Puffer leeren ohne zu schreiben (Tests) */
export function resetUsageBuffer() {
  counters = new Map();
  requests = new Map();
}

let flushing: Promise<void> | null = null;

/** Gesammelte Zähler in die DB addieren. Scheitert das, bleiben sie für den nächsten Versuch im Speicher. */
export function flushUsageStats(prisma: PrismaClient): Promise<void> {
  // Nicht zwei Schreibvorgänge gleichzeitig (Timer und Herunterfahren)
  if (flushing) return flushing.then(() => flushUsageStats(prisma));
  flushing = doFlush(prisma).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(prisma: PrismaClient) {
  const pendingCounters = counters;
  const pendingRequests = requests;
  counters = new Map();
  requests = new Map();

  if (pendingCounters.size > 0) {
    const days: string[] = [];
    const metrics: string[] = [];
    const dims: string[] = [];
    const departments: string[] = [];
    const counts: number[] = [];
    for (const [key, n] of pendingCounters) {
      const [day, metric, dim, departmentId] = key.split(SEP);
      days.push(day);
      metrics.push(metric);
      dims.push(dim);
      departments.push(departmentId);
      counts.push(n);
    }
    try {
      await prisma.$executeRaw`
        INSERT INTO usage_counters (day, metric, dim, department_id, count)
        SELECT d::date, m, x, dep, c
        FROM unnest(${days}::text[], ${metrics}::text[], ${dims}::text[], ${departments}::text[], ${counts}::int[])
          AS t(d, m, x, dep, c)
        ON CONFLICT (day, metric, dim, department_id)
        DO UPDATE SET count = usage_counters.count + EXCLUDED.count`;
    } catch (err) {
      for (const [key, n] of pendingCounters) counters.set(key, (counters.get(key) ?? 0) + n);
      throw err;
    }
  }

  if (pendingRequests.size > 0) {
    const periods: string[] = [];
    const routes: string[] = [];
    const methods: string[] = [];
    const classes: string[] = [];
    const counts: number[] = [];
    const totals: number[] = [];
    const maxima: number[] = [];
    const buckets: string[] = [];
    for (const [key, agg] of pendingRequests) {
      const [period, route, method, cls] = key.split(SEP);
      periods.push(period);
      routes.push(route);
      methods.push(method);
      classes.push(cls);
      counts.push(agg.count);
      totals.push(agg.totalMs);
      maxima.push(agg.maxMs);
      // Als Text, weil unnest() mehrdimensionale Arrays flach macht
      buckets.push(`{${agg.buckets.join(',')}}`);
    }
    try {
      await prisma.$executeRaw`
        INSERT INTO request_stats (granularity, period, route, method, status_class, count, total_ms, max_ms, buckets)
        SELECT 'HOUR', p::timestamptz AT TIME ZONE 'UTC', r, m, s, c, tot, mx, b::int[]
        FROM unnest(
          ${periods}::text[], ${routes}::text[], ${methods}::text[], ${classes}::text[],
          ${counts}::int[], ${totals}::float8[], ${maxima}::float8[], ${buckets}::text[]
        ) AS t(p, r, m, s, c, tot, mx, b)
        ON CONFLICT (granularity, period, route, method, status_class)
        DO UPDATE SET
          count = request_stats.count + EXCLUDED.count,
          total_ms = request_stats.total_ms + EXCLUDED.total_ms,
          max_ms = GREATEST(request_stats.max_ms, EXCLUDED.max_ms),
          buckets = ARRAY(
            SELECT COALESCE(a, 0) + COALESCE(b, 0)
            FROM unnest(request_stats.buckets, EXCLUDED.buckets) AS u(a, b)
          )`;
    } catch (err) {
      for (const [key, agg] of pendingRequests) {
        const current = requests.get(key);
        if (!current) {
          requests.set(key, agg);
          continue;
        }
        current.count += agg.count;
        current.totalMs += agg.totalMs;
        current.maxMs = Math.max(current.maxMs, agg.maxMs);
        agg.buckets.forEach((n, i) => {
          current.buckets[i] += n;
        });
      }
      throw err;
    }
  }
}
