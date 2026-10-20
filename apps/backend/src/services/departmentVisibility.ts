/**
 * Sichtbarkeit einer Abteilung mit «Startseite nur für Mitglieder» (departments.members_only).
 *
 * Mitglied ist, wer die Abteilung als Heimabteilung hat, dort Abteilungsleitung oder Planung ist,
 * im OK eines ihrer Anlässe sitzt oder globaler Admin ist. Die Helfer-Mitgliedschaft (department_members
 * HELPER) zählt bewusst nicht: Sie entsteht schon durch ein Login von der Subdomain aus.
 * Dazu Prüfungen, wer in einer Abteilung planen bzw. Bilder hochladen darf.
 */
import type { PrismaClient } from '../db.js';

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
