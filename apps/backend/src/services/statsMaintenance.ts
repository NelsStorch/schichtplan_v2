/**
 * Pflege der Nutzungsstatistik (läuft stündlich, siehe server.ts):
 * - Momentaufnahme der Bestandszahlen für den Vortag, falls sie fehlt (nach Neustarts nichts doppelt)
 * - Stundenwerte der Anfragen nach 90 Tagen zu Tageswerten zusammenfassen
 * - alles älter als 2 Jahre löschen
 */
import { STATS_RETENTION, addDaysToDayKey, zurichDayKey } from '@schichtplan/shared';
import type { PrismaClient } from '../db.js';

export const STATS_MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

const DAY_MS = 86_400_000;

/** Bestandszahlen, die täglich festgehalten werden (Schlüssel → Bezeichnung) */
export const SNAPSHOT_KEYS = {
  'users.total': 'Konten',
  'users.cevidb': 'Konten mit Cevi.DB',
  'users.password': 'Konten mit Passwort',
  'users.ceviname': 'Cevi-Name-Profile',
  'users.no_home': 'ohne Heimabteilung',
  'users.reminders_off': 'Erinnerungen abgeschaltet',
  'users.active7': 'aktiv in 7 Tagen',
  'users.active30': 'aktiv in 30 Tagen',
  'departments.total': 'Abteilungen',
  'departments.active90': 'Abteilungen mit Anlass (90 Tage)',
  'departments.linked': 'mit Ortsgruppe verknüpft',
  'events.total': 'Anlässe',
  'events.upcoming': 'kommende Anlässe',
  'signups.total': 'Eintragungen',
  'uploads.count': 'Bilder',
  'uploads.bytes': 'Speicher für Bilder',
  'db.bytes': 'Grösse der Datenbank',
} as const;

export type SnapshotKey = keyof typeof SNAPSHOT_KEYS;

/** Bestandszahlen berechnen. `day` = Tag, für den sie gelten (aktiv = zuletzt gesehen ab day-6 bzw. day-29). */
export async function computeSnapshot(prisma: PrismaClient, day: string, now = new Date()): Promise<Record<SnapshotKey, number>> {
  const since7 = new Date(`${addDaysToDayKey(day, -6)}T00:00:00Z`);
  const since30 = new Date(`${addDaysToDayKey(day, -29)}T00:00:00Z`);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);

  const [
    total,
    cevidb,
    password,
    noHome,
    remindersOff,
    active7,
    active30,
    departments,
    activeDepartments,
    linked,
    events,
    upcoming,
    signups,
    uploads,
    dbSize,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { providerId: { not: null } } }),
    prisma.user.count({ where: { providerId: null, passwordHash: { not: null } } }),
    prisma.user.count({ where: { homeDepartmentId: null } }),
    prisma.user.count({ where: { shiftRemindersEnabled: false } }),
    prisma.user.count({ where: { lastSeenOn: { gte: since7 } } }),
    prisma.user.count({ where: { lastSeenOn: { gte: since30 } } }),
    prisma.department.count(),
    prisma.department.count({ where: { events: { some: { endDate: { gte: ninetyDaysAgo } } } } }),
    prisma.department.count({ where: { hitobitoGroupId: { not: null } } }),
    prisma.event.count(),
    prisma.event.count({ where: { endDate: { gte: now } } }),
    prisma.shiftSignup.count(),
    prisma.upload.aggregate({ _count: { _all: true }, _sum: { size: true } }),
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
  ]);

  return {
    'users.total': total,
    'users.cevidb': cevidb,
    'users.password': password,
    'users.ceviname': total - cevidb - password,
    'users.no_home': noHome,
    'users.reminders_off': remindersOff,
    'users.active7': active7,
    'users.active30': active30,
    'departments.total': departments,
    'departments.active90': activeDepartments,
    'departments.linked': linked,
    'events.total': events,
    'events.upcoming': upcoming,
    'signups.total': signups,
    'uploads.count': uploads._count._all,
    'uploads.bytes': uploads._sum.size ?? 0,
    'db.bytes': Number(dbSize[0]?.bytes ?? 0),
  };
}

