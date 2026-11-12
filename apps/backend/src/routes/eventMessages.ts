import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  SendEventMessageSchema,
  accessTypeConfig,
  businessDayKey,
  getVocabulary,
  isPlaceholderEmail,
  toZurichInput,
  type EventMessageDto,
  type EventMessageResultDto,
  type EventMessageTarget,
} from '@schichtplan/shared';
import { accessEventInclude, checkRules, managerFlags, type AccessUser } from '../services/eventAccess.js';
import { escapeHtml, renderEmailTemplate, sendEmail } from '../services/email.js';
import { eventRelatedPeopleWhere } from '../services/departmentVisibility.js';
import { personLabel } from '../services/profile.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { eventUrl } from '../services/shiftReminders.js';
import { trackUsage } from '../services/usageStats.js';
import { sendPushToUser } from '../services/webPush.js';

// Schutz vor versehentlichem Mehrfach-Versand und Missbrauch: pro Anlass und pro Person
const eventLimiter = createRateLimiter(60 * 60 * 1000, 10);
const senderLimiter = createRateLimiter(60 * 60 * 1000, 20);

export const MAX_MESSAGE_RECIPIENTS = 1000;

type Recipient = { id: string; label: string; email: string | null; pushNotifyMessages?: boolean };

/** Nur bestätigte, echte Adressen (keine Platzhalter aus Cevi.DB, keine selbst eingetragenen unbestätigten) */
export function usableEmail(u: { email: string | null; emailVerified: boolean }): string | null {
  if (!u.email || !u.emailVerified || isPlaceholderEmail(u.email)) return null;
  return u.email;
}

/** Text der Nachricht als HTML: Zeilenumbrüche bleiben, alles andere wird escaped */
export function messageBodyHtml(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin: 0 0 16px 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function toDto(m: {
  id: string;
  sentByName: string;
  subject: string;
  body: string;
  target: string;
  targetLabel: string;
  recipientCount: number;
  failedCount: number;
  createdAt: Date;
}): EventMessageDto {
  return {
    id: m.id,
    sentByName: m.sentByName,
    subject: m.subject,
    body: m.body,
    target: m.target as EventMessageTarget,
    targetLabel: m.targetLabel,
    recipientCount: m.recipientCount,
    failedCount: m.failedCount,
    createdAt: m.createdAt.toISOString(),
  };
}

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  email: true,
  emailVerified: true,
  pushNotifyMessages: true,
} as const;

