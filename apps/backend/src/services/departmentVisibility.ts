/**
 * Sichtbarkeit einer Abteilung mit «Startseite nur für Mitglieder» (departments.members_only).
 *
 * Mitglied ist, wer die Abteilung als Heimabteilung hat, dort Abteilungsleitung oder Planung ist,
 * im OK eines ihrer Anlässe sitzt oder globaler Admin ist. Die Helfer-Mitgliedschaft (department_members
 * HELPER) zählt bewusst nicht: Sie entsteht schon durch ein Login von der Subdomain aus.
 */
import type { PrismaClient } from '@prisma/client';

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
