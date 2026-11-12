import type { PrismaClient } from '../db.js';
import { PLACEHOLDER_LAST_NAME } from '@schichtplan/shared';
import { findCeviNameMatches, isCeviNameProfile } from './nicknameLogin.js';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Nach einem Cevi.DB-Login: Cevi-Name-Profile derselben Person ins Cevi.DB-Konto übernehmen.
 * Gleich ist die Person, wenn Cevi-Name (ohne Gross/Klein), Geburtsdatum und Abteilung
 * (Heimabteilung oder Mitgliedschaft) übereinstimmen. Nur reine Cevi-Name-Profile werden übernommen.
 *
 * Was schon im Cevi.DB-Konto steht, gewinnt bei Konflikten (z. B. beide in derselben Schicht).
 * Rollen werden nicht übernommen: aus Mitgliedschaften wird höchstens Helfer*in.
 * Gibt die Anzahl übernommener Profile zurück.
 */
export async function mergeCeviNameProfilesInto(
  prisma: PrismaClient,
  target: { id: string; nickname?: string | null; ceviName?: string | null; birthDate: Date | null },
  departmentIds: string[]
): Promise<number> {
  const nickname = target.nickname ?? target.ceviName ?? null;
  if (!nickname || !target.birthDate || departmentIds.length === 0) return 0;
  const birthDate = target.birthDate.toISOString().slice(0, 10);

  const sourceIds = new Set<string>();
  for (const departmentId of new Set(departmentIds)) {
    for (const match of await findCeviNameMatches(prisma, departmentId, nickname, birthDate)) {
      if (match.id !== target.id && isCeviNameProfile(match)) sourceIds.add(match.id);
    }
  }

  for (const sourceId of sourceIds) {
    await mergeUserInto(prisma, sourceId, target.id);
  }
  return sourceIds.size;
}

/**
 * Führt das Quell-Konto (`sourceId`) vollständig in das Ziel-Konto (`targetId`) zusammen
 * und löscht danach das Quell-Konto. Bei Konflikten (z. B. gleiche Schicht) gewinnt das Ziel-Konto.
 */
export async function mergeUserInto(prisma: PrismaClient, sourceId: string, targetId: string): Promise<void> {
  await prisma.$transaction((tx) => mergeOne(tx, sourceId, targetId));
}

