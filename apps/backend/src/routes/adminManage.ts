/**
 * Admin-Portal: Abteilungen und Anlässe über alle Abteilungen verwalten, Rollen vergeben.
 * Nur globale Admins (`requireGlobalAdmin` prüft die Rolle in der DB).
 */
import { FastifyPluginAsync } from 'fastify';
import { Prisma, PrismaClient } from '../db.js';
import { z } from 'zod';
import {
  ConfirmDeleteSchema,
  AdminCreateDepartmentSchema,
  AdminMergeUserSchema,
  AdminSetMemberRoleSchema,
  AdminUpdateDepartmentSchema,
  AdminUpdateEventSchema,
  AdminUpdateUserSchema,
  type AdminAuditListDto,
  type AdminDashboardDto,
  type AdminDepartmentDetailDto,
  type AdminDepartmentListItemDto,
  type AdminEventListDto,
  type AdminEventListItemDto,
  normalizePermissions,
} from '@schichtplan/shared';
import { autoCreateAllCeviDbDepartmentStufen, autoCreateCeviDbDepartmentStufen, ceviDbGroupPeople, NO_HOME_CONFIRMATION } from '../services/homeDepartment.js';
import { CEVINAME_ROLE_ERROR, isCeviNameProfile } from '../services/ceviNameLogin.js';
import { mergeUserInto } from '../services/mergeProfiles.js';
import { personLabel } from '../services/profile.js';
import { notifyAdminChange, recordAdminAction } from '../services/adminAudit.js';
import { sendServerAlert } from '../services/serverAlert.js';
import { recordDepartmentAction, toDepartmentAuditDto } from '../services/departmentAudit.js';
import { contactCandidateWhere } from './departments.js';
import { findDuplicateUsers, loginMethods, toListItem, userSelect } from './admin.js';

const EventListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: z.string().uuid().optional(),
  when: z.enum(['upcoming', 'drafts', 'urgent', 'signup_closed', 'past', 'all']).default('upcoming'),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const AuditQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  targetType: z.enum(['USER', 'DEPARTMENT', 'EVENT']).optional(),
  targetId: z.string().max(100).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Welches Feld eine Unique-Verletzung ausgelöst hat (slug oder ceviDbGroupId) */
function uniqueConflictMessage(err: Prisma.PrismaClientKnownRequestError) {
  const target = JSON.stringify(err.meta ?? {});
  if (target.includes('slug')) return 'Diese Subdomain ist bereits vergeben.';
  if (/cevi_?db_?group/i.test(target)) return 'Diese Cevi.DB-Ortsgruppe gehört bereits zu einer anderen Abteilung.';
  return 'Ein Wert ist bereits vergeben.';
}

const eventSelect = {
  id: true,
  title: true,
  slug: true,
  startDate: true,
  endDate: true,
  isPublished: true,
  allowPublicSignup: true,
  accessType: true,
  createdAt: true,
  department: { select: { id: true, name: true, slug: true } },
  _count: { select: { organizers: true } },
} satisfies Prisma.EventSelect;

type EventRow = Prisma.EventGetPayload<{ select: typeof eventSelect }>;

/** Schichten, Plätze und Eintragungen pro Anlass (ohne alle Schichten zu laden) */
async function toEventItems(prisma: PrismaClient, rows: EventRow[]): Promise<AdminEventListItemDto[]> {
  const ids = rows.map((e) => e.id);
  const shiftStats = ids.length
    ? await prisma.shift.groupBy({
        by: ['eventId'],
        where: { eventId: { in: ids } },
        _count: { _all: true },
        _sum: { requiredSlots: true },
      })
    : [];
  const signupStats = ids.length
    ? await prisma.$queryRaw<{ eventId: string; n: number }[]>`
        SELECT s."eventId" AS "eventId", COUNT(ss.id)::int AS n
        FROM shift_signups ss JOIN shifts s ON s.id = ss."shiftId"
        WHERE s."eventId" IN (${Prisma.join(ids)})
        GROUP BY s."eventId"`
    : [];
  const shifts = new Map(shiftStats.map((s) => [s.eventId, s]));
  const signups = new Map(signupStats.map((s) => [s.eventId, s.n]));

  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    departmentId: e.department.id,
    departmentName: e.department.name,
    departmentSlug: e.department.slug,
    startDate: e.startDate.toISOString(),
    endDate: e.endDate.toISOString(),
    isPublished: e.isPublished,
    allowPublicSignup: e.allowPublicSignup,
    accessType: e.accessType,
    shiftCount: shifts.get(e.id)?._count._all ?? 0,
    slotCount: shifts.get(e.id)?._sum.requiredSlots ?? 0,
    signupCount: signups.get(e.id) ?? 0,
    organizerCount: e._count.organizers,
    createdAt: e.createdAt.toISOString(),
  }));
}

const departmentSelect = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  primaryColor: true,
  contactUserId: true,
  contactUser: { select: { firstName: true, lastName: true, ceviName: true } },
  ceviDbGroupId: true,
  membersOnly: true,
  createdAt: true,
  _count: { select: { members: true, homeUsers: true, events: true } },
  members: {
    where: { role: 'ADMIN' },
    select: { user: { select: { id: true, firstName: true, lastName: true, ceviName: true } } },
  },
} satisfies Prisma.DepartmentSelect;

