
import { OrganizationType, Prisma, PrismaClient } from '../../db.js';
import { z } from 'zod';
import {
  type AdminDepartmentListItemDto,
  type AdminEventListItemDto,
} from '@schichtplan/shared';
import { autoCreateCeviDbDepartmentStufen, ceviDbGroupPeople, NO_HOME_CONFIRMATION } from '../../services/homeDepartment.js';
import { personLabel } from '../../services/profile.js';

// Gemeinsame Bausteine des Admin-Portals (routes/adminManage/*)

export const EventListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: z.string().uuid().optional(),
  when: z.enum(['upcoming', 'drafts', 'urgent', 'signup_closed', 'past', 'all']).default('upcoming'),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const AuditQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  targetType: z.enum(['USER', 'DEPARTMENT', 'EVENT']).optional(),
  targetId: z.string().max(100).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Welches Feld eine Unique-Verletzung ausgelöst hat (slug oder ceviDbGroupId/hitobitoGroupId) */
export function uniqueConflictMessage(err: Prisma.PrismaClientKnownRequestError) {
  const target = JSON.stringify(err.meta ?? {});
  if (target.includes('slug')) return 'Diese Subdomain ist bereits vergeben.';
  if (/cevi_?db_?group|hitobito/i.test(target)) return 'Diese Verbands-Gruppe gehört bereits zu einer anderen Abteilung.';
  return 'Ein Wert ist bereits vergeben.';
}

export const eventSelect = {
  id: true,
  title: true,
  slug: true,
  startDate: true,
  endDate: true,
  isPublished: true,
  allowPublicSignup: true,
  accessType: true,
  createdAt: true,
  department: { select: { id: true, name: true, slug: true, organization: true } },
  _count: { select: { organizers: true } },
} satisfies Prisma.EventSelect;

export type EventRow = Prisma.EventGetPayload<{ select: typeof eventSelect }>;

/** Schichten, Plätze und Eintragungen pro Anlass (ohne alle Schichten zu laden) */
export async function toEventItems(prisma: PrismaClient, rows: EventRow[]): Promise<AdminEventListItemDto[]> {
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
    departmentOrganization: e.department.organization,
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

export const departmentSelect = {
  id: true,
  name: true,
  slug: true,
  organization: true,
  logoUrl: true,
  primaryColor: true,
  secondaryColor: true,
  qrStyle: true,
  qrCustomColors: true,
  qrColorPrimary: true,
  qrColorSecondary: true,
  contactUserId: true,
  contactUser: { select: { firstName: true, lastName: true, nickname: true } },
  hitobitoGroupId: true,
  membersOnly: true,
  createdAt: true,
  _count: { select: { members: true, homeUsers: true, events: true } },
  members: {
    where: { role: 'ADMIN' },
    select: { user: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
  },
} satisfies Prisma.DepartmentSelect;

export type DepartmentRow = Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>;

export async function toDepartmentItems(prisma: PrismaClient, rows: DepartmentRow[]): Promise<AdminDepartmentListItemDto[]> {
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
    organization: d.organization,
    logoUrl: d.logoUrl,
    primaryColor: d.primaryColor,
    secondaryColor: d.secondaryColor,
    qrStyle: d.qrStyle as 'CORNERS' | 'GRADIENT' | 'SOLID' | null,
    qrCustomColors: d.qrCustomColors,
    qrColorPrimary: d.qrColorPrimary,
    qrColorSecondary: d.qrColorSecondary,
    contactUserId: d.contactUserId,
    contactName: d.contactUser ? personLabel(d.contactUser) : null,
    hitobitoGroupId: d.hitobitoGroupId,
    ceviDbGroupId: d.hitobitoGroupId,
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
export async function attachCeviDbGroup(
  prisma: PrismaClient,
  departmentId: string,
  groupId: number,
  provider: OrganizationType = 'CEVI'
) {
  const people = await ceviDbGroupPeople(prisma, groupId, provider);
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
