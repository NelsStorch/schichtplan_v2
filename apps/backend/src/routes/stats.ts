/**
 * Nutzungsstatistik: Meldungen aus dem Browser (öffentlich, ohne Cookie) und Auswertung im Admin-Portal
 * (nur globale Admins). Kennzahlen und Regeln: packages/shared/src/stats.ts.
 */
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ATTENDANCE_MODES,
  DEPARTMENT_PERMISSION_PRESETS,
  EVENT_ACCESS_TYPES,
  REQUIRED_PROFILE_FIELDS,
  STATS_RANGES,
  STATS_UI_MAX_EVENTS,
  USAGE_METRICS,
  addDaysToDayKey,
  isUiMetric,
  permissionPresetOf,
  normalizePermissions,
  zurichDayKey,
  zurichInputToIso,
  type AdminStatsFeaturesDto,
  type AdminStatsMetricDto,
  type AdminStatsRouteDto,
  type AdminStatsSystemDto,
  type AdminStatsUsageDto,
  type StatsCountDto,
  type UsageMetricKey,
} from '@schichtplan/shared';
import { Prisma } from '../db.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { SNAPSHOT_KEYS } from '../services/statsMaintenance.js';
import { flushUsageStats, percentileFromBuckets, trackUsageUnchecked } from '../services/usageStats.js';

const UiStatsSchema = z.object({
  events: z
    .array(z.object({ name: z.string().max(40), dim: z.string().max(120).optional() }))
    .min(1)
    .max(STATS_UI_MAX_EVENTS),
});

const RangeQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((v) => (STATS_RANGES as readonly number[]).includes(v), 'Ungültiger Zeitraum')
    .default(30),
  departmentId: z.string().uuid().optional(),
});

/** Meldungen pro IP (nur im Speicher): reicht für ein volles Festzelt-WLAN, bremst Skripte */
const uiLimiter = createRateLimiter(10 * 60 * 1000, 300);

const startedAt = new Date();

const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** Tage des Zeitraums (YYYY-MM-DD, Schweizer Kalendertage), der letzte ist heute */
function rangeDays(days: number, now = new Date()): string[] {
  const today = zurichDayKey(now);
  return Array.from({ length: days }, (_, i) => addDaysToDayKey(today, i - (days - 1)));
}

/** Beginn des ersten Tages als Zeitpunkt (Mitternacht Schweizer Zeit) */
const zurichDayStart = (day: string) => new Date(zurichInputToIso(`${day}T00:00`)!);

const count = (key: string, label: string, n: number): StatsCountDto => ({ key, label, count: n });

/** Einträge mit Bezeichnung, absteigend sortiert, ohne leere */
function counts(map: Map<string, number>, labels: Record<string, string>): StatsCountDto[] {
  return [...map.entries()]
    .filter(([, n]) => n > 0)
    .map(([key, n]) => count(key, labels[key] ?? key, n))
    .sort((a, b) => b.count - a.count);
}

const increment = (map: Map<string, number>, key: string, n = 1) => map.set(key, (map.get(key) ?? 0) + n);