async function mergeOne(tx: Tx, sourceId: string, targetId: string) {
  // Angaben, die im Ziel-Konto fehlen, vom Quell-Profil übernehmen
  const [source, target] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: sourceId } }),
    tx.user.findUniqueOrThrow({ where: { id: targetId } }),
  ]);
  const targetIsGuest = isCeviNameProfile(target);
  // Kalender-Abonnement nicht verlieren: falls das Zielkonto noch keinen Token hat, den des Quellkontos übernehmen
  let transferredCalendarToken: string | undefined = undefined;
  if (!target.calendarToken && source.calendarToken) {
    transferredCalendarToken = source.calendarToken;
    await tx.user.update({ where: { id: sourceId }, data: { calendarToken: null } });
  }

  await tx.user.update({
    where: { id: targetId },
    data: {
      phone: target.phone || source.phone,
      nickname: target.nickname || source.nickname,
      birthDate: target.birthDate ?? source.birthDate,
      calendarToken: transferredCalendarToken,
      lastName:
        (!target.lastName || target.lastName === PLACEHOLDER_LAST_NAME) && source.lastName !== PLACEHOLDER_LAST_NAME
          ? source.lastName
          : undefined,
      homeDepartmentId: target.homeDepartmentId ?? source.homeDepartmentId,
      homeDepartmentSource: target.homeDepartmentId ? undefined : source.homeDepartmentSource,
      departmentSetupAt: target.departmentSetupAt ?? source.departmentSetupAt,
    },
  });

  // Schicht-Eintragungen: doppelte (gleiche Schicht) bleiben beim Ziel-Konto
  const targetShiftIds = new Set(
    (await tx.shiftSignup.findMany({ where: { userId: targetId }, select: { shiftId: true } })).map((s) => s.shiftId)
  );
  const sourceSignups = await tx.shiftSignup.findMany({ where: { userId: sourceId }, select: { id: true, shiftId: true } });
  const duplicateSignups = sourceSignups.filter((s) => targetShiftIds.has(s.shiftId)).map((s) => s.id);
  if (duplicateSignups.length) {
    await tx.cateringToken.updateMany({
      where: { shiftSignupId: { in: duplicateSignups }, status: 'REDEEMED' },
      data: { shiftSignupId: null },
    });
    await tx.shiftSignup.deleteMany({ where: { id: { in: duplicateSignups } } });
  }
  await tx.shiftSignup.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });

  // Tabellen mit Eindeutigkeit pro Person: nur übernehmen, was beim Ziel noch fehlt
  const moveUnique = async <K extends string>(
    findTargetKeys: () => Promise<K[]>,
    findSource: () => Promise<{ id: string; key: K }[]>,
    move: (ids: string[]) => Promise<unknown>
  ) => {
    const taken = new Set(await findTargetKeys());
    const ids = (await findSource()).filter((row) => !taken.has(row.key)).map((row) => row.id);
    if (ids.length) await move(ids);
  };

  await moveUnique(
    async () => (await tx.eventAnswer.findMany({ where: { userId: targetId }, select: { questionId: true } })).map((r) => r.questionId),
    async () => (await tx.eventAnswer.findMany({ where: { userId: sourceId }, select: { id: true, questionId: true } })).map((r) => ({ id: r.id, key: r.questionId })),
    (ids) => tx.eventAnswer.updateMany({ where: { id: { in: ids } }, data: { userId: targetId } })
  );
  await moveUnique(
    async () => (await tx.eventAccessGrant.findMany({ where: { userId: targetId }, select: { eventId: true } })).map((r) => r.eventId),
    async () => (await tx.eventAccessGrant.findMany({ where: { userId: sourceId }, select: { id: true, eventId: true } })).map((r) => ({ id: r.id, key: r.eventId })),
    (ids) => tx.eventAccessGrant.updateMany({ where: { id: { in: ids } }, data: { userId: targetId } })
  );
  await moveUnique(
    async () => (await tx.eventDeregistration.findMany({ where: { userId: targetId }, select: { eventId: true } })).map((r) => r.eventId),
    async () => (await tx.eventDeregistration.findMany({ where: { userId: sourceId }, select: { id: true, eventId: true } })).map((r) => ({ id: r.id, key: r.eventId })),
    (ids) => tx.eventDeregistration.updateMany({ where: { id: { in: ids } }, data: { userId: targetId } })
  );
  await moveUnique(
    async () => (await tx.userStufe.findMany({ where: { userId: targetId }, select: { stufeId: true } })).map((r) => r.stufeId),
    async () => (await tx.userStufe.findMany({ where: { userId: sourceId }, select: { id: true, stufeId: true } })).map((r) => ({ id: r.id, key: r.stufeId })),
    (ids) => tx.userStufe.updateMany({ where: { id: { in: ids } }, data: { userId: targetId } })
  );
  await moveUnique(
    async () => (await tx.userHitobitoStufe.findMany({ where: { userId: targetId }, select: { groupId: true } })).map((r) => String(r.groupId)),
    async () => (await tx.userHitobitoStufe.findMany({ where: { userId: sourceId }, select: { id: true, groupId: true } })).map((r) => ({ id: r.id, key: String(r.groupId) })),
    (ids) => tx.userHitobitoStufe.updateMany({ where: { id: { in: ids } }, data: { userId: targetId } })
  );
  await moveUnique(
    async () => (await tx.eventOrganizer.findMany({ where: { userId: targetId }, select: { eventId: true } })).map((r) => r.eventId),
    async () => (await tx.eventOrganizer.findMany({ where: { userId: sourceId }, select: { id: true, eventId: true } })).map((r) => ({ id: r.id, key: r.eventId })),
    (ids) => tx.eventOrganizer.updateMany({ where: { id: { in: ids } }, data: { userId: targetId } })
  );
  await moveUnique(
    async () => (await tx.shiftResponsible.findMany({ where: { userId: targetId }, select: { shiftId: true } })).map((r) => r.shiftId),
    async () => (await tx.shiftResponsible.findMany({ where: { userId: sourceId }, select: { id: true, shiftId: true } })).map((r) => ({ id: r.id, key: r.shiftId })),
    (ids) => tx.shiftResponsible.updateMany({ where: { id: { in: ids } }, data: { userId: targetId } })
  );
  await moveUnique(
    async () =>
      (await tx.eventDayResponsible.findMany({ where: { userId: targetId }, select: { eventId: true, dayDate: true } })).map(
        (r) => `${r.eventId}:${r.dayDate}`
      ),
    async () =>
      (await tx.eventDayResponsible.findMany({ where: { userId: sourceId }, select: { id: true, eventId: true, dayDate: true } })).map(
        (r) => ({ id: r.id, key: `${r.eventId}:${r.dayDate}` })
      ),
    (ids) => tx.eventDayResponsible.updateMany({ where: { id: { in: ids } }, data: { userId: targetId } })
  );

  // Mitgliedschaften übernehmen (bei Cevi-Name-Zielen höchstens als Helfer*in ohne Rechte)
  const targetMemberships = new Map(
    (
      await tx.departmentMember.findMany({
        where: { userId: targetId },
        select: { departmentId: true, role: true, permissions: true, leaderSource: true },
      })
    ).map((m) => [m.departmentId, m])
  );
  for (const m of await tx.departmentMember.findMany({
    where: { userId: sourceId },
    select: { departmentId: true, role: true, permissions: true, leaderSource: true },
  })) {
    const existing = targetMemberships.get(m.departmentId);
    if (!existing) {
      await tx.departmentMember.create({
        data: {
          departmentId: m.departmentId,
          userId: targetId,
          role: targetIsGuest ? 'HELPER' : m.role,
          permissions: targetIsGuest ? [] : m.permissions,
          leaderSource: targetIsGuest ? null : m.leaderSource,
        },
      });
    } else if (!targetIsGuest) {
      if (existing.role !== 'ADMIN' && m.role === 'ADMIN') {
        await tx.departmentMember.update({
          where: { departmentId_userId: { departmentId: m.departmentId, userId: targetId } },
          data: { role: 'ADMIN', permissions: [], leaderSource: m.leaderSource ?? 'MANUAL' },
        });
      } else if (existing.role !== 'ADMIN' && m.permissions.length > 0) {
        const mergedPermissions = Array.from(new Set([...existing.permissions, ...m.permissions]));
        await tx.departmentMember.update({
          where: { departmentId_userId: { departmentId: m.departmentId, userId: targetId } },
          data: { permissions: mergedPermissions },
        });
      }
    }
  }

  // Referenzen ohne Unique-Constraint umhängen
  await tx.eventAccessLink.updateMany({ where: { boundUserId: sourceId }, data: { boundUserId: targetId } });
  await tx.eventAccessLink.updateMany({ where: { createdById: sourceId }, data: { createdById: targetId } });
  await tx.eventDeregistration.updateMany({ where: { createdById: sourceId }, data: { createdById: targetId } });
  await tx.event.updateMany({ where: { contactUserId: sourceId }, data: { contactUserId: targetId } });
  await tx.department.updateMany({ where: { contactUserId: sourceId }, data: { contactUserId: targetId } });
  await tx.shiftSignupLog.updateMany({ where: { helperUserId: sourceId }, data: { helperUserId: targetId } });
  await tx.shiftSignupLog.updateMany({ where: { performedByUserId: sourceId }, data: { performedByUserId: targetId } });
  await tx.cateringToken.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });
  await tx.user.updateMany({ where: { homeDepartmentConfirmedById: sourceId }, data: { homeDepartmentConfirmedById: targetId } });
  await tx.eventMessage.updateMany({ where: { sentByUserId: sourceId }, data: { sentByUserId: targetId } });
  await tx.departmentAuditLog.updateMany({ where: { actorId: sourceId }, data: { actorId: targetId } });
  await tx.departmentAuditLog.updateMany({ where: { targetUserId: sourceId }, data: { targetUserId: targetId } });
  await tx.adminAuditLog.updateMany({ where: { adminId: sourceId }, data: { adminId: targetId } });
  await tx.adminAuditLog.updateMany({ where: { targetType: 'USER', targetId: sourceId }, data: { targetId: targetId } });

  // Push-Abonnements übernehmen: Doppelte Endpoints der Zielperson behalten
  const targetEndpoints = new Set(
    (await tx.pushSubscription.findMany({ where: { userId: targetId }, select: { endpoint: true } })).map((p) => p.endpoint)
  );
  const sourceSubs = await tx.pushSubscription.findMany({ where: { userId: sourceId }, select: { id: true, endpoint: true } });
  const dupSubs = sourceSubs.filter((s) => targetEndpoints.has(s.endpoint)).map((s) => s.id);
  if (dupSubs.length) await tx.pushSubscription.deleteMany({ where: { id: { in: dupSubs } } });
  await tx.pushSubscription.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });

  // Rest (doppelte Antworten, Mitgliedschaften usw.) verschwindet mit dem Profil
  await tx.user.delete({ where: { id: sourceId } });
}
