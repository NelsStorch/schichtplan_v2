/**
 * Heimabteilung und Stufen einer Person.
 * Cevi.DB-Personen: Abteilung aus der Ortsgruppe, Stufen aus den Rollen (Quelle CEVIDB, bei jedem Login neu).
 * Alle anderen geben beides beim Login selbst an (Quelle SELF).
 */
import type { PrismaClient } from '@prisma/client';
import type { UserStufeDto, StufeRole } from '@schichtplan/shared';
import { ceviDbStufen, ortsgruppeIdFromProfile } from './cevidb.js';

type Db = Pick<PrismaClient, 'department' | 'departmentStufe' | 'user' | 'userStufe' | '$transaction'>;

/** Stufen aus den Cevi.DB-Rollen abgleichen: nur Stufen, die eine Abteilung mit ihrer Cevi.DB-Gruppe verknüpft hat. */
export async function syncCeviDbStufen(prisma: Db, userId: string, profile: unknown) {
  const fromProfile = ceviDbStufen(profile);
  const groupIds = fromProfile.map((s) => s.groupId);
  const linked = groupIds.length
    ? await prisma.departmentStufe.findMany({ where: { ceviDbGroupId: { in: groupIds } } })
    : [];

  await prisma.$transaction(async (tx) => {
    await tx.userStufe.deleteMany({
      where: { userId, source: 'CEVIDB', stufeId: { notIn: linked.map((s) => s.id) } },
    });
    for (const stufe of linked) {
      const kind = fromProfile.find((s) => s.groupId === stufe.ceviDbGroupId)?.kind;
      const role: StufeRole = kind === 'LEITUNG' ? 'LEITUNG' : 'TEILNEHMER';
      await tx.userStufe.upsert({
        where: { userId_stufeId: { userId, stufeId: stufe.id } },
        update: { role, source: 'CEVIDB' },
        create: { userId, stufeId: stufe.id, role, source: 'CEVIDB' },
      });
    }
  });
}

/**
 * Nach dem Cevi.DB-Login: Heimabteilung aus der Ortsgruppe setzen (falls es dafür eine Abteilung gibt)
 * und Stufen abgleichen. Gibt die ID der Heimabteilung zurück.
 */
export async function syncCeviDbHomeDepartment(
  prisma: Db,
  user: { id: string; homeDepartmentSource: string | null; departmentSetupAt: Date | null },
  profile: unknown
): Promise<string | null> {
  const ortsgruppeId = ortsgruppeIdFromProfile(profile);
  const department =
    ortsgruppeId !== null
      ? await prisma.department.findUnique({ where: { ceviDbGroupId: ortsgruppeId }, select: { id: true } })
      : null;

  if (department) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        homeDepartmentId: department.id,
        homeDepartmentSource: 'CEVIDB',
        departmentSetupAt: user.departmentSetupAt ?? new Date(),
      },
    });
  } else if (user.homeDepartmentSource === 'CEVIDB') {
    // Ortsgruppe gewechselt oder Abteilung gelöscht: erneut nachfragen
    await prisma.user.update({
      where: { id: user.id },
      data: { homeDepartmentId: null, homeDepartmentSource: null, departmentSetupAt: null },
    });
  }

  await syncCeviDbStufen(prisma, user.id, profile);
  return department?.id ?? null;
}

/** Neu mit Cevi.DB verknüpfte Stufe: bereits angemeldete Cevi.DB-Personen der Abteilung gleich zuordnen. */
export async function backfillCeviDbStufen(prisma: Db, departmentId: string) {
  const users = await prisma.user.findMany({
    where: { homeDepartmentId: departmentId, ceviDbId: { not: null } },
    select: { id: true, ceviDbData: true },
  });
  for (const user of users) {
    await syncCeviDbStufen(prisma, user.id, user.ceviDbData);
  }
}

export function toUserStufeDto(entry: {
  stufeId: string;
  role: string;
  source: string;
  stufe: { name: string; departmentId: string };
}): UserStufeDto {
  return {
    stufeId: entry.stufeId,
    name: entry.stufe.name,
    departmentId: entry.stufe.departmentId,
    role: entry.role === 'LEITUNG' ? 'LEITUNG' : 'TEILNEHMER',
    source: entry.source === 'CEVIDB' ? 'CEVIDB' : 'SELF',
  };
}