/** Momentaufnahme für den Vortag schreiben, falls es noch keine gibt. Gibt zurück, ob geschrieben wurde. */
export async function ensureDailySnapshot(prisma: PrismaClient, now = new Date()): Promise<boolean> {
  const day = addDaysToDayKey(zurichDayKey(now), -1);
  const dayDate = new Date(`${day}T00:00:00Z`);
  const exists = await prisma.statsSnapshot.findFirst({ where: { day: dayDate }, select: { key: true } });
  if (exists) return false;
  const values = await computeSnapshot(prisma, day, now);
  await prisma.statsSnapshot.createMany({
    data: Object.entries(values).map(([key, value]) => ({ day: dayDate, key, value })),
    skipDuplicates: true,
  });
  return true;
}

/** Stundenwerte älter als 90 Tage zu Tageswerten (UTC-Tag) zusammenfassen. Gibt die Anzahl Stundenzeilen zurück. */
export async function rollUpRequestStats(prisma: PrismaClient, now = new Date()): Promise<number> {
  const cutoff = new Date(Math.floor((now.getTime() - STATS_RETENTION.hourlyRequestDays * DAY_MS) / DAY_MS) * DAY_MS);
  // Ganze Stunden auf einmal (höchstens ein Monat pro Lauf), damit nie halbe Stunden gelöscht werden
  const periods = await prisma.requestStat.findMany({
    where: { granularity: 'HOUR', period: { lt: cutoff } },
    distinct: ['period'],
    select: { period: true },
    orderBy: { period: 'asc' },
    take: 24 * 31,
  });
  if (periods.length === 0) return 0;
  const periodList = periods.map((p) => p.period);
  const rows = await prisma.requestStat.findMany({ where: { granularity: 'HOUR', period: { in: periodList } } });

  const days = new Map<string, { period: Date; route: string; method: string; statusClass: string; count: number; totalMs: number; maxMs: number; buckets: number[] }>();
  for (const row of rows) {
    const period = new Date(Math.floor(row.period.getTime() / DAY_MS) * DAY_MS);
    const key = [period.toISOString(), row.route, row.method, row.statusClass].join('\u0000');
    const agg = days.get(key);
    if (!agg) {
      days.set(key, { ...row, period, buckets: [...row.buckets] });
      continue;
    }
    agg.count += row.count;
    agg.totalMs += row.totalMs;
    agg.maxMs = Math.max(agg.maxMs, row.maxMs);
    row.buckets.forEach((n, i) => {
      agg.buckets[i] = (agg.buckets[i] ?? 0) + n;
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.requestStat.deleteMany({ where: { granularity: 'HOUR', period: { in: periodList } } });
    for (const agg of days.values()) {
      const where = {
        granularity_period_route_method_statusClass: {
          granularity: 'DAY',
          period: agg.period,
          route: agg.route,
          method: agg.method,
          statusClass: agg.statusClass,
        },
      };
      const existing = await tx.requestStat.findUnique({ where });
      await tx.requestStat.upsert({
        where,
        create: {
          granularity: 'DAY',
          period: agg.period,
          route: agg.route,
          method: agg.method,
          statusClass: agg.statusClass,
          count: agg.count,
          totalMs: agg.totalMs,
          maxMs: agg.maxMs,
          buckets: agg.buckets,
        },
        update: {
          count: { increment: agg.count },
          totalMs: { increment: agg.totalMs },
          maxMs: Math.max(existing?.maxMs ?? 0, agg.maxMs),
          buckets: agg.buckets.map((n, i) => n + (existing?.buckets[i] ?? 0)),
        },
      });
    }
  });
  return rows.length;
}

/** Statistik älter als die Aufbewahrungsfrist löschen */
export async function purgeOldStats(prisma: PrismaClient, now = new Date()): Promise<number> {
  const cutoffDay = new Date(`${addDaysToDayKey(zurichDayKey(now), -STATS_RETENTION.dailyDays)}T00:00:00Z`);
  const [counters, requests, snapshots] = await prisma.$transaction([
    prisma.usageCounter.deleteMany({ where: { day: { lt: cutoffDay } } }),
    prisma.requestStat.deleteMany({ where: { period: { lt: cutoffDay } } }),
    prisma.statsSnapshot.deleteMany({ where: { day: { lt: cutoffDay } } }),
  ]);
  return counters.count + requests.count + snapshots.count;
}

/** Alles zusammen; gibt die Anzahl zusammengefasster Stundenzeilen zurück */
export async function runStatsMaintenance(prisma: PrismaClient, now = new Date()): Promise<number> {
  await ensureDailySnapshot(prisma, now);
  const rolled = await rollUpRequestStats(prisma, now);
  await purgeOldStats(prisma, now);
  return rolled;
}
