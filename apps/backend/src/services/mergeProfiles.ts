import type { PrismaClient } from '../db.js';
import { PLACEHOLDER_LAST_NAME } from '@schichtplan/shared';
import { findCeviNameMatches, isCeviNameProfile } from './ceviNameLogin.js';

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
  target: { id: string; ceviName: string | null; birthDate: Date | null },
  departmentIds: string[]
): Promise<number> {
  if (!target.ceviName || !target.birthDate || departmentIds.length === 0) return 0;
  const birthDate = target.birthDate.toISOString().slice(0, 10);

  const sourceIds = new Set<string>();
  for (const departmentId of new Set(departmentIds)) {
    for (const match of await findCeviNameMatches(prisma, departmentId, target.ceviName, birthDate)) {
      if (match.id !== target.id && isCeviNameProfile(match)) sourceIds.add(match.id);
    }
  }

  for (const sourceId of sourceIds) {
    await prisma.$transaction((tx) => mergeOne(tx, sourceId, target.id));
  }
  return sourceIds.size;
}

async function mergeOne(tx: Tx, sourceId: string, targetId: string) {
  // Angaben, die im Cevi.DB-Konto fehlen, vom Cevi-Name-Profil übernehmen
  const [source, target] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: sourceId } }),
    tx.user.findUniqueOrThrow({ where: { id: targetId } }),
  ]);
  await tx.user.update({
    where: { id: targetId },
    data: {
      phone: target.phone || source.phone,
      address: target.address || source.address,
      lastName:
        (!target.lastName || target.lastName === PLACEHOLDER_LAST_NAME) && source.lastName !== PLACEHOLDER_LAST_NAME
          ? source.lastName
          : undefined,
      homeDepartmentId: target.homeDepartmentId ?? source.homeDepartmentId,
      homeDepartmentSource: target.homeDepartmentId ? undefined : source.homeDepartmentSource,
      departmentSetupAt: target.departmentSetupAt ?? source.departmentSetupAt,
    },
  });

  // Schicht-Eintragungen: doppelte (gleiche Schicht) bleiben beim Cevi.DB-Konto
  const targetShiftIds = new Set(
    (await tx.shiftSignup.findMany({ where: { userId: targetId }, select: { shiftId: true } })).map((s) => s.shiftId)
  );
  const sourceSignups = await tx.shiftSignup.findMany({ where: { userId: sourceId }, select: { id: true, shiftId: true } });
  const duplicateSignups = sourceSignups.filter((s) => targetShiftIds.has(s.shiftId)).map((s) => s.id);
  if (duplicateSignups.length) await tx.shiftSignup.deleteMany({ where: { id: { in: duplicateSignups } } });
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
    async () => (await tx.eventOrganizer.findMany({ where: { userId: targetId }, select: { eventId: true } })).map((r) => r.eventId),
    async () => (await tx.eventOrganizer.findMany({ where: { userId: sourceId }, select: { id: true, eventId: true } })).map((r) => ({ id: r.id, key: r.eventId })),
    (ids) => tx.eventOrganizer.updateMany({ where: { id: { in: ids } }, data: { userId: targetId } })
  );

  // Mitgliedschaften: nur als Helfer*in, bestehende Rollen des Ziels bleiben
  const targetDepartments = new Set(
    (await tx.departmentMember.findMany({ where: { userId: targetId }, select: { departmentId: true } })).map((m) => m.departmentId)
  );
  for (const m of await tx.departmentMember.findMany({ where: { userId: sourceId }, select: { departmentId: true } })) {
    if (!targetDepartments.has(m.departmentId)) {
      await tx.departmentMember.create({ data: { departmentId: m.departmentId, userId: targetId, role: 'HELPER' } });
    }
  }

  // Persönliche Zugangs-Links zeigen jetzt aufs Cevi.DB-Konto
  await tx.eventAccessLink.updateMany({ where: { boundUserId: sourceId }, data: { boundUserId: targetId } });

  // Rest (doppelte Antworten, Mitgliedschaften usw.) verschwindet mit dem Profil
  await tx.user.delete({ where: { id: sourceId } });
}
