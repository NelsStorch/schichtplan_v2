
import type { Prisma, PrismaClient } from '../../db.js';
import {
  accessTypeConfig,
  toRetentionDays,
  type EventQuestionInput,
  type EventQuestionDto,
  type EventQuestionType,
  type ResponsiblePersonDto,
} from '@schichtplan/shared';


// Gemeinsame Bausteine der Anlass-Routen (routes/events/*) und der Vorlagen (routes/eventTemplates.ts)

export type Tx = Prisma.TransactionClient;

export function toQuestionDto(q: {
  id: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  scope: string;
  retentionDays: number | null;
}): EventQuestionDto {
  return {
    id: q.id,
    label: q.label,
    type: (['TEXT', 'YES_NO', 'CHOICE'].includes(q.type) ? q.type : 'TEXT') as EventQuestionType,
    options: q.options,
    required: q.required,
    scope: q.scope === 'PER_SIGNUP' ? 'PER_SIGNUP' : 'ONCE',
    retentionDays: toRetentionDays(q.retentionDays),
  };
}

export function toResponsiblePersonDto(
  u: {
    id: string;
    firstName: string;
    lastName: string | null;
    ceviName?: string | null;
    phone?: string | null;
    email?: string | null;
  },
  contactVisibility: string = 'BOTH'
): ResponsiblePersonDto {
  const allowPhone = contactVisibility === 'BOTH' || contactVisibility === 'PHONE';
  const allowEmail = contactVisibility === 'BOTH' || contactVisibility === 'EMAIL';
  return {
    id: u.id,
    displayName: u.ceviName
      ? `${u.firstName} / ${u.ceviName}`
      : `${u.firstName} ${u.lastName ?? ''}`.trim(),
    firstName: u.firstName,
    lastName: u.lastName,
    ceviName: u.ceviName,
    phone: allowPhone ? u.phone : null,
    email: allowEmail ? u.email : null,
  };
}

/**
 * Whitelist und Stufen-Filter prüfen: Whitelist nur bei Typen mit `whitelist`, Stufen nur bei
 * abteilungsbezogenen Typen und nur aus der eigenen oder einer freigeschalteten Abteilung.
 */
export async function resolveAccessLists(
  prisma: Pick<PrismaClient, 'department' | 'departmentStufe'> | Tx,
  departmentId: string,
  accessType: string,
  allowedDepartmentIds: string[],
  allowedStufeIds: string[]
): Promise<{ departmentIds: string[]; stufeIds: string[] } | { error: string }> {
  const cfg = accessTypeConfig(accessType);
  const departmentIds = cfg.whitelist
    ? [...new Set(allowedDepartmentIds)].filter((id) => id !== departmentId)
    : [];
  if (cfg.whitelist && departmentIds.length === 0) {
    return { error: 'Bitte mindestens eine weitere Abteilung freischalten oder einen anderen Typ wählen.' };
  }
  if (departmentIds.length > 0) {
    const found = await prisma.department.count({ where: { id: { in: departmentIds } } });
    if (found !== departmentIds.length) return { error: 'Eine der gewählten Abteilungen gibt es nicht' };
  }

  const stufeIds = cfg.scope === 'DEPARTMENT' ? [...new Set(allowedStufeIds)] : [];
  if (stufeIds.length > 0) {
    const allowedDepartments = [departmentId, ...departmentIds];
    const found = await prisma.departmentStufe.count({
      where: { id: { in: stufeIds }, departmentId: { in: allowedDepartments } },
    });
    if (found !== stufeIds.length) return { error: 'Eine der gewählten Stufen gehört nicht zu den Abteilungen' };
  }
  return { departmentIds, stufeIds };
}

/** Fragen abgleichen: bestehende (mit id) ändern, neue anlegen, fehlende löschen (samt Antworten). */
export async function syncQuestions(tx: Tx, eventId: string, questions: EventQuestionInput[]) {
  const existing = await tx.eventQuestion.findMany({ where: { eventId }, select: { id: true } });
  const existingIds = new Set(existing.map((q) => q.id));
  const keepIds = questions.map((q) => q.id).filter((id): id is string => Boolean(id && existingIds.has(id)));
  await tx.eventQuestion.deleteMany({ where: { eventId, id: { notIn: keepIds } } });

  for (const [index, q] of questions.entries()) {
    const data = {
      label: q.label,
      type: q.type,
      options: q.type === 'CHOICE' ? q.options : [],
      required: q.required,
      scope: q.scope,
      retentionDays: q.retentionDays,
      sortOrder: index,
    };
    if (q.id && existingIds.has(q.id)) {
      await tx.eventQuestion.update({ where: { id: q.id }, data });
    } else {
      await tx.eventQuestion.create({ data: { ...data, eventId } });
    }
  }
}

export async function replaceAccessLists(tx: Tx, eventId: string, departmentIds: string[], stufeIds: string[]) {
  await tx.eventAllowedDepartment.deleteMany({ where: { eventId } });
  await tx.eventAllowedStufe.deleteMany({ where: { eventId } });
  if (departmentIds.length) {
    await tx.eventAllowedDepartment.createMany({
      data: departmentIds.map((departmentId) => ({ eventId, departmentId })),
    });
  }
  if (stufeIds.length) {
    await tx.eventAllowedStufe.createMany({ data: stufeIds.map((stufeId) => ({ eventId, stufeId })) });
  }
}
