/**
 * Abteilungsleitung aus Cevi.DB: Wer in Cevi.DB eine Leitungsrolle (CEVIDB_DEPARTMENT_LEADER_ROLES) hat, wird
 * beim Login Abteilungsleitung der eigenen Heimabteilung (leaderSource CEVIDB). Fällt die Rolle weg oder wechselt
 * die Ortsgruppe, wird sie wieder entzogen, aber nur, solange die Abteilung noch eine andere Abteilungsleitung hat.
 * Von Hand im Admin-Portal gesetzte Abteilungsleitungen (MANUAL) fasst der Login nicht an.
 */
import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from '../db.js';
import { personLabel } from './profile.js';
import { recordDepartmentAction } from './departmentAudit.js';

type Db = Pick<PrismaClient, 'user' | 'departmentMember' | 'departmentAuditLog'>;

export async function syncCeviDbLeadership(
  prisma: Db,
  log: FastifyBaseLogger,
  userId: string,
  homeDepartmentId: string | null,
  isLeader: boolean
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, ceviName: true },
  });
  if (!user) return;
  const label = personLabel(user);

  if (homeDepartmentId) {
    const existing = await prisma.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId: homeDepartmentId, userId } },
      select: { role: true },
    });
    if (isLeader && existing?.role !== 'ADMIN') {
      await prisma.departmentMember.upsert({
        where: { departmentId_userId: { departmentId: homeDepartmentId, userId } },
        update: { role: 'ADMIN', leaderSource: 'CEVIDB' },
        create: { departmentId: homeDepartmentId, userId, role: 'ADMIN', leaderSource: 'CEVIDB' },
      });
      await recordDepartmentAction(prisma, log, {
        departmentId: homeDepartmentId,
        actorId: null,
        action: 'LEADER_GRANT',
        targetUserId: userId,
        targetLabel: label,
        details: { source: 'CEVIDB' },
      });
    } else if (!existing) {
      await prisma.departmentMember.create({ data: { departmentId: homeDepartmentId, userId, role: 'HELPER' } });
    }
  }

  // Abteilungsleitungen aus Cevi.DB, die nicht mehr stimmen
  const stale = await prisma.departmentMember.findMany({
    where: {
      userId,
      role: 'ADMIN',
      leaderSource: 'CEVIDB',
      ...(isLeader && homeDepartmentId ? { departmentId: { not: homeDepartmentId } } : {}),
    },
    select: { id: true, departmentId: true },
  });
  for (const membership of stale) {
    const others = await prisma.departmentMember.count({
      where: { departmentId: membership.departmentId, role: 'ADMIN', userId: { not: userId } },
    });
    if (others === 0) {
      log.warn(
        { userId, departmentId: membership.departmentId },
        'Cevi.DB: Abteilungsleitung bleibt, weil es die letzte der Abteilung ist'
      );
      continue;
    }
    await prisma.departmentMember.update({
      where: { id: membership.id },
      data: { role: 'HELPER', leaderSource: null },
    });
    await recordDepartmentAction(prisma, log, {
      departmentId: membership.departmentId,
      actorId: null,
      action: 'LEADER_REVOKE',
      targetUserId: userId,
      targetLabel: label,
      details: { source: 'CEVIDB', reason: isLeader ? 'OTHER_DEPARTMENT' : 'NO_LEADER_ROLE' },
    });
  }
}
