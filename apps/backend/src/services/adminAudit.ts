/**
 * Dauerhaftes Protokoll der Admin-Portal-Aktionen (Tabelle admin_audit_logs) und Mail an alle
 * globalen Admins, wenn jemand Admin-Rechte bekommt oder verliert.
 */
import type { FastifyRequest } from 'fastify';
import { Prisma, PrismaClient } from '../db.js';
import { personLabel } from './profile.js';
import { escapeHtml, sendGenericEmail } from './email.js';
import { usableEmail } from '../routes/eventMessages.js';

export type AdminAuditTarget = 'USER' | 'DEPARTMENT' | 'EVENT';

export interface AdminAuditEntry {
  action: string;
  targetType: AdminAuditTarget;
  targetId: string | null;
  targetLabel: string;
  details?: Record<string, unknown>;
}

/** Aktion speichern. Scheitert das Protokoll, wird geloggt, die Aktion selbst ist dann schon passiert. */
export async function recordAdminAction(prisma: PrismaClient, request: FastifyRequest, entry: AdminAuditEntry) {
  try {
    const admin = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { firstName: true, lastName: true, nickname: true },
    });
    await prisma.adminAuditLog.create({
      data: {
        adminId: request.user.id,
        adminName: admin ? personLabel(admin) : request.user.email,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        targetLabel: entry.targetLabel.slice(0, 300),
        details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: request.ip,
      },
    });
  } catch (err) {
    request.log.error({ err, entry }, 'Admin-Protokoll konnte nicht gespeichert werden');
  }
  request.log.warn({ adminId: request.user.id, ...entry }, `Admin: ${entry.action}`);
}

/**
 * Alle globalen Admins (inkl. der betroffenen Person) per Mail informieren, wenn Admin-Rechte vergeben
 * oder entzogen werden. So fällt eine unerwartete Vergabe sofort auf. Läuft im Hintergrund.
 */
export function notifyAdminChange(
  prisma: PrismaClient,
  request: FastifyRequest,
  change: { granted: boolean; targetUserId: string; targetLabel: string; actorLabel: string }
) {
  void (async () => {
    const recipients = await prisma.user.findMany({
      where: { OR: [{ isGlobalAdmin: true }, { id: change.targetUserId }] },
      select: { email: true, emailVerified: true },
    });
    const verb = change.granted ? 'ist neu globale*r Admin' : 'ist kein*e globale*r Admin mehr';
    const subject = `Cevi Schichtplan: ${change.targetLabel} ${verb}`;
    const timestamp = new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' });
    const messageHtml = `
      <p style="margin: 0 0 16px 0;"><strong class="email-signature" style="color: #1c1917;">${escapeHtml(change.targetLabel)}</strong> ${escapeHtml(verb)}.</p>
      <p style="margin: 0;">Falls diese Änderung nicht abgesprochen war, prüft bitte sofort das Protokoll im Admin-Portal.</p>
    `;
    const details = [
      { label: 'Person', value: change.targetLabel, highlight: true },
      { label: 'Status', value: change.granted ? 'Globale Admin-Rechte vergeben' : 'Globale Admin-Rechte entzogen' },
      { label: 'Geändert von', value: change.actorLabel },
      { label: 'Zeitpunkt', value: timestamp },
    ];
    const domain = (process.env.COOKIE_DOMAIN || process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
    const adminUrl = `https://admin.${domain}/#protokoll`;
    const emails = [...new Set(recipients.map(usableEmail).filter((e): e is string => Boolean(e)))];
    for (const to of emails) {
      await sendGenericEmail({
        to,
        subject,
        eyebrow: 'Admin-Portal · Sicherheit',
        title: subject,
        messageHtml,
        details,
        ctaText: 'Admin-Protokoll öffnen',
        ctaUrl: adminUrl,
      });
    }
  })().catch((err) => request.log.error({ err }, 'Mail zur Admin-Änderung fehlgeschlagen'));
}
