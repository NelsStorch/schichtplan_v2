/**
 * Heimabteilung und Stufen einer Person.
 * Cevi.DB-Personen: Abteilung aus der Ortsgruppe, Stufen aus den Rollen (Quelle CEVIDB, bei jedem Login neu).
 * Alle anderen geben beides beim Login selbst an (Quelle SELF).
 * Grundlage sind die beim Login gespeicherten Spalten (users.ceviDb*) und user_cevidb_stufen, nie users.ceviDbData.
 */
import type { PrismaClient } from '@prisma/client';
import type { CeviDbStufeDto, StufeRole, UserStufeDto } from '@schichtplan/shared';
import type { CeviDbDerived } from './cevidb.js';

type Db = Pick<
  PrismaClient,
  'department' | 'departmentStufe' | 'user' | 'userStufe' | 'userCeviDbStufe' | '$transaction'
>;

/** Cevi.DB-Angaben nach dem Login speichern (Spalten und Stufen-Rollen ersetzen) */
export async function storeCeviDbFields(prisma: Db, userId: string, derived: CeviDbDerived) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        ceviDbOrtsgruppeId: derived.ortsgruppeId,
        ceviDbOrtsgruppeName: derived.ortsgruppeName,
        ceviDbDepartmentLeader: derived.isDepartmentLeader,
        ceviDbLeaderGroupName: derived.leaderGroupName,
      },
    });
    await tx.userCeviDbStufe.deleteMany({ where: { userId } });
    if (derived.stufen.length) {
      await tx.userCeviDbStufe.createMany({
        data: derived.stufen.map((s) => ({
          userId,
          groupId: s.groupId,
          groupName: s.groupName,
          kind: s.kind,
          roleNames: s.roleNames,
          isPrimary: s.isPrimary,
        })),
        skipDuplicates: true,
      });
    }
  });
}

/** Stufen aus Cevi.DB abgleichen: nur Stufen, die eine Abteilung mit ihrer Cevi.DB-Gruppe verknüpft hat. */
export async function syncCeviDbStufen(prisma: Db, userId: string) {
  const fromCeviDb = await prisma.userCeviDbStufe.findMany({ where: { userId } });
  const groupIds = fromCeviDb.map((s) => s.groupId);
  const linked = groupIds.length
    ? await prisma.departmentStufe.findMany({ where: { ceviDbGroupId: { in: groupIds } } })
    : [];

  await prisma.$transaction(async (tx) => {
    await tx.userStufe.deleteMany({
      where: { userId, source: 'CEVIDB', stufeId: { notIn: linked.map((s) => s.id) } },
    });
    for (const stufe of linked) {
      const kind = fromCeviDb.find((s) => s.groupId === stufe.ceviDbGroupId)?.kind;
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
 * Nach dem Cevi.DB-Login: Heimabteilung aus der gespeicherten Ortsgruppe setzen (falls es dafür eine
 * Abteilung gibt) und Stufen abgleichen. Gibt die Heimabteilung zurück.
 */
export async function syncCeviDbHomeDepartment(
  prisma: Db,
  user: { id: string; homeDepartmentSource: string | null; departmentSetupAt: Date | null },
  ortsgruppeId: number | null
): Promise<{ id: string; slug: string } | null> {
  const department =
    ortsgruppeId !== null
      ? await prisma.department.findUnique({ where: { ceviDbGroupId: ortsgruppeId }, select: { id: true, slug: true } })
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

  await syncCeviDbStufen(prisma, user.id);
  return department;
}

/** Neu mit Cevi.DB verknüpfte Stufe: bereits angemeldete Cevi.DB-Personen der Abteilung gleich zuordnen. */
export async function backfillCeviDbStufen(prisma: Db, departmentId: string) {
  const users = await prisma.user.findMany({
    where: { homeDepartmentId: departmentId, ceviDbId: { not: null } },
    select: { id: true },
  });
  for (const user of users) {
    await syncCeviDbStufen(prisma, user.id);
  }
}

export function toCeviDbStufeDto(s: {
  groupId: number;
  groupName: string;
  kind: string;
  roleNames: string[];
  isPrimary: boolean;
}): CeviDbStufeDto {
  return {
    groupId: s.groupId,
    groupName: s.groupName,
    kind: s.kind === 'LEITUNG' || s.kind === 'TEILNEHMER' ? s.kind : 'ANDERE',
    roleNames: s.roleNames,
    isPrimary: s.isPrimary,
  };
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
