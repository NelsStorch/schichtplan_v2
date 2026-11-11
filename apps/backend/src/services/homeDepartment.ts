/**
 * Heimabteilung und Stufen einer Person.
 * Cevi.DB-Personen: Abteilung und Stufen aus den Rollen und der Gruppenstruktur (Quelle CEVIDB, bei jedem Login neu).
 * Alle anderen geben beides beim Login selbst an (Quelle SELF).
 * Grundlage sind die beim Login gespeicherten Spalten (users.ceviDb*) und user_cevidb_stufen.
 */
import type { OrganizationType, PrismaClient } from '../db.js';
import type { CeviDbStufeDto, StufeRole, UserStufeDto } from '@schichtplan/shared';
import { placeCeviDbPerson, type CeviDbDerived, type CeviDbPlacement } from './cevidb.js';

type Db = Pick<
  PrismaClient,
  'department' | 'departmentStufe' | 'user' | 'userStufe' | 'userHitobitoStufe' | 'hitobitoGroup'
> & {
  $transaction?: any;
};

async function runInTransaction<T>(prisma: Db, fn: (tx: any) => Promise<T>): Promise<T> {
  if (typeof prisma.$transaction === 'function') {
    return prisma.$transaction(fn);
  }
  return fn(prisma);
}

/** Rollen der Person mit der gespeicherten Gruppenstruktur und den Abteilungen abgleichen */
export async function resolveCeviDbPlacement(
  prisma: Db,
  derived: CeviDbDerived,
  currentHomeDepartmentId: string | null,
  provider: OrganizationType = 'CEVI'
): Promise<CeviDbPlacement> {
  const roleGroups = await prisma.hitobitoGroup.findMany({ where: { provider, id: { in: derived.roleGroupIds } } });
  const ortsgruppeIds = roleGroups.map((g) => g.ortsgruppeId).filter((id): id is number => id !== null);
  const ortsgruppen = await prisma.hitobitoGroup.findMany({ where: { provider, id: { in: ortsgruppeIds } } });
  const groups = new Map([...roleGroups, ...ortsgruppen].map((g) => [g.id, g]));

  const departmentGroupIds = [
    ...derived.roleGroupIds,
    ...derived.leaderGroupIds,
    ...roleGroups.map((g) => g.jungscharId),
    ...ortsgruppeIds,
    derived.ortsgruppeId,
  ].filter((id): id is number => id !== null);
  const departments = await prisma.department.findMany({
    where: { organization: provider, hitobitoGroupId: { in: departmentGroupIds } },
    select: { id: true, hitobitoGroupId: true },
  });
  const departmentByGroup = new Map(departments.map((d) => [d.hitobitoGroupId!, d.id]));
  return placeCeviDbPerson(derived, groups, departmentByGroup, currentHomeDepartmentId);
}