type DepartmentRow = Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>;

async function toDepartmentItems(prisma: PrismaClient, rows: DepartmentRow[]): Promise<AdminDepartmentListItemDto[]> {
  const ids = rows.map((d) => d.id);
  const now = new Date();
  const upcoming = ids.length
    ? await prisma.event.groupBy({
        by: ['departmentId'],
        where: { departmentId: { in: ids }, endDate: { gte: now } },
        _count: { _all: true },
      })
    : [];
  const signupStats = ids.length
    ? await prisma.$queryRaw<{ departmentId: string; n: number }[]>`
        SELECT e."departmentId" AS "departmentId", COUNT(ss.id)::int AS n
        FROM shift_signups ss
        JOIN shifts s ON s.id = ss."shiftId"
        JOIN events e ON e.id = s."eventId"
        WHERE e."departmentId" IN (${Prisma.join(ids)})
        GROUP BY e."departmentId"`
    : [];
  const upcomingMap = new Map(upcoming.map((u) => [u.departmentId, u._count._all]));
  const signupMap = new Map(signupStats.map((s) => [s.departmentId, s.n]));

  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    logoUrl: d.logoUrl,
    primaryColor: d.primaryColor,
    contactUserId: d.contactUserId,
    contactName: d.contactUser ? personLabel(d.contactUser) : null,
    ceviDbGroupId: d.ceviDbGroupId,
    membersOnly: d.membersOnly,
    memberCount: d._count.members,
    homeUserCount: d._count.homeUsers,
    eventCount: d._count.events,
    upcomingEventCount: upcomingMap.get(d.id) ?? 0,
    signupCount: signupMap.get(d.id) ?? 0,
    leaders: d.members
      .map((m) => ({ userId: m.user.id, name: personLabel(m.user) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    createdAt: d.createdAt.toISOString(),
  }));
}

/**
 * Bereits angemeldete Cevi.DB-Personen einer Gruppe der Abteilung zuordnen (Heimabteilung + Helfer*in),
 * wie beim Anlegen durch die Abteilungsleitung. Bestehende Rollen bleiben.
 */
async function attachCeviDbGroup(prisma: PrismaClient, departmentId: string, groupId: number) {
  const people = await ceviDbGroupPeople(prisma, groupId);
  if (!people.length) return 0;
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: people.filter((p) => p.moveHome).map((p) => p.id) } },
      data: { homeDepartmentId: departmentId, homeDepartmentSource: 'CEVIDB', ...NO_HOME_CONFIRMATION, departmentSetupAt: new Date() },
    }),
    prisma.departmentMember.createMany({
      data: people.map((p) => ({
        departmentId,
        userId: p.id,
        role: p.isLeader ? 'ADMIN' : 'HELPER',
        leaderSource: p.isLeader ? 'CEVIDB' : null,
      })),
      skipDuplicates: true,
    }),
  ]);
  const leaderIds = people.filter((p) => p.isLeader).map((p) => p.id);
  if (leaderIds.length) {
    await prisma.departmentMember.updateMany({
      where: { departmentId, userId: { in: leaderIds }, role: { not: 'ADMIN' } },
      data: { role: 'ADMIN', leaderSource: 'CEVIDB' },
    });
  }
  for (const p of people) {
    await autoCreateCeviDbDepartmentStufen(prisma, departmentId, p.id);
  }
  return people.length;
}

const adminManageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  const guard = { preHandler: [fastify.requireGlobalAdmin] };

  // Admin-Sitzung: Anmeldeart und Ablauf (das Portal fragt das beim Start ab)
  fastify.get(
    '/api/admin/session',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Admin-Sitzungsstatus prüfen',
        description: 'Gibt Gültigkeit, Anmeldeart und Ablaufzeitpunkt der aktuellen Admin-Sitzung zurück.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => ({
    loginMethod: request.adminSession?.loginMethod ?? null,
    issuedAt: request.adminSession?.issuedAt.toISOString() ?? null,
    expiresAt: request.adminSession?.expiresAt.toISOString() ?? null,
  }));

  // Server-Alert-Webhook manuell testen (Server-Leitung)
  fastify.post(
    '/api/admin/alert-test',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Server-Alert-Webhook testen',
        description: 'Löst eine Test-Benachrichtigung an den konfigurierten Notfall-Webhook aus.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => {
    const result = await sendServerAlert(
      {
        category: 'TEST',
        level: 'INFO',
        title: 'Server-Leitung Webhook-Test',
        message: 'Dies ist eine Test-Benachrichtigung aus dem Admin-Portal des Cevi Schichtplans.',
        context: {
          adminUserId: request.user.id,
          triggeredAt: new Date().toISOString(),
        },
      },
      { force: true }
    );
    return { ok: true, result };
  });

  // ---------------------------------------------------------------------------
  // Startseite
  // ---------------------------------------------------------------------------

  fastify.get(
    '/api/admin/dashboard',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Admin-Dashboard-Zahlen abrufen',
        description: 'Zentrale Kennzahlen zu Abteilungen, Anlässen, Schichten und Konten für das Admin-Dashboard.',
        security: [{ bearerAuth: [] }],
      },
    },
    async () => {
    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const [upcomingRows, recentUsers, allDepts, signups7d] = await Promise.all([
      fastify.prisma.event.findMany({
        where: { endDate: { gte: now } },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        take: 6,
        select: eventSelect,
      }),
      fastify.prisma.user.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 6, select: userSelect }),
      fastify.prisma.department.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          members: {
            where: { role: 'ADMIN' },
            select: { id: true },
            take: 1,
          },
          events: {
            select: { endDate: true },
            orderBy: { endDate: 'desc' },
            take: 1,
          },
        },
      }),
      fastify.prisma.shiftSignup.count({ where: { createdAt: { gte: weekAgo } } }),
    ]);

    const withoutLeader = allDepts
      .filter((d) => d.members.length === 0)
      .map((d) => ({ id: d.id, name: d.name, slug: d.slug }));

    const inactiveDepartments = allDepts
      .filter((d) => {
        const lastEvent = d.events[0];
        if (!lastEvent) {
          return d.createdAt < thirtyDaysAgo;
        }
        return lastEvent.endDate < sixMonthsAgo;
      })
      .map((d) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        lastEventDate: d.events[0]?.endDate.toISOString() ?? null,
      }));

    const dashboard: AdminDashboardDto = {
      upcomingEvents: await toEventItems(fastify.prisma, upcomingRows),
      recentUsers: recentUsers.map((u) => toListItem(u)),
      departmentsWithoutLeader: withoutLeader,
      inactiveDepartments,
      signups7d,
    };
    return dashboard;
  });

  // ---------------------------------------------------------------------------
  // Abteilungen
  // ---------------------------------------------------------------------------

  fastify.get(
    '/api/admin/departments',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Alle Abteilungen verwalten (Admin)',
        description: 'Liefert alle registrierten Abteilungen mit Leitungs- und Statusinformationen.',
        security: [{ bearerAuth: [] }],
      },
    },
    async () => {
    const rows = await fastify.prisma.department.findMany({ orderBy: { name: 'asc' }, select: departmentSelect });
    return { items: await toDepartmentItems(fastify.prisma, rows) };
  });

  fastify.get<{ Params: { id: string } }>(
    '/api/admin/departments/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilungsdetails abrufen (Admin)',
        description: 'Detaillierte Übersicht über Mitglieder, Stufen, Anlässe und Cevi.DB-Gruppe einer Abteilung.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Abteilung'),
        }),
      },
    },
    async (request, reply) => {
    const parsedId = z.string().uuid().safeParse(request.params.id);
    if (!parsedId.success) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
    const departmentId = parsedId.data;

    const row = await fastify.prisma.department.findUnique({ where: { id: departmentId }, select: departmentSelect });
    if (!row) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });

    const personSelect = {
      id: true,
      firstName: true,
      lastName: true,
      ceviName: true,
      email: true,
      isGlobalAdmin: true,
      ceviDbId: true,
      passwordHash: true,
      homeDepartmentId: true,
      homeDepartmentSource: true,
    } satisfies Prisma.UserSelect;

    await autoCreateAllCeviDbDepartmentStufen(fastify.prisma, departmentId);

    const [[item], members, homeUsers, stufen, eventRows, auditRows, templates] = await Promise.all([
      toDepartmentItems(fastify.prisma, [row]),
      fastify.prisma.departmentMember.findMany({
        where: { departmentId },
        select: { role: true, permissions: true, leaderSource: true, user: { select: personSelect } },
      }),
      fastify.prisma.user.findMany({ where: { homeDepartmentId: departmentId }, select: personSelect }),
      fastify.prisma.departmentStufe.findMany({
        where: { departmentId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, ceviDbGroupId: true, _count: { select: { members: true } } },
      }),
      fastify.prisma.event.findMany({
        where: { departmentId },
        orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
        select: eventSelect,
      }),
      fastify.prisma.departmentAuditLog.findMany({
        where: { departmentId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
      }),
      fastify.prisma.eventTemplate.findMany({
        where: { departmentId },
        orderBy: { title: 'asc' },
        select: { id: true, title: true, description: true, data: true },
      }),
    ]);

    // Rollen und Heimabteilung zu einer Liste zusammenführen
    type PersonRow = (typeof homeUsers)[number];
    type Membership = { role: string; permissions: string[]; leaderSource: string | null };
    const people = new Map<string, { user: PersonRow; membership: Membership | null }>();
    for (const u of homeUsers) people.set(u.id, { user: u, membership: null });
    for (const m of members) people.set(m.user.id, { user: m.user, membership: m });

    // Abteilungsleitung zuerst, dann wer Rechte hat, dann alle anderen
    const rank = (m: Membership | null) => (m?.role === 'ADMIN' ? 0 : m && m.permissions.length > 0 ? 1 : 2);
    const detail: AdminDepartmentDetailDto = {
      ...item,
      people: [...people.values()]
        .sort(
          (a, b) =>
            rank(a.membership) - rank(b.membership) ||
            `${a.user.lastName} ${a.user.firstName}`.localeCompare(`${b.user.lastName} ${b.user.firstName}`, 'de')
        )
        .map(({ user, membership }) => ({
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          ceviName: user.ceviName,
          email: user.email,
          isGlobalAdmin: user.isGlobalAdmin,
          loginMethods: loginMethods(user),
          role: membership?.role ?? null,
          permissions: membership && membership.role !== 'ADMIN' ? normalizePermissions(membership.permissions) : [],
          leaderSource: membership?.role === 'ADMIN' ? (membership.leaderSource ?? 'MANUAL') : null,
          isHome: user.homeDepartmentId === departmentId,
          homeSource: user.homeDepartmentId === departmentId ? user.homeDepartmentSource : null,
        })),
      stufen: stufen.map((s) => ({
        id: s.id,
        name: s.name,
        ceviDbGroupId: s.ceviDbGroupId,
        memberCount: s._count.members,
      })),
      events: await toEventItems(fastify.prisma, eventRows),
      audit: auditRows.map(toDepartmentAuditDto),
    };

    request.log.info({ adminId: request.user.id, departmentId }, 'Admin: Abteilung abgerufen');
    return detail;
  });

  fastify.post(
    '/api/admin/departments',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilung manuell erstellen (Admin)',
        description: 'Erstellt eine neue Abteilung ohne Cevi.DB-Prüfung und weist optional eine erste Abteilungsleitung zu.',
        security: [{ bearerAuth: [] }],
        body: AdminCreateDepartmentSchema,
      },
    },
    async (request, reply) => {
    const parse = AdminCreateDepartmentSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
    const { name, slug, ceviDbGroupId, membersOnly, leaderUserId } = parse.data;

    if (ceviDbGroupId) {
      const existingWithGroup = await fastify.prisma.department.findUnique({
        where: { ceviDbGroupId },
        select: { id: true, name: true, slug: true },
      });
      if (existingWithGroup) {
        return reply.status(409).send({
          error: `Für diese Cevi.DB-Gruppe existiert bereits die Abteilung «${existingWithGroup.name}» (${existingWithGroup.slug}).`,
        });
      }
    }

    if (leaderUserId) {
      const leader = await fastify.prisma.user.findUnique({
        where: { id: leaderUserId },
        select: { passwordHash: true, ceviDbId: true },
      });
      if (!leader) return reply.status(400).send({ error: 'Die gewählte Abteilungsleitung gibt es nicht.' });
      if (isCeviNameProfile(leader)) return reply.status(400).send({ error: CEVINAME_ROLE_ERROR });
    }

    let created;
    try {
      created = await fastify.prisma.department.create({
        data: {
          name,
          slug,
          ceviDbGroupId: ceviDbGroupId ?? null,
          // Erste Abteilungsleitung ist auch die Kontaktperson
          contactUserId: leaderUserId ?? null,
          membersOnly,
          members: leaderUserId
            ? { create: [{ userId: leaderUserId, role: 'ADMIN', leaderSource: 'MANUAL' }] }
            : undefined,
        },
        select: { id: true, name: true, slug: true },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.status(409).send({ error: uniqueConflictMessage(err as Prisma.PrismaClientKnownRequestError) });
      }
      throw err;
    }

    const attached = ceviDbGroupId ? await attachCeviDbGroup(fastify.prisma, created.id, ceviDbGroupId) : 0;

    await recordAdminAction(fastify.prisma, request, {
      action: 'DEPARTMENT_CREATE',
      targetType: 'DEPARTMENT',
      targetId: created.id,
      targetLabel: `${created.name} (${created.slug})`,
      details: { ceviDbGroupId: ceviDbGroupId ?? null, leaderUserId: leaderUserId ?? null, attached },
    });
    return reply.status(201).send({ department: created, attached });
  });

  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/departments/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilung bearbeiten (Admin)',
        description: 'Aktualisiert Stammdaten, Subdomain, Cevi.DB-Gruppe oder Sichtbarkeit einer Abteilung.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Abteilung'),
        }),
        body: AdminUpdateDepartmentSchema,
      },
    },
    async (request, reply) => {
    const parse = AdminUpdateDepartmentSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
    const data = parse.data;

    const existing = await fastify.prisma.department.findUnique({
      where: { id: request.params.id },
      select: { id: true, name: true, slug: true, ceviDbGroupId: true, membersOnly: true },
    }).catch(() => null);
    if (!existing) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });

    if (data.contactUserId) {
      const candidate = await fastify.prisma.departmentMember.findFirst({
        where: { ...contactCandidateWhere(existing.id), userId: data.contactUserId },
        select: { id: true },
      });
      if (!candidate) {
        return reply.status(400).send({
          error: 'Kontaktperson kann nur die Abteilungsleitung oder jemand mit «Personen und Rechte verwalten» sein.',
        });
      }
    }

    // Vor dem Speichern prüfen (danach fände sich die Abteilung selbst) und nur bei anderen Abteilungen
    if (data.ceviDbGroupId && data.ceviDbGroupId !== existing.ceviDbGroupId) {
      const existingWithGroup = await fastify.prisma.department.findUnique({
        where: { ceviDbGroupId: data.ceviDbGroupId },
        select: { id: true, name: true, slug: true },
      });
      if (existingWithGroup && existingWithGroup.id !== existing.id) {
        return reply.status(409).send({
          error: `Für diese Cevi.DB-Gruppe existiert bereits die Abteilung «${existingWithGroup.name}» (${existingWithGroup.slug}).`,
        });
      }
    }

    try {
      await fastify.prisma.department.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          slug: data.slug,
          logoUrl: data.logoUrl !== undefined ? data.logoUrl || null : undefined,
          primaryColor: data.primaryColor,
          contactUserId: data.contactUserId,
          membersOnly: data.membersOnly,
          ceviDbGroupId: data.ceviDbGroupId,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.status(409).send({ error: uniqueConflictMessage(err as Prisma.PrismaClientKnownRequestError) });
      }
      throw err;
    }

    const newGroup = data.ceviDbGroupId;
    const attached =
      newGroup && newGroup !== existing.ceviDbGroupId ? await attachCeviDbGroup(fastify.prisma, existing.id, newGroup) : 0;

    await recordAdminAction(fastify.prisma, request, {
      action: 'DEPARTMENT_UPDATE',
      targetType: 'DEPARTMENT',
      targetId: existing.id,
      targetLabel: `${data.name ?? existing.name} (${data.slug ?? existing.slug})`,
      details: {
        changes: data,
        before: {
          name: existing.name,
          slug: existing.slug,
          ceviDbGroupId: existing.ceviDbGroupId,
          membersOnly: existing.membersOnly,
        },
        attached,
      },
    });
    return { success: true, attached };
  });

  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/departments/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilung löschen (Admin)',
        description: 'Löscht eine Abteilung samt aller Anlässe, Schichten und Zuweisungen unwiderruflich (Bestätigung des Slugs erforderlich).',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Abteilung'),
        }),
        body: ConfirmDeleteSchema,
      },
    },
    async (request, reply) => {
    const parse = ConfirmDeleteSchema.safeParse(request.body ?? {});
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });

    const department = await fastify.prisma.department.findUnique({
      where: { id: request.params.id },
      select: { id: true, slug: true, name: true, _count: { select: { events: true, members: true } } },
    }).catch(() => null);
    if (!department) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
    if (parse.data.confirm !== department.slug) {
      return reply.status(400).send({ error: 'Zur Bestätigung die Subdomain der Abteilung genau eintippen.' });
    }

    await fastify.prisma.$transaction([
      // Heimabteilung fällt weg: beim nächsten Login wieder nachfragen
      fastify.prisma.user.updateMany({
        where: { homeDepartmentId: department.id },
        data: { homeDepartmentId: null, homeDepartmentSource: null, ...NO_HOME_CONFIRMATION, departmentSetupAt: null },
      }),
      // Kaskadiert zu Anlässen, Schichten, Eintragungen, Rollen, Stufen, Vorlagen und Arbeiten
      fastify.prisma.department.delete({ where: { id: department.id } }),
    ]);

    await recordAdminAction(fastify.prisma, request, {
      action: 'DEPARTMENT_DELETE',
      targetType: 'DEPARTMENT',
      targetId: department.id,
      targetLabel: `${department.name} (${department.slug})`,
      details: { events: department._count.events, members: department._count.members },
    });
    return { success: true };
  });

  // Rolle in einer Abteilung setzen (legt die Mitgliedschaft bei Bedarf an)
  fastify.put<{ Params: { id: string; userId: string } }>(
    '/api/admin/departments/:id/members/:userId',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilungsrolle oder Rechte setzen (Admin)',
        description: 'Weist einer Person die Leitungsrolle (ADMIN) oder Helferrechte (HELPER) in einer Abteilung zu.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Abteilung'),
          userId: z.string().uuid().describe('ID der Person'),
        }),
        body: AdminSetMemberRoleSchema,
      },
    },
    async (request, reply) => {
      const parse = AdminSetMemberRoleSchema.safeParse(request.body);
      if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
      const { role } = parse.data;
      const permissions = role === 'ADMIN' ? [] : normalizePermissions(parse.data.permissions ?? []);
      const { id: departmentId, userId } = request.params;

      const [department, user] = await Promise.all([
        fastify.prisma.department
          .findUnique({ where: { id: departmentId }, select: { id: true, name: true } })
          .catch(() => null),
        fastify.prisma.user
          .findUnique({
            where: { id: userId },
            select: { id: true, passwordHash: true, ceviDbId: true, firstName: true, lastName: true, ceviName: true },
          })
          .catch(() => null),
      ]);
      if (!department) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      if ((role === 'ADMIN' || permissions.length > 0) && isCeviNameProfile(user)) {
        return reply.status(400).send({ error: CEVINAME_ROLE_ERROR });
      }

      const before = await fastify.prisma.departmentMember.findUnique({
        where: { departmentId_userId: { departmentId, userId } },
        select: { role: true, permissions: true, leaderSource: true },
      });
      if (before?.role === 'ADMIN' && role !== 'ADMIN') {
        const others = await fastify.prisma.departmentMember.count({
          where: { departmentId, role: 'ADMIN', userId: { not: userId } },
        });
        if (others === 0) {
          return reply.status(400).send({ error: 'Das ist die letzte Abteilungsleitung. Zuerst eine andere einsetzen.' });
        }
      }
      // Von Hand gesetzte Abteilungsleitung entzieht der Cevi.DB-Login nicht (MANUAL)
      const leaderSource = role === 'ADMIN' ? (before?.role === 'ADMIN' ? before.leaderSource : 'MANUAL') : null;
      await fastify.prisma.departmentMember.upsert({
        where: { departmentId_userId: { departmentId, userId } },
        update: { role, permissions, leaderSource },
        create: { departmentId, userId, role, permissions, leaderSource },
      });

      await recordAdminAction(fastify.prisma, request, {
        action: 'MEMBER_ROLE_SET',
        targetType: 'USER',
        targetId: userId,
        targetLabel: personLabel(user),
        details: {
          departmentId,
          departmentName: department.name,
          role,
          permissions,
          before: before?.role ?? null,
          permissionsBefore: before?.permissions ?? [],
        },
      });
      const label = personLabel(user);
      if (role === 'ADMIN' && before?.role !== 'ADMIN') {
        await recordDepartmentAction(fastify.prisma, request.log, {
          departmentId,
          actorId: request.user.id,
          via: 'Admin-Portal',
          action: 'LEADER_GRANT',
          targetUserId: userId,
          targetLabel: label,
          details: { source: 'MANUAL' },
        });
      } else if (role !== 'ADMIN' && before?.role === 'ADMIN') {
        await recordDepartmentAction(fastify.prisma, request.log, {
          departmentId,
          actorId: request.user.id,
          via: 'Admin-Portal',
          action: 'LEADER_REVOKE',
          targetUserId: userId,
          targetLabel: label,
        });
      }
      const permissionsBefore = before?.role === 'ADMIN' ? [] : normalizePermissions(before?.permissions ?? []);
      if (role !== 'ADMIN' && permissions.join() !== permissionsBefore.join()) {
        await recordDepartmentAction(fastify.prisma, request.log, {
          departmentId,
          actorId: request.user.id,
          via: 'Admin-Portal',
          action: 'PERMISSIONS_SET',
          targetUserId: userId,
          targetLabel: label,
          details: { before: permissionsBefore, after: permissions },
        });
      }
      return { success: true };
    }
  );

  // Rolle entfernen (Heimabteilung bleibt, die kommt aus Cevi.DB oder von der Person selbst)
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/api/admin/departments/:id/members/:userId',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilungsrolle entziehen (Admin)',
        description: 'Entzieht einer Person die Rolle und alle Sonderrechte in einer Abteilung.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Abteilung'),
          userId: z.string().uuid().describe('ID der Person'),
        }),
      },
    },
    async (request, reply) => {
      const { id: departmentId, userId } = request.params;
      const membership = await fastify.prisma.departmentMember
        .findUnique({
          where: { departmentId_userId: { departmentId, userId } },
          select: {
            role: true,
            permissions: true,
            department: { select: { name: true } },
            user: { select: { firstName: true, lastName: true, ceviName: true } },
          },
        })
        .catch(() => null);
      if (!membership) return reply.status(404).send({ error: 'Diese Person hat hier keine Rolle.' });
      if (membership.role === 'ADMIN') {
        const others = await fastify.prisma.departmentMember.count({
          where: { departmentId, role: 'ADMIN', userId: { not: userId } },
        });
        if (others === 0) {
          return reply.status(400).send({ error: 'Das ist die letzte Abteilungsleitung. Zuerst eine andere einsetzen.' });
        }
      }
      await fastify.prisma.departmentMember.deleteMany({ where: { departmentId, userId } });
      await recordDepartmentAction(fastify.prisma, request.log, {
        departmentId,
        actorId: request.user.id,
        via: 'Admin-Portal',
        action: membership.role === 'ADMIN' ? 'LEADER_REVOKE' : 'PERMISSIONS_SET',
        targetUserId: userId,
        targetLabel: personLabel(membership.user),
        details: membership.role === 'ADMIN' ? { removed: true } : { before: membership.permissions, after: [], removed: true },
      });

      await recordAdminAction(fastify.prisma, request, {
        action: 'MEMBER_ROLE_REMOVE',
        targetType: 'USER',
        targetId: userId,
        targetLabel: personLabel(membership.user),
        details: { departmentId, departmentName: membership.department.name, before: membership.role },
      });
      return { success: true };
    }
  );

  // ---------------------------------------------------------------------------
  // Anlässe
  // ---------------------------------------------------------------------------

  fastify.get(
    '/api/admin/events',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Alle Anlässe plattformweit durchsuchen (Admin)',
        description: 'Paginierte Liste aller Anlässe mit Filter nach Zeitraum, Status oder Abteilung.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
    const parse = EventListQuerySchema.safeParse(request.query);
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
    const { q, departmentId, when, page, pageSize } = parse.data;
    const now = new Date();

    const terms = (q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
    const where: Prisma.EventWhereInput = {
      AND: [
        ...terms.map((term) => ({
          OR: [
            { title: { contains: term, mode: 'insensitive' as const } },
            { slug: { contains: term, mode: 'insensitive' as const } },
            { department: { name: { contains: term, mode: 'insensitive' as const } } },
          ],
        })),
        ...(departmentId ? [{ departmentId }] : []),
        ...(when === 'upcoming'
          ? [{ endDate: { gte: now } }]
          : when === 'past'
            ? [{ endDate: { lt: now } }]
            : when === 'drafts'
              ? [{ isPublished: false }]
              : when === 'signup_closed'
                ? [{ allowPublicSignup: false }]
                : when === 'urgent'
                  ? [{ endDate: { gte: now }, isPublished: true }]
                  : []),
      ],
    };

    const [total, rows] = await fastify.prisma.$transaction([
      fastify.prisma.event.count({ where }),
      fastify.prisma.event.findMany({
        where,
        orderBy: [{ startDate: when === 'upcoming' ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: eventSelect,
      }),
    ]);

    const result: AdminEventListDto = {
      items: await toEventItems(fastify.prisma, rows),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
    return result;
  });

  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/events/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Anlass-Status ändern (Admin)',
        description: 'Schaltet Veröffentlichung oder öffentliche Anmeldung eines Anlasses um.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID des Anlasses'),
        }),
        body: AdminUpdateEventSchema,
      },
    },
    async (request, reply) => {
    const parse = AdminUpdateEventSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });

    const updated = await fastify.prisma.event
      .update({
        where: { id: request.params.id },
        data: parse.data,
        select: { id: true, title: true, department: { select: { name: true } } },
      })
      .catch(() => null);
    if (!updated) return reply.status(404).send({ error: 'Anlass nicht gefunden' });

    await recordAdminAction(fastify.prisma, request, {
      action: 'EVENT_UPDATE',
      targetType: 'EVENT',
      targetId: updated.id,
      targetLabel: `${updated.title} (${updated.department.name})`,
      details: { changes: parse.data },
    });
    return { success: true };
  });

  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/events/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Anlass löschen (Admin)',
        description: 'Löscht einen Anlass samt Schichten und Eintragungen (Bestätigung des Slugs erforderlich).',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID des Anlasses'),
        }),
        body: ConfirmDeleteSchema,
      },
    },
    async (request, reply) => {
    const parse = ConfirmDeleteSchema.safeParse(request.body ?? {});
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });

    const event = await fastify.prisma.event
      .findUnique({
        where: { id: request.params.id },
        select: { id: true, slug: true, title: true, departmentId: true, department: { select: { name: true } } },
      })
      .catch(() => null);
    if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });
    if (parse.data.confirm !== event.slug) {
      return reply.status(400).send({ error: 'Zur Bestätigung das Kürzel des Anlasses genau eintippen.' });
    }

    // Kaskadiert zu Schichten, Eintragungen, OK, Fragen, Zugangs-Links, Protokoll und Nachrichten
    await fastify.prisma.event.delete({ where: { id: event.id } });

    await recordAdminAction(fastify.prisma, request, {
      action: 'EVENT_DELETE',
      targetType: 'EVENT',
      targetId: event.id,
      targetLabel: `${event.title} (${event.department.name})`,
      details: { slug: event.slug, departmentId: event.departmentId },
    });
    return { success: true };
  });

  // ---------------------------------------------------------------------------
  // Personen: globale Admin-Rolle, Heimabteilung & Konten zusammenführen
  // ---------------------------------------------------------------------------

  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Benutzerrolle oder Heimabteilung ändern (Admin)',
        description: 'Vergibt globale Admin-Rechte oder ändert die Heimabteilung einer Person.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Person'),
        }),
        body: AdminUpdateUserSchema,
      },
    },
    async (request, reply) => {
    const parse = AdminUpdateUserSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
    const { isGlobalAdmin, homeDepartmentId } = parse.data;

    const user = await fastify.prisma.user
      .findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          isGlobalAdmin: true,
          ceviDbId: true,
          firstName: true,
          lastName: true,
          ceviName: true,
          homeDepartmentId: true,
          homeDepartment: { select: { name: true } },
        },
      })
      .catch(() => null);
    if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });

    if (isGlobalAdmin !== undefined && isGlobalAdmin !== user.isGlobalAdmin) {
      // Admins melden sich mit Cevi.DB an (stärker als ein eigenes Passwort, siehe adminSecurity.ts)
      if (isGlobalAdmin && user.ceviDbId === null) {
        return reply.status(400).send({
          error: 'Globale Admins brauchen ein Konto mit Cevi.DB. Die Person soll sich zuerst einmal mit Cevi.DB anmelden.',
        });
      }
      if (!isGlobalAdmin) {
        if (user.id === request.user.id) {
          return reply.status(400).send({ error: 'Du kannst dir die Admin-Rolle nicht selbst entziehen.' });
        }
        const adminCount = await fastify.prisma.user.count({ where: { isGlobalAdmin: true } });
        if (adminCount <= 1) {
          return reply.status(400).send({ error: 'Der letzte globale Admin kann nicht entfernt werden.' });
        }
      }
      await fastify.prisma.user.update({ where: { id: user.id }, data: { isGlobalAdmin } });
      await recordAdminAction(fastify.prisma, request, {
        action: isGlobalAdmin ? 'USER_ADMIN_GRANT' : 'USER_ADMIN_REVOKE',
        targetType: 'USER',
        targetId: user.id,
        targetLabel: personLabel(user),
      });
      const actor = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { firstName: true, lastName: true, ceviName: true },
      });
      notifyAdminChange(fastify.prisma, request, {
        granted: isGlobalAdmin,
        targetUserId: user.id,
        targetLabel: personLabel(user),
        actorLabel: actor ? personLabel(actor) : request.user.email,
      });
    }

    if (homeDepartmentId !== undefined && homeDepartmentId !== user.homeDepartmentId) {
      let targetDept: { id: string; name: string } | null = null;
      if (homeDepartmentId !== null) {
        targetDept = await fastify.prisma.department
          .findUnique({ where: { id: homeDepartmentId }, select: { id: true, name: true } })
          .catch(() => null);
        if (!targetDept) {
          return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
        }
      }
      await fastify.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            homeDepartmentId,
            homeDepartmentSource: homeDepartmentId ? 'SELF' : null,
            ...NO_HOME_CONFIRMATION,
            departmentSetupAt: new Date(),
          },
        });
        if (homeDepartmentId) {
          await tx.departmentMember.upsert({
            where: { departmentId_userId: { departmentId: homeDepartmentId, userId: user.id } },
            update: {},
            create: { departmentId: homeDepartmentId, userId: user.id, role: 'HELPER' },
          });
        }
      });
      await recordAdminAction(fastify.prisma, request, {
        action: 'USER_HOME_DEPARTMENT_SET',
        targetType: 'USER',
        targetId: user.id,
        targetLabel: personLabel(user),
        details: {
          before: user.homeDepartment?.name ?? null,
          after: targetDept?.name ?? null,
        },
      });
    }

    return { success: true };
  });

  fastify.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/merge',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Benutzerkonten zusammenführen (Admin)',
        description: 'Überträgt alle Schichten, Anmeldungen und Rechte eines Quell-Kontos auf ein Ziel-Konto und löscht das Quell-Konto.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Quell-Person'),
        }),
        body: AdminMergeUserSchema,
      },
    },
    async (request, reply) => {
    const parse = AdminMergeUserSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
    const sourceId = request.params.id;
    const { targetUserId } = parse.data;

    if (sourceId === targetUserId) {
      return reply.status(400).send({ error: 'Quelle und Ziel dürfen nicht dasselbe Konto sein.' });
    }
    if (sourceId === request.user.id) {
      return reply.status(400).send({ error: 'Du kannst dein eigenes Admin-Konto nicht als Quelle zusammenführen.' });
    }

    const [source, target] = await Promise.all([
      fastify.prisma.user
        .findUnique({
          where: { id: sourceId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            ceviName: true,
            isGlobalAdmin: true,
            ceviDbId: true,
            passwordHash: true,
          },
        })
        .catch(() => null),
      fastify.prisma.user
        .findUnique({
          where: { id: targetUserId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            ceviName: true,
            isGlobalAdmin: true,
            ceviDbId: true,
            passwordHash: true,
          },
        })
        .catch(() => null),
    ]);

    if (!source) return reply.status(404).send({ error: 'Quell-Person nicht gefunden' });
    if (!target) return reply.status(404).send({ error: 'Ziel-Person nicht gefunden' });

    if (source.isGlobalAdmin) {
      return reply.status(400).send({
        error: 'Konten mit globalen Admin-Rechten können nicht als Quelle zusammengeführt werden.',
      });
    }

    if (isCeviNameProfile(target) && !isCeviNameProfile(source)) {
      return reply.status(400).send({
        error: 'Ein Konto mit Cevi.DB oder Passwort kann nicht in ein reines Cevi-Name-Profil überführt werden. Bitte umgekehrt zusammenführen.',
      });
    }

    await mergeUserInto(fastify.prisma, sourceId, targetUserId);

    const sourceLabel = personLabel(source);
    const targetLabel = personLabel(target);

    await recordAdminAction(fastify.prisma, request, {
      action: 'USER_MERGE',
      targetType: 'USER',
      targetId: targetUserId,
      targetLabel,
      details: {
        sourceId,
        sourceLabel,
        sourceEmail: source.email,
      },
    });

    return { success: true, targetUserId };
  });

  // ---------------------------------------------------------------------------
  // Protokoll
  // ---------------------------------------------------------------------------

  fastify.get(
    '/api/admin/audit',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Plattform-Audit-Log abrufen (Admin)',
        description: 'Vollständiges Protokoll aller durchgeführten Administrator-Aktionen.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
    const parse = AuditQuerySchema.safeParse(request.query);
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
    const { q, targetType, targetId, since, until, page, pageSize } = parse.data;
    const terms = (q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
    const where: Prisma.AdminAuditLogWhereInput = {
      AND: [
        ...(targetType ? [{ targetType }] : []),
        ...(targetId ? [{ targetId }] : []),
        ...(since ? [{ createdAt: { gte: new Date(since) } }] : []),
        ...(until ? [{ createdAt: { lte: new Date(until) } }] : []),
        ...terms.map((term) => ({
          OR: [
            { targetLabel: { contains: term, mode: 'insensitive' as const } },
            { adminName: { contains: term, mode: 'insensitive' as const } },
            { action: { contains: term, mode: 'insensitive' as const } },
          ],
        })),
      ],
    };
    const [total, rows] = await fastify.prisma.$transaction([
      fastify.prisma.adminAuditLog.count({ where }),
      fastify.prisma.adminAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const result: AdminAuditListDto = {
      items: rows.map((r) => ({
        id: r.id,
        adminId: r.adminId,
        adminName: r.adminName,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        targetLabel: r.targetLabel,
        details: (r.details as Record<string, unknown> | null) ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
    return result;
  });
};

export default adminManageRoutes;
