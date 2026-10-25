/**
 * Sichtbarkeit einer Abteilung mit «Startseite nur für Mitglieder» (departments.members_only).
 *
 * Mitglied ist, wer die Abteilung als Heimabteilung hat, dort Abteilungsleitung oder Planung ist,
 * im OK eines ihrer Anlässe sitzt oder globaler Admin ist. Die Helfer-Mitgliedschaft (department_members
 * HELPER) zählt bewusst nicht: Sie entsteht schon durch ein Login von der Subdomain aus.
 * Dazu Prüfungen, wer in einer Abteilung planen bzw. Bilder hochladen darf.
 */
import type { PrismaClient } from '../db.js';
import { accessTypeConfig } from '@schichtplan/shared';

export async function isDepartmentInsider(
  prisma: Pick<PrismaClient, 'user' | 'departmentMember' | 'eventOrganizer'>,
  departmentId: string,
  userId: string | null | undefined
): Promise<boolean> {
  if (!userId) return false;
  const [user, member, organizer] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { homeDepartmentId: true, isGlobalAdmin: true } }),
    prisma.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
      select: { role: true },
    }),
    prisma.eventOrganizer.findFirst({ where: { userId, event: { departmentId } }, select: { id: true } }),
  ]);
  if (!user) return false;
  return (
    user.isGlobalAdmin ||
    user.homeDepartmentId === departmentId ||
    member?.role === 'ADMIN' ||
    member?.role === 'PLANNER' ||
    Boolean(organizer)
  );
}

/**
 * Darf die Person in dieser Abteilung planen (Mitgliederliste mit E-Mails, Vorlagen)?
 * Abteilungsleitung, Planung, OK eines ihrer Anlässe oder globaler Admin (laut DB).
 */
export async function isDepartmentManager(
  prisma: Pick<PrismaClient, 'user' | 'departmentMember' | 'eventOrganizer'>,
  departmentId: string,
  userId: string | null | undefined
): Promise<boolean> {
  if (!userId) return false;
  const [user, member, organizer] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isGlobalAdmin: true } }),
    prisma.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
      select: { role: true },
    }),
    prisma.eventOrganizer.findFirst({ where: { userId, event: { departmentId } }, select: { id: true } }),
  ]);
  if (!user) return false;
  return (
    user.isGlobalAdmin ||
    member?.role === 'ADMIN' ||
    member?.role === 'PLANNER' ||
    Boolean(organizer)
  );
}

export const UNRELATED_PERSON_ERROR = 'Diese Person gehört nicht zu dieser Abteilung oder zu diesem Anlass.';

/**
 * Gehören alle Personen zur Abteilung (Heimabteilung, Mitgliedschaft, Stufe) oder zum Anlass (eingetragen,
 * im OK, Zugangs-Link)? Gleicher Kreis wie der Helfer-Pool (`roster`), bei Whitelist-Anlässen inkl. der
 * freigegebenen Abteilungen. Sonst könnte ein OK beliebige User-IDs als Verantwortliche oder Helfende
 * eintragen und danach deren Kontaktdaten sehen.
 */
export async function allUsersRelatedTo(
  prisma: Pick<PrismaClient, 'user'>,
  scope: { departmentIds: string[]; eventId?: string | null },
  userIds: (string | null | undefined)[]
): Promise<boolean> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return true;
  const { departmentIds, eventId } = scope;
  const count = await prisma.user.count({
    where: {
      id: { in: ids },
      OR: [
        { homeDepartmentId: { in: departmentIds } },
        { memberships: { some: { departmentId: { in: departmentIds } } } },
        { stufen: { some: { stufe: { departmentId: { in: departmentIds } } } } },
        ...(eventId
          ? [
              { organizedEvents: { some: { eventId } } },
              { eventAccessGrants: { some: { eventId } } },
              { signups: { some: { shift: { eventId } } } },
            ]
          : []),
      ],
    },
  });
  return count === ids.length;
}

/** Abteilungen, deren Personen ein Anlass einbeziehen darf: die eigene, bei Whitelist-Typen die freigegebenen */
export async function eventDepartmentIds(
  prisma: Pick<PrismaClient, 'event'>,
  eventId: string
): Promise<string[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { departmentId: true, accessType: true, allowedDepartments: { select: { departmentId: true } } },
  });
  if (!event) return [];
  return [
    event.departmentId,
    ...(accessTypeConfig(event.accessType).whitelist ? event.allowedDepartments.map((a) => a.departmentId) : []),
  ];
}

/** Kurzform: gehören die Personen zu diesem Anlass (inkl. Abteilung)? */
export async function allUsersRelatedToEvent(
  prisma: Pick<PrismaClient, 'user' | 'event'>,
  eventId: string,
  userIds: (string | null | undefined)[]
): Promise<boolean> {
  if (userIds.every((id) => !id)) return true;
  return allUsersRelatedTo(prisma, { departmentIds: await eventDepartmentIds(prisma, eventId), eventId }, userIds);
}

/** Darf die Person Bilder hochladen? Wer irgendwo plant (Abteilungsleitung, Planung, OK) oder globaler Admin ist. */
export async function canUploadImages(
  prisma: Pick<PrismaClient, 'user' | 'departmentMember' | 'eventOrganizer'>,
  userId: string
): Promise<boolean> {
  const [user, member, organizer] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isGlobalAdmin: true } }),
    prisma.departmentMember.findFirst({ where: { userId, role: { in: ['ADMIN', 'PLANNER'] } }, select: { id: true } }),
    prisma.eventOrganizer.findFirst({ where: { userId }, select: { id: true } }),
  ]);
  return Boolean(user?.isGlobalAdmin || member || organizer);
}
