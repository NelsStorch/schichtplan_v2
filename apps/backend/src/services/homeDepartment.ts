/**
 * Heimabteilung und Stufen einer Person.
 * Cevi.DB-Personen: Abteilung aus der Ortsgruppe, Stufen aus den Rollen (Quelle CEVIDB, bei jedem Login neu).
 * Alle anderen geben beides beim Login selbst an (Quelle SELF).
 * Grundlage sind die beim Login gespeicherten Spalten (users.ceviDb*) und user_cevidb_stufen, nie users.ceviDbData.
 */
import type { PrismaClient } from '../db.js';
import type { CeviDbStufeDto, StufeRole, UserStufeDto } from '@schichtplan/shared';
import type { CeviDbDerived } from './cevidb.js';

type Db = Pick<
  PrismaClient,
  'department' | 'departmentStufe' | 'user' | 'userStufe' | 'userCeviDbStufe'
> & {
  $transaction?: any;
};

async function runInTransaction<T>(prisma: Db, fn: (tx: any) => Promise<T>): Promise<T> {
  if (typeof prisma.$transaction === 'function') {
    return prisma.$transaction(fn);
  }
  return fn(prisma);
}

/** Cevi.DB-Angaben nach dem Login speichern (Spalten und Stufen-Rollen ersetzen) */
export async function storeCeviDbFields(prisma: Db, userId: string, derived: CeviDbDerived) {
  await runInTransaction(prisma, async (tx) => {
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

/**
 * Stufen aus Cevi.DB für die Abteilung der Person automatisch in department_stufen anlegen,
 * falls sie noch nicht existieren oder noch nicht mit der Cevi.DB-Gruppe verknüpft sind.
 */
export async function autoCreateCeviDbDepartmentStufen(
  prisma: Db,
  departmentId: string,
  userId: string
) {
  const fromCeviDb = await prisma.userCeviDbStufe.findMany({ where: { userId } });
  if (!fromCeviDb.length) return;

  const existingStufen = await prisma.departmentStufe.findMany({
    where: { departmentId },
    select: { id: true, name: true, ceviDbGroupId: true, sortOrder: true },
  });

  let maxSortOrder = existingStufen.reduce((max, s) => Math.max(max, s.sortOrder), -1);
  const byCeviDbGroupId = new Map(
    existingStufen.filter((s) => s.ceviDbGroupId !== null).map((s) => [s.ceviDbGroupId!, s])
  );
  const byName = new Map(existingStufen.map((s) => [s.name.trim().toLowerCase(), s]));

  let createdOrLinkedAny = false;

  for (const stufe of fromCeviDb) {
    // 1. Bereits mit dieser Cevi.DB-Gruppe in dieser Abteilung verknüpft -> nichts nötig
    if (byCeviDbGroupId.has(stufe.groupId)) {
      continue;
    }

    // 2. Existiert bereits eine Stufe mit demselben Namen in dieser Abteilung, aber ohne Cevi.DB-Gruppen-ID?
    const matchByName = byName.get(stufe.groupName.trim().toLowerCase());
    if (matchByName && matchByName.ceviDbGroupId === null) {
      await prisma.departmentStufe.update({
        where: { id: matchByName.id },
        data: { ceviDbGroupId: stufe.groupId },
      });
      byCeviDbGroupId.set(stufe.groupId, { ...matchByName, ceviDbGroupId: stufe.groupId });
      createdOrLinkedAny = true;
      continue;
    }

    // 3. Name existiert bereits, aber mit einer anderen Cevi.DB-Gruppe -> Name disambiguieren
    let nameToUse = stufe.groupName.trim();
    if (byName.has(nameToUse.toLowerCase())) {
      nameToUse = `${nameToUse} (${stufe.groupId})`;
    }

    maxSortOrder++;
    try {
      const created = await prisma.departmentStufe.create({
        data: {
          departmentId,
          name: nameToUse,
          ceviDbGroupId: stufe.groupId,
          sortOrder: maxSortOrder,
        },
      });
      byCeviDbGroupId.set(stufe.groupId, created);
      byName.set(nameToUse.toLowerCase(), created);
      createdOrLinkedAny = true;
    } catch {
      // Parallel angelegt oder Unique Constraint: ignorieren
    }
  }

  // Falls neue Stufen angelegt oder verknüpft wurden: auch alle anderen bereits registrierten Cevi.DB-Personen
  // dieser Abteilung aktualisieren
  if (createdOrLinkedAny) {
    await backfillCeviDbStufen(prisma, departmentId);
  }
}

/** Stufen aus Cevi.DB abgleichen: nur Stufen, die eine Abteilung mit ihrer Cevi.DB-Gruppe verknüpft hat. */
export async function syncCeviDbStufen(prisma: Db, userId: string) {
  const fromCeviDb = await prisma.userCeviDbStufe.findMany({ where: { userId } });
  const groupIds = fromCeviDb.map((s) => s.groupId);
  const linked = groupIds.length
    ? await prisma.departmentStufe.findMany({ where: { ceviDbGroupId: { in: groupIds } } })
    : [];

  await runInTransaction(prisma, async (tx) => {
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
 * Abteilung gibt), Stufen automatisch in der Abteilung anlegen und Stufen abgleichen. Gibt die Heimabteilung zurück.
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
    // Stufen der Cevi.DB-Person automatisch in der Abteilung anlegen
    await autoCreateCeviDbDepartmentStufen(prisma, department.id, user.id);
  } else {
    // Falls der User bereits eine Heimabteilung hat: Stufen dort anlegen
    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { homeDepartmentId: true },
    });
    if (current?.homeDepartmentId) {
      await autoCreateCeviDbDepartmentStufen(prisma, current.homeDepartmentId, user.id);
    }
    if (user.homeDepartmentSource === 'CEVIDB') {
      // Ortsgruppe gewechselt oder Abteilung gelöscht: erneut nachfragen
      await prisma.user.update({
        where: { id: user.id },
        data: { homeDepartmentId: null, homeDepartmentSource: null, departmentSetupAt: null },
      });
    }
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