/** Cevi.DB-Angaben nach dem Login speichern (Spalten und Stufen-Rollen ersetzen) */
export async function storeCeviDbFields(
  prisma: Db,
  userId: string,
  derived: CeviDbDerived,
  placement: CeviDbPlacement
) {
  await runInTransaction(prisma, async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        ortsgruppeId: placement.verified ? placement.ortsgruppeId : derived.ortsgruppeId,
        ortsgruppeName: placement.verified ? placement.ortsgruppeName : derived.ortsgruppeName,
        departmentLeader: derived.isDepartmentLeader,
        leaderGroupName: derived.leaderGroupName,
        leaderGroupIds: derived.leaderGroupIds,
        // Ohne vollständige Gruppenstruktur bleibt der letzte geprüfte Stand
        ...(placement.verified && placement.complete ? { jungscharIds: placement.jungscharIds } : {}),
      },
    });
    await tx.userHitobitoStufe.deleteMany({ where: { userId } });
    if (derived.stufen.length) {
      await tx.userHitobitoStufe.createMany({
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
 * Laut Gruppenstruktur fremde Stufen bleiben draussen: Mitglied kann auch sein, wer anderswo zu Hause ist.
 */
export async function autoCreateAllCeviDbDepartmentStufen(
  prisma: Db,
  departmentId: string
) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { organization: true, hitobitoGroupId: true },
  });
  const provider: OrganizationType = department?.organization ?? 'CEVI';

  const fromCeviDb = await prisma.userHitobitoStufe.findMany({
    where: {
      user: {
        provider,
        OR: [
          { homeDepartmentId: departmentId },
          { memberships: { some: { departmentId } } },
        ],
      },
    },
    select: { groupId: true, groupName: true },
  });
  if (!fromCeviDb.length) return;

  const departmentGroupId = department?.hitobitoGroupId ?? null;
  const structure = await prisma.hitobitoGroup.findMany({
    where: {
      provider,
      id: { in: [...fromCeviDb.map((s) => s.groupId), ...(departmentGroupId !== null ? [departmentGroupId] : [])] },
    },
  });
  const groupInfo = new Map(structure.map((g) => [g.id, g]));
  const departmentIsJungschar = departmentGroupId !== null && groupInfo.get(departmentGroupId)?.jungscharId === departmentGroupId;
  // Unbekannte Gruppen nur, wenn die Abteilung nicht an einer Jungschar hängt (Stand vor der Gruppenstruktur)
  const belongsToDepartment = (groupId: number) => {
    if (departmentGroupId === null) return true;
    const info = groupInfo.get(groupId);
    if (!info) return !departmentIsJungschar;
    return info.jungscharId === departmentGroupId || info.ortsgruppeId === departmentGroupId;
  };

  const existingStufen = await prisma.departmentStufe.findMany({
    where: { departmentId },
    select: { id: true, name: true, hitobitoGroupId: true, sortOrder: true },
  });

  let maxSortOrder = existingStufen.reduce((max, s) => Math.max(max, s.sortOrder), -1);
  const byHitobitoGroupId = new Map(
    existingStufen.filter((s) => s.hitobitoGroupId !== null).map((s) => [s.hitobitoGroupId!, s])
  );
  const byName = new Map(existingStufen.map((s) => [s.name.trim().toLowerCase(), s]));

  let createdOrLinkedAny = false;

  const uniqueGroups = new Map<number, string>();
  for (const stufe of fromCeviDb) {
    if (!uniqueGroups.has(stufe.groupId) && belongsToDepartment(stufe.groupId)) {
      uniqueGroups.set(stufe.groupId, stufe.groupName);
    }
  }

  for (const [groupId, rawName] of uniqueGroups.entries()) {
    if (byHitobitoGroupId.has(groupId)) {
      continue;
    }

    const groupName = rawName.trim();
    const matchByName = byName.get(groupName.toLowerCase());
    if (matchByName && matchByName.hitobitoGroupId === null) {
      await prisma.departmentStufe.update({
        where: { id: matchByName.id },
        data: { hitobitoGroupId: groupId },
      });
      byHitobitoGroupId.set(groupId, { ...matchByName, hitobitoGroupId: groupId });
      createdOrLinkedAny = true;
      continue;
    }

    let nameToUse = groupName;
    if (byName.has(nameToUse.toLowerCase())) {
      nameToUse = `${nameToUse} (${groupId})`;
    }

    maxSortOrder++;
    try {
      const created = await prisma.departmentStufe.create({
        data: {
          departmentId,
          name: nameToUse,
          hitobitoGroupId: groupId,
          sortOrder: maxSortOrder,
        },
      });
      byHitobitoGroupId.set(groupId, created);
      byName.set(nameToUse.toLowerCase(), created);
      createdOrLinkedAny = true;
    } catch {
      // Parallel angelegt oder Unique Constraint: ignorieren
    }
  }

  if (createdOrLinkedAny) {
    await backfillCeviDbStufen(prisma, departmentId);
  }
}

export async function autoCreateCeviDbDepartmentStufen(
  prisma: Db,
  departmentId: string,
  _userId?: string
) {
  return autoCreateAllCeviDbDepartmentStufen(prisma, departmentId);
}

