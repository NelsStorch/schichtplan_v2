/**
 * Sichtbarkeit einer Abteilung mit «Startseite nur für Mitglieder» (departments.members_only).
 *
 * Mitglied ist, wer die Abteilung als Heimabteilung hat, dort Abteilungsleitung ist oder Rechte hat,
 * im OK eines ihrer Anlässe sitzt oder globaler Admin ist. Die Mitgliedschaft ohne Rechte (department_members
 * HELPER, «Gast») zählt bewusst nicht: Sie entsteht schon durch ein Login von der Subdomain aus.
 * Dazu Prüfungen, wer in einer Abteilung planen bzw. Bilder hochladen darf.
 */
import type { PrismaClient } from '../db.js';
import type { DepartmentPermission } from '@schichtplan/shared';
import { accessFrom } from './permissions.js';

type Db = Pick<PrismaClient, 'user' | 'departmentMember' | 'eventOrganizer'>;

async function loadMembership(prisma: Db, departmentId: string, userId: string) {
  const [user, member, organizer] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { homeDepartmentId: true, isGlobalAdmin: true } }),
    prisma.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
      select: { role: true, permissions: true },
    }),
    prisma.eventOrganizer.findFirst({ where: { userId, event: { departmentId } }, select: { id: true } }),
  ]);
  if (!user) return null;
  return { user, access: accessFrom(member, user.isGlobalAdmin), isOrganizer: Boolean(organizer) };
}

export async function isDepartmentInsider(prisma: Db, departmentId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const m = await loadMembership(prisma, departmentId, userId);
  if (!m) return false;
  return m.user.homeDepartmentId === departmentId || m.access.permissions.size > 0 || m.isOrganizer;
}

/**
 * Darf die Person die Personen der Abteilung mit E-Mails sehen und Vorlagen lesen (Auswahl von OK,
 * Verantwortlichen, Kontaktperson)? Abteilungsleitung, «Personen sehen», «Alle Anlässe sehen»
 * (jedes Anlass-Recht setzt es voraus), OK eines ihrer Anlässe oder globaler Admin.
 */
export async function isDepartmentManager(prisma: Db, departmentId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const m = await loadMembership(prisma, departmentId, userId);
  if (!m) return false;
  return m.access.permissions.has('PEOPLE_VIEW') || m.access.permissions.has('EVENTS_VIEW_ALL') || m.isOrganizer;
}

/** Darf die Person die Arbeiten der Abteilung pflegen? Abteilungsleitung, «Schichten planen» oder OK eines Anlasses. */
export async function canPlanInDepartment(prisma: Db, departmentId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const m = await loadMembership(prisma, departmentId, userId);
  if (!m) return false;
  return m.access.permissions.has('SHIFTS_MANAGE') || m.isOrganizer;
}

export const UNRELATED_PERSON_ERROR = 'Diese Person gehört nicht zu dieser Abteilung oder zu diesem Anlass.';

/**
 * Gehören alle Personen zur Abteilung (Heimabteilung, Mitgliedschaft, Stufe) oder zum Anlass (eingetragen,
 * im OK, Zugangs-Link)? Gleicher Kreis wie der Helfer-Pool (`roster`). Sonst könnte ein OK beliebige
 * User-IDs als Verantwortliche oder Helfende eintragen und danach deren Kontaktdaten sehen.
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
        ...departmentPeopleWhere(departmentIds),
        ...(eventId ? eventPeopleWhere(eventId) : []),
      ],
    },
  });
  return count === ids.length;
}

/** Personen einer Abteilung: Heimabteilung, Mitgliedschaft oder Stufe */
export const departmentPeopleWhere = (departmentIds: string[]) => [
  { homeDepartmentId: { in: departmentIds } },
  { memberships: { some: { departmentId: { in: departmentIds } } } },
  { stufen: { some: { stufe: { departmentId: { in: departmentIds } } } } },
];

/** Personen mit eigenem Bezug zum Anlass: im OK, Zugangs-Link eingelöst oder eingetragen */
export const eventPeopleWhere = (eventId: string) => [
  { organizedEvents: { some: { eventId } } },
  { eventAccessGrants: { some: { eventId } } },
  { signups: { some: { shift: { eventId } } } },
];

/**
 * Personen, die ein Anlass einbeziehen darf: die der eigenen Abteilung und alle mit eigenem Bezug zum
 * Anlass. Freigegebene Abteilungen (Whitelist) zählen bewusst NICHT pauschal: Die Freigabe setzt die
 * Gastgeber-Abteilung allein, ohne Zustimmung der anderen. Sonst sähe ein OK über Helfer-Pool,
 * Nachrichten und Einteilen deren ganze Personenliste. Wer aus einer freigegebenen Abteilung kommt,
 * erscheint, sobald er sich einträgt oder einen Zugangs-Link einlöst.
 */
export const eventRelatedPeopleWhere = (event: { id: string; departmentId: string }) => [
  ...departmentPeopleWhere([event.departmentId]),
  ...eventPeopleWhere(event.id),
];

/** Kurzform: gehören die Personen zu diesem Anlass (inkl. eigene Abteilung)? */
export async function allUsersRelatedToEvent(
  prisma: Pick<PrismaClient, 'user' | 'event'>,
  eventId: string,
  userIds: (string | null | undefined)[]
): Promise<boolean> {
  if (userIds.every((id) => !id)) return true;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { departmentId: true } });
  if (!event) return false;
  return allUsersRelatedTo(prisma, { departmentIds: [event.departmentId], eventId }, userIds);
}

/** Rechte, mit denen man Bilder (Logos, Banner) braucht */
const UPLOAD_PERMISSIONS: DepartmentPermission[] = [
  'DEPARTMENT_SETTINGS',
  'EVENTS_CREATE',
  'EVENTS_EDIT_SETTINGS',
  'SHIFTS_MANAGE',
  'TEMPLATES_MANAGE',
];

/** Darf die Person Bilder hochladen? Wer irgendwo Abteilung oder Anlässe gestaltet (Abteilungsleitung, Rechte, OK) oder globaler Admin ist. */
export async function canUploadImages(prisma: Db, userId: string): Promise<boolean> {
  const [user, member, organizer] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isGlobalAdmin: true } }),
    prisma.departmentMember.findFirst({
      where: { userId, OR: [{ role: 'ADMIN' }, { permissions: { hasSome: UPLOAD_PERMISSIONS } }] },
      select: { id: true },
    }),
    prisma.eventOrganizer.findFirst({ where: { userId }, select: { id: true } }),
  ]);
  return Boolean(user?.isGlobalAdmin || member || organizer);
}