const statsRoutes: FastifyPluginAsync = async (fastify) => {
  // ---------------------------------------------------------------------------
  // Meldungen aus dem Browser
  // ---------------------------------------------------------------------------

  // Ohne Login und ohne Cookie. Wer «nicht verfolgen» (GPC/DNT) eingestellt hat, wird nicht gezählt
  // (der Browser schickt dann schon nichts, das hier ist die zweite Sicherung).
  fastify.post(
    '/api/stats/ui',
    {
      schema: {
        tags: ['Statistik'],
        summary: 'UI-Ereignisse aus dem Browser melden',
        description:
          'Nimmt anonymisierte Oberflächen-Metriken (ohne Cookies, unter Beachtung von Do-Not-Track/GPC) für aggregierte Nutzungsstatistiken entgegen. Der Body ist JSON der Form {"events":[{"name":"…","dim":"…"}]}, per sendBeacon auch als text/plain; darum prüft erst der Handler selbst, nicht das Routenschema.',
      },
    },
    async (request, reply) => {
    const isDnt = request.headers['sec-gpc'] === '1' || request.headers.dnt === '1';
    if (uiLimiter.hit(request.ip)) return reply.status(429).send({ error: 'Zu viele Meldungen' });
    // sendBeacon schickt text/plain, damit der Browser keine Vorab-Anfrage braucht
    let body: unknown = request.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return reply.status(400).send({ error: 'Ungültige Meldung' });
      }
    }
    const parse = UiStatsSchema.safeParse(body);
    if (!parse.success) return reply.status(400).send({ error: 'Ungültige Meldung' });
    for (const event of parse.data.events) {
      const isExplicit = event.name === 'HELP_FEEDBACK_YES' || event.name === 'HELP_FEEDBACK_NO';
      if (isDnt && !isExplicit) continue;
      if (isUiMetric(event.name)) trackUsageUnchecked(event.name, event.dim, request.tenant?.id ?? null);
    }
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------------------
  // Admin-Portal
  // ---------------------------------------------------------------------------

  fastify.register(async (admin) => {
    admin.addHook('onSend', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
    });
    const guard = { preHandler: [admin.requireGlobalAdmin] };

    // Zähler pro Tag, aktive Personen und eine Zeile pro Abteilung
    admin.get(
      '/api/admin/stats/usage',
      {
        ...guard,
        schema: {
          tags: ['Statistik'],
          summary: 'Nutzungsstatistiken abrufen (Admin)',
          description: 'Aggregierte Kennzahlen über Logins, Eintragungen, aktive Personen und Abteilungsaktivität.',
          security: [{ bearerAuth: [] }],
          querystring: RangeQuerySchema,
        },
      },
      async (request, reply) => {
      await flushUsageStats(fastify.prisma);
      const queryInput = request.query as z.output<typeof RangeQuerySchema>;
      const { days, departmentId } = queryInput;
      const dayList = rangeDays(days);
      const from = dayDate(dayList[0]);
      const today = dayList[dayList.length - 1];
      const departmentFilter = departmentId ? { departmentId } : {};
      const homeFilter = departmentId ? { homeDepartmentId: departmentId } : {};

      const [rows, activeToday, active7, active30, accounts] = await Promise.all([
        fastify.prisma.usageCounter.groupBy({
          by: ['day', 'metric', 'dim'],
          where: { day: { gte: from }, ...departmentFilter },
          _sum: { count: true },
        }),
        fastify.prisma.user.count({ where: { lastSeenOn: dayDate(today), ...homeFilter } }),
        fastify.prisma.user.count({ where: { lastSeenOn: { gte: dayDate(addDaysToDayKey(today, -6)) }, ...homeFilter } }),
        fastify.prisma.user.count({ where: { lastSeenOn: { gte: dayDate(addDaysToDayKey(today, -29)) }, ...homeFilter } }),
        fastify.prisma.user.count({ where: homeFilter }),
      ]);

      const dayIndex = new Map(dayList.map((d, i) => [d, i]));
      const metrics = new Map<string, AdminStatsMetricDto>();
      for (const metric of Object.keys(USAGE_METRICS) as UsageMetricKey[]) {
        metrics.set(metric, { metric, total: 0, daily: new Array(dayList.length).fill(0), byDim: [] });
      }
      const dims = new Map<string, Map<string, number>>();
      for (const row of rows) {
        const entry = metrics.get(row.metric);
        const index = dayIndex.get(row.day.toISOString().slice(0, 10));
        if (!entry || index === undefined) continue;
        const n = row._sum.count ?? 0;
        entry.total += n;
        entry.daily[index] += n;
        if (!dims.has(row.metric)) dims.set(row.metric, new Map());
        increment(dims.get(row.metric)!, row.dim, n);
      }
      for (const [metric, byDim] of dims) {
        metrics.get(metric)!.byDim = [...byDim.entries()]
          .map(([dim, total]) => ({ dim, total }))
          .sort((a, b) => b.total - a.total);
      }

      let departments: AdminStatsUsageDto['departments'] = [];
      if (!departmentId) {
        const [list, homes, actives, perDepartment] = await Promise.all([
          fastify.prisma.department.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } }),
          fastify.prisma.user.groupBy({ by: ['homeDepartmentId'], _count: { _all: true } }),
          fastify.prisma.user.groupBy({
            by: ['homeDepartmentId'],
            where: { lastSeenOn: { gte: dayDate(addDaysToDayKey(today, -29)) } },
            _count: { _all: true },
          }),
          fastify.prisma.usageCounter.groupBy({
            by: ['departmentId', 'metric'],
            where: {
              day: { gte: from },
              departmentId: { not: '' },
              metric: { in: ['LOGIN', 'SIGNUP', 'EVENT_CREATE', 'MESSAGE', 'UI_APP_LOAD'] },
            },
            _sum: { count: true },
          }),
        ]);
        const homeCount = new Map(homes.map((h) => [h.homeDepartmentId, h._count._all]));
        const activeCount = new Map(actives.map((h) => [h.homeDepartmentId, h._count._all]));
        const sums = new Map(perDepartment.map((r) => [`${r.departmentId}:${r.metric}`, r._sum.count ?? 0]));
        const sum = (id: string, metric: string) => sums.get(`${id}:${metric}`) ?? 0;
        departments = list.map((d) => ({
          ...d,
          homeUsers: homeCount.get(d.id) ?? 0,
          active30: activeCount.get(d.id) ?? 0,
          logins: sum(d.id, 'LOGIN'),
          signups: sum(d.id, 'SIGNUP'),
          eventsCreated: sum(d.id, 'EVENT_CREATE'),
          messages: sum(d.id, 'MESSAGE'),
          pageLoads: sum(d.id, 'UI_APP_LOAD'),
        }));
      }

      const result: AdminStatsUsageDto = {
        days: dayList,
        departmentId: departmentId ?? null,
        metrics: [...metrics.values()],
        active: { today: activeToday, last7: active7, last30: active30, accounts },
        departments,
      };
      return result;
    });

    // Einstellungen und Abläufe der Anlässe, aus den bestehenden Daten (es wird dafür nichts erhoben)
    admin.get(
      '/api/admin/stats/features',
      {
        ...guard,
        schema: {
          tags: ['Statistik'],
          summary: 'Feature- und Anlass-Statistiken abrufen (Admin)',
          description: 'Statistische Auswertungen über verwendete Funktionen wie Zugangstypen, Auslastung, Vorlaufzeiten, Anwesenheitserfassung und Rollen.',
          security: [{ bearerAuth: [] }],
          querystring: RangeQuerySchema,
        },
      },
      async (request, reply) => {
      const queryInput = request.query as z.output<typeof RangeQuerySchema>;
      const { days, departmentId } = queryInput;
      const dayList = rangeDays(days);
      const from = zurichDayStart(dayList[0]);
      const now = new Date();
      const eventWhere = departmentId ? Prisma.sql`AND e."departmentId" = ${departmentId}` : Prisma.empty;

      const events = await fastify.prisma.event.findMany({
        where: { startDate: { gte: from }, ...(departmentId ? { departmentId } : {}) },
        select: {
          id: true,
          accessType: true,
          attendanceMode: true,
          leadersOnly: true,
          requiredFields: true,
          isPublished: true,
          allowPublicSignup: true,
          minShiftsPerPerson: true,
          cancelDeadlineDays: true,
          signupOpensAt: true,
          responsibleMode: true,
          _count: {
            select: { questions: true, accessLinks: true, allowedDepartments: true, allowedStufen: true, organizers: true },
          },
        },
      });
      const eventIds = events.map((e) => e.id);

      const accessTypes = new Map<string, number>();
      const attendanceModes = new Map<string, number>();
      const requiredFields = new Map<string, number>();
      const options = new Map<string, number>();
      let okEvents = 0;
      let okMembers = 0;
      for (const e of events) {
        increment(accessTypes, e.accessType);
        increment(attendanceModes, e.attendanceMode);
        for (const field of e.requiredFields) increment(requiredFields, field);
        if (e.leadersOnly) increment(options, 'LEADERS_ONLY');
        if (e._count.questions > 0) increment(options, 'QUESTIONS');
        if (e._count.accessLinks > 0) increment(options, 'ACCESS_LINKS');
        if (e._count.allowedDepartments > 0) increment(options, 'WHITELIST');
        if (e._count.allowedStufen > 0) increment(options, 'STUFEN');
        if (e.minShiftsPerPerson) increment(options, 'MIN_SHIFTS');
        if (e.cancelDeadlineDays !== null) increment(options, 'CANCEL_DEADLINE');
        if (e.signupOpensAt) increment(options, 'SIGNUP_OPENS_AT');
        if (e.responsibleMode === 'BY_DAY') increment(options, 'DAY_RESPONSIBLES');
        if (e._count.organizers > 0) {
          okEvents++;
          okMembers += e._count.organizers;
        }
      }

      const [retention, fillRows, signupRows, leadRows, attendanceRows, messageRows, members] = await Promise.all([
        eventIds.length
          ? fastify.prisma.eventQuestion.groupBy({
              by: ['retentionDays'],
              where: { eventId: { in: eventIds } },
              _count: { _all: true },
            })
          : [],
        fastify.prisma.$queryRaw<{ events: number; slots: number; filled: number; shifts: number; full: number }[]>`
          SELECT COUNT(DISTINCT e.id)::int AS events,
                 COALESCE(SUM(s."requiredSlots"), 0)::int AS slots,
                 COALESCE(SUM(LEAST(c.n, s."requiredSlots")), 0)::int AS filled,
                 COUNT(s.id)::int AS shifts,
                 COUNT(s.id) FILTER (WHERE c.n >= s."requiredSlots")::int AS full
          FROM events e
          JOIN shifts s ON s."eventId" = e.id
          LEFT JOIN LATERAL (SELECT COUNT(*)::int AS n FROM shift_signups ss WHERE ss."shiftId" = s.id) c ON true
          WHERE e."endDate" >= ${from} AND e."endDate" <= ${now} ${eventWhere}`,
        fastify.prisma.$queryRaw<{ kind: string; n: number }[]>`
          SELECT CASE
                   WHEN l.performed_by_name IS NULL THEN 'SELF'
                   WHEN l.helper_user_id IS NULL THEN 'GUEST'
                   ELSE 'OK'
                 END AS kind,
                 COUNT(*)::int AS n
          FROM shift_signup_logs l JOIN events e ON e.id = l.event_id
          WHERE l.action = 'SIGNUP' AND l.created_at >= ${from} ${eventWhere}
          GROUP BY 1`,
        fastify.prisma.$queryRaw<{ bucket: string; n: number }[]>`
          SELECT CASE
                   WHEN d < 1 THEN 'D0'
                   WHEN d < 4 THEN 'D1'
                   WHEN d < 8 THEN 'D4'
                   WHEN d < 15 THEN 'D8'
                   WHEN d < 31 THEN 'D15'
                   ELSE 'D31'
                 END AS bucket,
                 COUNT(*)::int AS n
          FROM (
            SELECT EXTRACT(EPOCH FROM (s."startTime" - ss."createdAt")) / 86400 AS d
            FROM shift_signups ss
            JOIN shifts s ON s.id = ss."shiftId"
            JOIN events e ON e.id = s."eventId"
            WHERE ss."createdAt" >= ${from} ${eventWhere}
          ) t
          GROUP BY 1`,
        fastify.prisma.$queryRaw<{ status: string | null; source: string | null; n: number }[]>`
          SELECT ss.attendance AS status, ss.attendance_source AS source, COUNT(*)::int AS n
          FROM shift_signups ss
          JOIN shifts s ON s.id = ss."shiftId"
          JOIN events e ON e.id = s."eventId"
          WHERE e.attendance_mode <> 'OFF' AND s."endTime" >= ${from} AND s."endTime" <= ${now} ${eventWhere}
          GROUP BY 1, 2`,
        fastify.prisma.$queryRaw<{ target: string; n: number; recipients: number; failed: number }[]>`
          SELECT m.target, COUNT(*)::int AS n, COALESCE(SUM(m.recipient_count), 0)::int AS recipients,
                 COALESCE(SUM(m.failed_count), 0)::int AS failed
          FROM event_messages m JOIN events e ON e.id = m.event_id
          WHERE m.created_at >= ${from} ${eventWhere}
          GROUP BY 1`,
        fastify.prisma.departmentMember.findMany({
          where: departmentId ? { departmentId } : {},
          select: { role: true, permissions: true },
        }),
      ]);

      const retentionMap = new Map<string, number>();
      for (const r of retention) increment(retentionMap, r.retentionDays === null ? 'NEVER' : String(r.retentionDays), r._count._all);
      const retentionLabels: Record<string, string> = { NEVER: 'nie löschen', '0': 'gleich nach dem Anlass' };
      for (const r of retention) {
        if (r.retentionDays) retentionLabels[String(r.retentionDays)] = `nach ${r.retentionDays} Tagen`;
      }

      const fill = fillRows[0] ?? { events: 0, slots: 0, filled: 0, shifts: 0, full: 0 };

      const attendance = new Map<string, number>();
      for (const r of attendanceRows) {
        increment(attendance, r.status ?? 'OPEN', r.n);
        if (r.status === 'PRESENT' && r.source) increment(attendance, `SOURCE_${r.source}`, r.n);
      }

      const roles = new Map<string, number>();
      for (const m of members) {
        if (m.role === 'ADMIN') increment(roles, 'LEADER');
        else if (normalizePermissions(m.permissions).length === 0) increment(roles, 'NONE');
        else increment(roles, permissionPresetOf(m.permissions) ?? 'CUSTOM');
      }

      const labelsOf = (obj: Record<string, unknown>, pick: (v: never) => string) =>
        Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, pick(v as never)]));

      const result: AdminStatsFeaturesDto = {
        days,
        departmentId: departmentId ?? null,
        events: {
          count: events.length,
          published: events.filter((e) => e.isPublished).length,
          signupClosed: events.filter((e) => !e.allowPublicSignup).length,
          accessTypes: counts(accessTypes, labelsOf(EVENT_ACCESS_TYPES, (v: { label: string }) => v.label)),
          attendanceModes: counts(attendanceModes, ATTENDANCE_MODES),
          requiredFields: counts(requiredFields, labelsOf(REQUIRED_PROFILE_FIELDS, (v: { label: string }) => v.label)),
          options: counts(options, {
            LEADERS_ONLY: 'Nur Leitende',
            QUESTIONS: 'Eigene Fragen',
            ACCESS_LINKS: 'Zugangs-Links',
            WHITELIST: 'Weitere Abteilungen',
            STUFEN: 'Stufen-Filter',
            MIN_SHIFTS: 'Mindestanzahl Schichten',
            CANCEL_DEADLINE: 'Austrage-Sperre',
            SIGNUP_OPENS_AT: 'Eintragen ab Datum',
            DAY_RESPONSIBLES: 'Verantwortliche pro Tag',
          }),
          questionRetention: counts(retentionMap, retentionLabels),
        },
        fill: {
          events: fill.events,
          slots: fill.slots,
          signups: fill.filled,
          fullShiftsPct: fill.shifts ? Math.round((fill.full / fill.shifts) * 100) : null,
          avgFillPct: fill.slots ? Math.round((fill.filled / fill.slots) * 100) : null,
        },
        signupsBy: counts(new Map(signupRows.map((r) => [r.kind, r.n])), {
          SELF: 'selbst eingetragen',
          OK: 'durch das OK',
          GUEST: 'Gast (durch das OK)',
        }),
        signupLead: ['D0', 'D1', 'D4', 'D8', 'D15', 'D31'].map((key) =>
          count(
            key,
            {
              D0: 'am selben Tag',
              D1: '1–3 Tage vorher',
              D4: '4–7 Tage vorher',
              D8: '1–2 Wochen vorher',
              D15: '2–4 Wochen vorher',
              D31: 'mehr als einen Monat vorher',
            }[key]!,
            leadRows.find((r) => r.bucket === key)?.n ?? 0
          )
        ),
        attendance: counts(attendance, {
          PRESENT: 'anwesend',
          EXCUSED: 'entschuldigt',
          NO_SHOW: 'nicht erschienen',
          OPEN: 'nicht erfasst',
          SOURCE_OK: 'davon durch das OK abgehakt',
          SOURCE_QR: 'davon per QR eingecheckt',
        }),
        messages: {
          count: messageRows.reduce((a, r) => a + r.n, 0),
          recipients: messageRows.reduce((a, r) => a + r.recipients, 0),
          failed: messageRows.reduce((a, r) => a + r.failed, 0),
          byTarget: counts(
            new Map(messageRows.map((r) => [r.target, r.n])),
            (USAGE_METRICS.MESSAGE as { dims: Record<string, string> }).dims
          ),
        },
        okTeams: { events: okEvents, avgSize: okEvents ? Math.round((okMembers / okEvents) * 10) / 10 : null },
        roles: counts(roles, {
          LEADER: 'Abteilungsleitung',
          NONE: 'ohne Rechte',
          CUSTOM: 'Eigene Rechte',
          ...labelsOf(DEPARTMENT_PERMISSION_PRESETS, (v: { label: string }) => v.label),
        }),
      };
      return result;
    });

    // Betrieb: Anfragen, Antwortzeiten, Datenbank, Speicher, Verläufe der Bestandszahlen
    admin.get(
      '/api/admin/stats/system',
      {
        ...guard,
        schema: {
          tags: ['Statistik'],
          summary: 'System- und Performance-Metriken abrufen (Admin)',
          description: 'Technische Kennzahlen: HTTP-Anfragen, Antwortzeiten, Tabellengrössen, Speicherplatz und Uploads.',
          security: [{ bearerAuth: [] }],
          querystring: RangeQuerySchema,
        },
      },
      async (request, reply) => {
      const queryInput = request.query as z.output<typeof RangeQuerySchema>;
      const dayList = rangeDays(queryInput.days);
      const from = zurichDayStart(dayList[0]);

      const [tables, dbSize, uploads, dailyRows, routeRows, bucketRows, snapshots] = await Promise.all([
        fastify.prisma.$queryRaw<{ name: string; bytes: bigint; rows: bigint }[]>`
          SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes, GREATEST(c.reltuples, 0)::bigint AS rows
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
          ORDER BY bytes DESC
          LIMIT 12`,
        fastify.prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
        fastify.prisma.upload.aggregate({ _count: { _all: true }, _sum: { size: true } }),
        fastify.prisma.$queryRaw<{ day: string; status_class: string; n: bigint }[]>`
          SELECT to_char((period AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Zurich', 'YYYY-MM-DD') AS day,
                 status_class, SUM(count) AS n
          FROM request_stats
          WHERE period >= ${from}
          GROUP BY 1, 2`,
        fastify.prisma.$queryRaw<
          { route: string; method: string; status_class: string; n: bigint; total_ms: number; max_ms: number }[]
        >`
          SELECT route, method, status_class, SUM(count) AS n, SUM(total_ms) AS total_ms, MAX(max_ms) AS max_ms
          FROM request_stats
          WHERE period >= ${from}
          GROUP BY 1, 2, 3`,
        fastify.prisma.$queryRaw<{ route: string; method: string; i: bigint; n: bigint }[]>`
          SELECT route, method, u.i, SUM(u.b) AS n
          FROM request_stats, unnest(buckets) WITH ORDINALITY AS u(b, i)
          WHERE period >= ${from}
          GROUP BY 1, 2, 3`,
        fastify.prisma.statsSnapshot.findMany({ where: { day: { gte: dayDate(dayList[0]) } } }),
      ]);

      const dayIndex = new Map(dayList.map((d, i) => [d, i]));
      const daily = dayList.map(() => ({ count: 0, errors5xx: 0, client4xx: 0, rateLimited: 0 }));
      for (const row of dailyRows) {
        const index = dayIndex.get(row.day);
        if (index === undefined) continue;
        const n = Number(row.n);
        daily[index].count += n;
        if (row.status_class === '5xx') daily[index].errors5xx += n;
        if (row.status_class === '4xx') daily[index].client4xx += n;
        if (row.status_class === '429') daily[index].rateLimited += n;
      }

      const routes = new Map<string, AdminStatsRouteDto & { totalMs: number; buckets: number[] }>();
      for (const row of routeRows) {
        const key = `${row.method} ${row.route}`;
        let entry = routes.get(key);
        if (!entry) {
          entry = {
            route: row.route,
            method: row.method,
            count: 0,
            errors5xx: 0,
            client4xx: 0,
            rateLimited: 0,
            avgMs: 0,
            p50Ms: null,
            p95Ms: null,
            maxMs: 0,
            totalMs: 0,
            buckets: [],
          };
          routes.set(key, entry);
        }
        const n = Number(row.n);
        entry.count += n;
        entry.totalMs += Number(row.total_ms);
        entry.maxMs = Math.max(entry.maxMs, Number(row.max_ms));
        if (row.status_class === '5xx') entry.errors5xx += n;
        if (row.status_class === '4xx') entry.client4xx += n;
        if (row.status_class === '429') entry.rateLimited += n;
      }
      const allBuckets: number[] = [];
      for (const row of bucketRows) {
        const entry = routes.get(`${row.method} ${row.route}`);
        const index = Number(row.i) - 1;
        if (entry) entry.buckets[index] = (entry.buckets[index] ?? 0) + Number(row.n);
        allBuckets[index] = (allBuckets[index] ?? 0) + Number(row.n);
      }
      const fillGaps = (b: number[]) => Array.from(b, (n) => n ?? 0);
      const routeList: AdminStatsRouteDto[] = [...routes.values()]
        .map(({ totalMs, buckets, ...entry }) => ({
          ...entry,
          avgMs: entry.count ? Math.round(totalMs / entry.count) : 0,
          maxMs: Math.round(entry.maxMs),
          p50Ms: percentileFromBuckets(fillGaps(buckets), 0.5),
          p95Ms: percentileFromBuckets(fillGaps(buckets), 0.95),
        }))
        .sort((a, b) => b.count - a.count);

      const sum = (key: keyof (typeof daily)[number]) => daily.reduce((a, d) => a + d[key], 0);
      const series = Object.entries(SNAPSHOT_KEYS).map(([key, label]) => {
        const values: (number | null)[] = dayList.map(() => null);
        for (const s of snapshots) {
          if (s.key !== key) continue;
          const index = dayIndex.get(s.day.toISOString().slice(0, 10));
          if (index !== undefined) values[index] = s.value;
        }
        return { key, label, values };
      });

      const memory = process.memoryUsage();
      const result: AdminStatsSystemDto = {
        generatedAt: new Date().toISOString(),
        environment: `${process.env.NODE_ENV ?? 'development'} · ${process.env.DOMAIN ?? 'localhost'}`,
        startedAt: startedAt.toISOString(),
        nodeVersion: process.version,
        memory: { rssMb: Math.round(memory.rss / 1048576), heapUsedMb: Math.round(memory.heapUsed / 1048576) },
        database: {
          bytes: Number(dbSize[0]?.bytes ?? 0),
          tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: Number(t.rows) })),
        },
        uploads: { count: uploads._count._all, bytes: uploads._sum.size ?? 0 },
        requests: {
          days: dayList,
          daily,
          total: {
            count: sum('count'),
            errors5xx: sum('errors5xx'),
            client4xx: sum('client4xx'),
            rateLimited: sum('rateLimited'),
            p95Ms: percentileFromBuckets(fillGaps(allBuckets), 0.95),
          },
          routes: routeList.slice(0, 60),
        },
        snapshots: { days: dayList, series },
      };
      return result;
    });

  });
};

export default statsRoutes;
