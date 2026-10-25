/**
 * Protokoll einer Abteilung (Tabelle department_audit_logs): Rechte, Abteilungsleitung, Stufen und Zugehörigkeit
 * von Personen. Sichtbar für Abteilungsleitung und «Personen und Rechte verwalten» sowie im Admin-Portal.
 */
import type { FastifyBaseLogger } from 'fastify';
import { Prisma, PrismaClient } from '../db.js';
import type { DepartmentAuditEntryDto } from '@schichtplan/shared';
import { personLabel } from './profile.js';

export type DepartmentAuditAction = 'PERMISSIONS_SET' | 'LEADER_GRANT' | 'LEADER_REVOKE' | 'STUFEN_SET' | 'MEMBER_REMOVE';

export interface DepartmentAuditEntry {
  departmentId: string;
  /** null = automatisch (Cevi.DB-Login) */
  actorId: string | null;
  action: DepartmentAuditAction;
  targetUserId: string | null;
  targetLabel: string;
  details?: Record<string, unknown>;
  /** Zusatz zum Namen der handelnden Person, z. B. «Admin-Portal» */
  via?: string;
}

/** Eintrag speichern. Scheitert das Protokoll, wird geloggt, die Änderung selbst ist dann schon passiert. */
export async function recordDepartmentAction(
  prisma: Pick<PrismaClient, 'user' | 'departmentAuditLog'>,
  log: FastifyBaseLogger,
  entry: DepartmentAuditEntry
) {
  try {
    let actorName = 'Cevi.DB (automatisch)';
    if (entry.actorId) {
      const actor = await prisma.user.findUnique({
        where: { id: entry.actorId },
        select: { firstName: true, lastName: true, ceviName: true },
      });
      actorName = actor ? personLabel(actor) : 'Unbekannt';
    }
    if (entry.via) actorName = `${actorName} (${entry.via})`;
    await prisma.departmentAuditLog.create({
      data: {
        departmentId: entry.departmentId,
        actorId: entry.actorId,
        actorName: actorName.slice(0, 200),
        action: entry.action,
        targetUserId: entry.targetUserId,
        targetLabel: entry.targetLabel.slice(0, 300),
        details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    log.error({ err, entry }, 'Abteilungs-Protokoll konnte nicht gespeichert werden');
  }
  log.info({ ...entry }, `Abteilung: ${entry.action}`);
}

export function toDepartmentAuditDto(row: {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetUserId: string | null;
  targetLabel: string;
  details: Prisma.JsonValue | null;
  createdAt: Date;
}): DepartmentAuditEntryDto {
  return {
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    targetUserId: row.targetUserId,
    targetLabel: row.targetLabel,
    details:
      row.details && typeof row.details === 'object' && !Array.isArray(row.details)
        ? (row.details as Record<string, unknown>)
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}