/** Stufen aus Cevi.DB abgleichen: nur Stufen, die eine Abteilung mit ihrer Cevi.DB-Gruppe verknüpft hat. */
export async function syncCeviDbStufen(prisma: Db, userId: string, provider?: OrganizationType) {
  let effectiveProvider = provider;
  if (!effectiveProvider) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { provider: true } });
    effectiveProvider = u?.provider ?? 'CEVI';
  }
  const fromCeviDb = await prisma.userHitobitoStufe.findMany({ where: { userId } });
  const groupIds = fromCeviDb.map((s) => s.groupId);
  const linked = groupIds.length
    ? await prisma.departmentStufe.findMany({
        where: { hitobitoGroupId: { in: groupIds }, department: { organization: effectiveProvider } },
      })
    : [];

  await runInTransaction(prisma, async (tx) => {
    await tx.userStufe.deleteMany({
      where: { userId, source: 'CEVIDB', stufeId: { notIn: linked.map((s) => s.id) } },
    });
    for (const stufe of linked) {
      const kind = fromCeviDb.find((s) => s.groupId === stufe.hitobitoGroupId)?.kind;
      const role: StufeRole = kind === 'LEITUNG' ? 'LEITUNG' : 'TEILNEHMER';
      await tx.userStufe.upsert({
        where: { userId_stufeId: { userId, stufeId: stufe.id } },
        update: { role, source: 'CEVIDB' },
        create: { userId, stufeId: stufe.id, role, source: 'CEVIDB' },
      });
    }
  });
}

/** Gehört in jedes Schreiben von homeDepartmentSource, das eine Bestätigung beendet */
export const NO_HOME_CONFIRMATION = { homeDepartmentConfirmedAt: null, homeDepartmentConfirmedById: null };

/** Ortsgruppe zur Hitobito-Gruppe einer Abteilung: die Gruppe selbst oder die Ortsgruppe ihrer Jungschar */
export async function departmentOrtsgruppeId(
  prisma: Pick<Db, 'hitobitoGroup'>,
  groupId: number | null,
  provider: OrganizationType = 'CEVI'
) {
  if (groupId === null) return null;
  const group = await prisma.hitobitoGroup.findUnique({
    where: { provider_id: { provider, id: groupId } },
    select: { ortsgruppeId: true },
  });
  return group?.ortsgruppeId ?? groupId;
}

/**
 * Wer gehört laut Cevi.DB zur Gruppe einer Abteilung (Jungschar oder Ortsgruppe) und wer leitet sie?
 * Die Leitung zählt nur über die Gruppe der Rolle: bei einer Ortsgruppe über ihre einzige Jungschar.
 * `moveHome`: Die Heimabteilung folgt nur, wenn die Person keine hat oder nur in dieser Jungschar Rollen hat. Bei
 * Rollen in mehreren Jungscharen entscheidet die Hauptgruppe, und die ist hier nicht bekannt, sondern nur beim Login.
 */
export async function ceviDbGroupPeople(
  prisma: Pick<Db, 'user' | 'hitobitoGroup'>,
  groupId: number,
  provider: OrganizationType = 'CEVI'
) {
  const group = await prisma.hitobitoGroup.findUnique({ where: { provider_id: { provider, id: groupId } } });
  const isJungschar = group?.jungscharId === groupId;
  const people = await prisma.user.findMany({
    where: {
      provider,
      ...(isJungschar ? { jungscharIds: { has: groupId } } : { ortsgruppeId: groupId }),
    },
    select: { id: true, homeDepartmentId: true, jungscharIds: true, leaderGroupIds: true },
  });
  const jungscharen =
    group?.jungscharCount === 1
      ? await prisma.hitobitoGroup.findMany({ where: { provider, ortsgruppeId: groupId }, select: { jungscharId: true } })
      : [];
  const leaderGroupIds = new Set<number | null>(jungscharen.map((g) => g.jungscharId));
  if (isJungschar) leaderGroupIds.add(groupId);
  // Ohne Jungscharen (Pfadi-Abteilung, Jubla-Schar, Region, Kantonalverband): Die Leitungsrolle liegt in der Gruppe
  // selbst oder in einer Gruppe darunter (Jubla: Regional- bzw. Kantonsleitung als eigene Untergruppe)
  if (group?.jungscharCount === 0) {
    leaderGroupIds.add(groupId);
    const below = await prisma.hitobitoGroup.findMany({ where: { provider, ortsgruppeId: groupId }, select: { id: true } });
    for (const g of below) leaderGroupIds.add(g.id);
  }
  return people.map((p) => ({
    id: p.id,
    isLeader: p.leaderGroupIds.some((id) => leaderGroupIds.has(id)),
    moveHome: !isJungschar || p.homeDepartmentId === null || p.jungscharIds.length === 1,
  }));
}