/** Nachrichten des OK an Helfende (E-Mail, jede Person bekommt eine eigene Mail) */
const eventMessageRoutes: FastifyPluginAsync = async (fastify) => {
  async function loadManagedEvent(tenantId: string, slug: string, user: { id: string; isGlobalAdmin: boolean }) {
    const event = await fastify.prisma.event.findUnique({
      where: { departmentId_slug: { departmentId: tenantId, slug } },
      include: {
        ...accessEventInclude,
        department: { select: { slug: true, name: true, primaryColor: true, organization: true } },
        contactUser: { select: userSelect },
      },
    });
    if (!event) return { event: null, canView: false, canSend: false };
    const flags = await managerFlags(fastify.prisma, event, user);
    return { event, canView: flags.isManager, canSend: flags.can.MESSAGES };
  }

  // Verlauf der verschickten Nachrichten
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/messages',
    {
      schema: {
        tags: ['Nachrichten'],
        summary: 'Verlauf der OK-Nachrichten abrufen',
        description: 'Liefert die bisher verschickten Rundmails und Benachrichtigungen des OK an Helfende dieses Anlasses.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      const { event, canView: allowed } = await loadManagedEvent(request.tenant.id, request.params.slug, request.user);
      if (!event) return reply.status(404).send({ error: 'Event nicht gefunden' });
      if (!allowed) return reply.status(403).send({ error: 'Nur die Abteilungsleitung oder das Event-OK' });
      reply.header('Cache-Control', 'no-store');

      const messages = await fastify.prisma.eventMessage.findMany({
        where: { eventId: event.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return messages.map(toDto);
    }
  );

  // Nachricht verschicken (oder mit dryRun nur die Empfänger zählen)
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/messages',
    {
      schema: {
        tags: ['Nachrichten'],
        summary: 'Nachricht an Helfende senden',
        description: 'Verschickt eine formatierte E-Mail-Nachricht (und optional Push-Benachrichtigung) an Helfende des Anlasses oder zählt im Testlauf (dryRun) die Empfänger.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: SendEventMessageSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      const { event, canSend: allowed } = await loadManagedEvent(request.tenant.id, request.params.slug, request.user);
      if (!event) return reply.status(404).send({ error: 'Event nicht gefunden' });
      if (!allowed) return reply.status(403).send({ error: 'Nur die Abteilungsleitung oder das Event-OK' });

      const input = request.body as z.output<typeof SendEventMessageSchema>;
      const { subject, body, target, dryRun } = input;

      let recipients: Recipient[] = [];
      let targetLabel = '';

      if (target === 'ALL' || target === 'SHIFTS') {
        const shiftIds = target === 'SHIFTS' ? [...new Set(input.shiftIds ?? [])] : null;
        let selectedDayKeys: string[] = [];
        if (shiftIds) {
          const selectedShifts = await fastify.prisma.shift.findMany({
            where: { id: { in: shiftIds }, eventId: event.id },
            select: { id: true, startTime: true },
          });
          if (selectedShifts.length !== shiftIds.length) {
            return reply.status(400).send({ error: 'Eine Schicht gehört nicht zu diesem Anlass' });
          }
          const cutoff = event.dayCutoffTime || '04:00';
          selectedDayKeys = [
            ...new Set(
              selectedShifts.flatMap((s) => [
                businessDayKey(s.startTime.toISOString(), cutoff),
                toZurichInput(s.startTime).slice(0, 10),
              ])
            ),
          ];
        }
        const users = await fastify.prisma.user.findMany({
          where: {
            OR: shiftIds
              ? [
                  { signups: { some: { shiftId: { in: shiftIds } } } },
                  { shiftResponsibles: { some: { shiftId: { in: shiftIds } } } },
                  ...(selectedDayKeys.length > 0
                    ? [
                        {
                          eventDayResponsibles: {
                            some: { eventId: event.id, dayDate: { in: selectedDayKeys } },
                          },
                        },
                      ]
                    : []),
                ]
              : [
                  { signups: { some: { shift: { eventId: event.id } } } },
                  { shiftResponsibles: { some: { shift: { eventId: event.id } } } },
                  { eventDayResponsibles: { some: { eventId: event.id } } },
                ],
          },
          select: userSelect,
        });
        recipients = users.map((u) => ({
          id: u.id,
          label: personLabel(u),
          email: usableEmail(u),
          pushNotifyMessages: u.pushNotifyMessages,
        }));
        targetLabel = shiftIds
          ? `Eingetragene in ${shiftIds.length} Schicht${shiftIds.length === 1 ? '' : 'en'}`
          : 'Alle Eingetragenen';
      } else if (target === 'OK') {
        const users = await fastify.prisma.user.findMany({
          where: { organizedEvents: { some: { eventId: event.id } } },
          select: userSelect,
        });
        recipients = users.map((u) => ({
          id: u.id,
          label: personLabel(u),
          email: usableEmail(u),
          pushNotifyMessages: u.pushNotifyMessages,
        }));
        targetLabel = 'Das OK';
      } else if (target === 'OPEN') {
        const cfg = accessTypeConfig(event.accessType);
        const targetDeptIds = [
          event.departmentId,
          ...(cfg.whitelist ? event.allowedDepartments.map((a) => a.departmentId) : []),
        ];
        const minRequired = event.minShiftsPerPerson || 1;

        const candidates = await fastify.prisma.user.findMany({
          where: {
            deregistrations: { none: { eventId: event.id } },
            // Wie der Helfer-Pool: freigegebene Abteilungen nur mit eigenem Bezug zum Anlass
            OR: eventRelatedPeopleWhere(event),
          },
          select: {
            ...userSelect,
            isGlobalAdmin: true,
            providerId: true,
            departmentLeader: true,
            homeDepartmentId: true,
            homeDepartmentSource: true,
            memberships: {
              where: { departmentId: { in: targetDeptIds } },
              select: { departmentId: true, role: true, permissions: true },
            },
            stufen: {
              where: { stufe: { departmentId: { in: targetDeptIds } } },
              select: { stufeId: true, role: true, source: true },
            },
            hitobitoStufen: { select: { kind: true } },
            signups: {
              where: { shift: { eventId: event.id } },
              select: { id: true },
            },
            eventAccessGrants: {
              where: { eventId: event.id },
              select: { id: true, link: { select: { expiresAt: true } } },
            },
          },
        });

        const matching = candidates.filter((u) => {
          if (u.signups.length >= minRequired) return false;
          const hasGrant = u.eventAccessGrants.length > 0;
          // Globale Admins zählen hier nicht automatisch: Sie haben oft eine Mitgliedschaft in vielen
          // Abteilungen, sind aber nicht Helfende jedes Anlasses (sonst bekämen sie z. B. jede
          // «Noch ohne Schicht»-Nachricht). Für sie gelten die normalen Regeln.
          const isDeptAdmin = u.memberships.some((m) => m.departmentId === event.departmentId && m.role === 'ADMIN');
          const isPlanner = u.memberships.some(
            (m) => m.departmentId === event.departmentId && m.permissions.includes('EVENTS_VIEW_ALL')
          );
          const isOrganizer = event.organizers.some((o) => o.userId === u.id);
          if (isDeptAdmin || isPlanner || isOrganizer || hasGrant || u.signups.length > 0) return true;
          const accessUser: AccessUser = {
            id: u.id,
            isGlobalAdmin: u.isGlobalAdmin,
            providerId: u.providerId,
            departmentLeader: u.departmentLeader,
            hitobitoStufen: u.hitobitoStufen,
            homeDepartmentId: u.homeDepartmentId,
            homeDepartmentSource: u.homeDepartmentSource,
            stufen: u.stufen,
          };
          return checkRules(event, accessUser, event.department.name).ok;
        });

        recipients = matching.map((u) => ({
          id: u.id,
          label: personLabel(u),
          email: usableEmail(u),
          pushNotifyMessages: u.pushNotifyMessages,
        }));
        targetLabel = event.minShiftsPerPerson
          ? `Unter dem Soll (mind. ${event.minShiftsPerPerson} Schicht${event.minShiftsPerPerson === 1 ? '' : 'en'})`
          : 'Noch ohne Schicht';
      } else {
        const userIds = [...new Set(input.userIds ?? [])];
        // Nur Personen mit Bezug zum Anlass oder zur Abteilung, nie beliebige Konten
        // (freigegebene Abteilungen nur mit eigenem Bezug zum Anlass, siehe eventRelatedPeopleWhere)
        const users = await fastify.prisma.user.findMany({
          where: {
            id: { in: userIds },
            OR: [
              ...eventRelatedPeopleWhere(event),
              { shiftResponsibles: { some: { shift: { eventId: event.id } } } },
              { eventDayResponsibles: { some: { eventId: event.id } } },
            ],
          },
          select: userSelect,
        });
        if (users.length !== userIds.length) {
          return reply.status(400).send({ error: 'Eine ausgewählte Person gehört nicht zu diesem Anlass' });
        }
        recipients = users.map((u) => ({
          id: u.id,
          label: personLabel(u),
          email: usableEmail(u),
          pushNotifyMessages: u.pushNotifyMessages,
        }));
        targetLabel = `${userIds.length} ausgewählte Person${userIds.length === 1 ? '' : 'en'}`;
      }

      const withEmail = recipients.filter((r): r is Recipient & { email: string } => Boolean(r.email));
      const withoutEmail = recipients
        .filter((r) => !r.email)
        .map((r) => r.label)
        .sort((a, b) => a.localeCompare(b, 'de'));

      if (withEmail.length > MAX_MESSAGE_RECIPIENTS) {
        return reply
          .status(400)
          .send({ error: `Höchstens ${MAX_MESSAGE_RECIPIENTS} Empfänger*innen pro Nachricht` });
      }

      if (dryRun) {
        return { recipientCount: withEmail.length, withoutEmail, sent: 0, failed: 0 } satisfies EventMessageResultDto;
      }
      if (withEmail.length === 0) {
        return reply.status(400).send({ error: 'Niemand in dieser Auswahl hat eine bestätigte E-Mail-Adresse' });
      }
      if (eventLimiter.isBlocked(event.id) || senderLimiter.isBlocked(request.user.id)) {
        return reply.status(429).send({ error: 'Zu viele Nachrichten in kurzer Zeit. Bitte später nochmals versuchen.' });
      }
      eventLimiter.hit(event.id);
      senderLimiter.hit(request.user.id);
      trackUsage('MESSAGE', { dim: target, departmentId: event.departmentId });
      trackUsage('MESSAGE_RECIPIENTS', { dim: target, departmentId: event.departmentId, n: withEmail.length });

      const sender = await fastify.prisma.user.findUnique({ where: { id: request.user.id }, select: userSelect });
      const senderName = sender ? personLabel(sender) : 'OK';
      const replyTo =
        (sender ? usableEmail(sender) : null) ??
        (event.contactUser ? usableEmail(event.contactUser) : null) ??
        undefined;

      const message = await fastify.prisma.eventMessage.create({
        data: {
          eventId: event.id,
          sentByUserId: request.user.id,
          sentByName: senderName,
          subject,
          body,
          target,
          targetLabel,
          recipientCount: withEmail.length,
        },
      });

      const senderNoteHtml = `<p style="margin: 0; font-size: 13px; color: #716b66;">Nachricht von <strong class="email-signature" style="color: #1c1917;">${escapeHtml(senderName)}</strong> (OK ${escapeHtml(event.title)})${
        replyTo
          ? ` · Antworten gehen direkt an <a href="mailto:${escapeHtml(replyTo)}" style="text-decoration: underline;">${escapeHtml(replyTo)}</a>.`
          : '.'
      }</p>`;
      const targetEventUrl = eventUrl(event.department.slug, event.slug, event.department.organization);
      const fromName = `${event.title} (${event.department.name})`;
      const signatureName = `OK ${event.title} (${event.department.name})`;

      // Versand im Hintergrund, damit grosse Listen die Anfrage nicht blockieren. Fehlschläge landen im Verlauf.
      const defaultGreeting = getVocabulary(event.department.organization).member;
      void (async () => {
        let failed = 0;
        for (const r of withEmail) {
          const greetingName = r.label?.trim() || defaultGreeting;
          const personalizedBody = body.replace(/\{name\}/gi, () => greetingName);
          const html = renderEmailTemplate({
            preheader: `${subject} – Nachricht vom OK ${event.title}`,
            eyebrow: event.title,
            title: subject,
            headerSubtitle: event.department.name,
            signatureName,
            accentColor: event.department.primaryColor,
            contentHtml: `${messageBodyHtml(personalizedBody)}${senderNoteHtml}`,
            ctaText: 'Zum Schichtplan',
            ctaUrl: targetEventUrl,
            footerNote: `Du erhältst diese Nachricht, weil du beim Anlass «${event.title}» von ${event.department.name} dabei bist.`,
            organization: event.department.organization,
          });
          const text = `${personalizedBody.trim()}\n\n--\nNachricht von ${senderName} (OK ${event.title})${
            replyTo ? ` · Antworten gehen direkt an ${replyTo}.` : ''
          }\nZum Schichtplan: ${targetEventUrl}`;

          const ok = await sendEmail({
            to: r.email,
            subject: `${subject} – ${event.title}`,
            html,
            text,
            replyTo,
            fromName,
            autoSubmitted: false,
            kind: 'OK_MESSAGE',
            organization: event.department.organization,
          });
          if (!ok) failed++;
        }
        // Zusätzlich Browser-Push an alle ausgewählten Empfänger*innen (auch ohne E-Mail), sofern aktiviert
        for (const r of recipients) {
          if (r.pushNotifyMessages === false) continue;
          const greetingName = r.label?.trim() || defaultGreeting;
          const previewText = body
            .replace(/\{name\}/gi, () => greetingName)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 140);
          await sendPushToUser(
            fastify.prisma,
            r.id,
            {
              title: `${event.title}: ${subject}`,
              body: previewText,
              url: targetEventUrl,
              tag: `ok-message-${message.id}`,
            },
            request.log
          ).catch(() => undefined);
        }
        if (failed > 0) {
          await fastify.prisma.eventMessage
            .update({ where: { id: message.id }, data: { failedCount: failed } })
            .catch((err) => request.log.error(err, 'Fehlerzahl der Nachricht nicht gespeichert'));
        }
      })().catch((err) => request.log.error(err, 'Versand der OK-Nachricht abgebrochen'));

      return {
        recipientCount: withEmail.length,
        withoutEmail,
        sent: withEmail.length,
        failed: 0,
        message: toDto(message),
      } satisfies EventMessageResultDto;
    }
  );
};

export default eventMessageRoutes;