/**
 * Nach dem Cevi.DB-Login: Heimabteilung setzen, Stufen automatisch in der Abteilung anlegen und Stufen abgleichen.
 * Belegen die Rollen eine Abteilung, zählt sie (Quelle CEVIDB). Gehen sie nachweislich nirgends hin, wird eine
 * Zuordnung aus Cevi.DB aufgehoben. Ohne Aussage (Cevi.DB nicht erreichbar, keine Rolle in einer Ortsgruppe) bleibt
 * alles beim Alten; nur wer noch keine Abteilung hat, bekommt die zu `ortsgruppe_id`, aber wie selbst gewählt
 * (Quelle SELF), denn das Feld kann die Person selbst ändern. Gibt die Heimabteilung zurück.
 */
export async function syncCeviDbHomeDepartment(
  prisma: Db,
  user: { id: string; homeDepartmentSource: string | null; departmentSetupAt: Date | null },
  placement: CeviDbPlacement,
  provider: OrganizationType = 'CEVI'
): Promise<{ id: string; slug: string; organization: OrganizationType } | null> {
  const select = { id: true, slug: true, organization: true } as const;
  let department = placement.homeDepartmentId
    ? await prisma.department.findUnique({ where: { id: placement.homeDepartmentId }, select })
    : null;

  if (department) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        homeDepartmentId: department.id,
        homeDepartmentSource: 'CEVIDB',
        ...NO_HOME_CONFIRMATION,
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
    // Bestätigt ist eine Person nur, solange ihre Rollen in der Ortsgruppe der Abteilung liegen
    if (current?.homeDepartmentId && user.homeDepartmentSource === 'CONFIRMED' && placement.complete) {
      const home = await prisma.department.findUnique({
        where: { id: current.homeDepartmentId },
        select: { organization: true, hitobitoGroupId: true },
      });
      if ((await departmentOrtsgruppeId(prisma, home?.hitobitoGroupId ?? null, home?.organization ?? provider)) !== placement.ortsgruppeId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { homeDepartmentSource: 'SELF', ...NO_HOME_CONFIRMATION },
        });
      }
    }
    if (placement.verified && placement.complete) {
      if (user.homeDepartmentSource === 'CEVIDB') {
        // Abteilung gewechselt oder gelöscht: erneut nachfragen
        await prisma.user.update({
          where: { id: user.id },
          data: { homeDepartmentId: null, homeDepartmentSource: null, departmentSetupAt: null },
        });
      }
    } else if (current?.homeDepartmentId) {
      department = await prisma.department.findUnique({ where: { id: current.homeDepartmentId }, select });
    } else if (placement.selfDeclaredDepartmentId) {
      department = await prisma.department.findUnique({ where: { id: placement.selfDeclaredDepartmentId }, select });
      if (department) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            homeDepartmentId: department.id,
            homeDepartmentSource: 'SELF',
            departmentSetupAt: user.departmentSetupAt ?? new Date(),
          },
        });
      }
    }
  }

  await syncCeviDbStufen(prisma, user.id, provider);
  return department;
}

/** Neu mit Cevi.DB verknüpfte Stufe: bereits angemeldete Cevi.DB-Personen der Abteilung gleich zuordnen. */
export async function backfillCeviDbStufen(prisma: Db, departmentId: string) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { organization: true },
  });
  const provider: OrganizationType = department?.organization ?? 'CEVI';
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { homeDepartmentId: departmentId },
        { memberships: { some: { departmentId } } },
      ],
      provider,
      providerId: { not: null },
    },
    select: { id: true },
  });
  for (const user of users) {
    await syncCeviDbStufen(prisma, user.id, provider);
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
