import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_CATERING_EARLY_HOURS,
  DEFAULT_CATERING_TOKEN_ITEMS,
  formatZurichTime,
  type CateringTokenDto,
} from '@schichtplan/shared';
import { personLabel } from '../services/attendance.js';
import { managerFlags } from '../services/eventAccess.js';
import {
  availableFromTime,
  getCateringOverview,
  getHelperCateringTokens,
  isTokenAvailableNow,
} from '../services/cateringTokens.js';
import {
  createCateringBatch,
  generateBatchPdf,
  getEventCateringBatches,
  getPhysicalCardByCode,
  redeemPhysicalTokens,
  toggleBatchBlocked,
} from '../services/cateringBatches.js';
import {
  CreateCateringBatchSchema,
  RedeemPhysicalTokenSchema,
  ORGANIZATION_DOMAINS,
  getOrganization,
  getOrganizationByDbType,
  type OrganizationType,
} from '@schichtplan/shared';
import { timingSafeEqual } from 'node:crypto';
import { eventUrl } from '../services/shiftReminders.js';
import { createRateLimiter } from '../services/rateLimit.js';

/** Pfad- und Abfrageparameter der Verpflegungs-Routen (vom Routen-Schema geprüft) */
const SlugParams = z.object({ slug: z.string().min(1).max(100) });
const TokenParams = SlugParams.extend({ tokenId: z.string().uuid() });
const BatchParams = SlugParams.extend({ batchId: z.string().uuid() });
const ScanQuery = z.object({ code: z.string().max(200).optional() });

/** Falsche Stand-PINs pro IP und Anlass: 10 Versuche in 15 Minuten (ein 4-stelliger PIN ist schnell durchprobiert) */
const staffPinLimiter = createRateLimiter(15 * 60 * 1000, 10);

/**
 * Basis-URL für die QR-Codes auf Papier-Bons. Der Host muss zur eigenen Domain gehören (lokal auch
 * localhost); sonst die Abteilungs-Subdomain. In Produktion immer https.
 */
export function cateringBaseUrl(
  hostHeader: string | undefined,
  tenantSlug: string | null,
  organization?: OrganizationType | string
): string {
  const defaultDomain = (process.env.COOKIE_DOMAIN || process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '').toLowerCase();
  const production = process.env.NODE_ENV === 'production';
  const isStaging = defaultDomain.startsWith('dev.') || defaultDomain.includes('.dev.');
  const host = (hostHeader ?? '').trim().toLowerCase();
  const hostname = host.replace(/:\d+$/, '');
  const isLocal = !production && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost'));
  if (isLocal) return `http://${host}`;

  const isPlatformHost =
    /^[a-z0-9.-]+(:\d+)?$/.test(host) &&
    (hostname === defaultDomain ||
      hostname.endsWith(`.${defaultDomain}`) ||
      ORGANIZATION_DOMAINS.some(
        (d) => hostname === d || hostname.endsWith(`.${d}`) || hostname === `dev.${d}` || hostname.endsWith(`.dev.${d}`)
      ));

  if (isPlatformHost) return `https://${hostname}`;

  let rootDomain: string;
  if (organization) {
    const upper = organization.toUpperCase();
    if (upper === 'CEVI' || upper === 'PFADI' || upper === 'JUBLA' || upper === 'OTHER' || upper === 'VEREIN') {
      rootDomain = getOrganizationByDbType(upper).domain;
    } else {
      rootDomain = getOrganization(organization).domain;
    }
  } else {
    rootDomain = getOrganization(defaultDomain).domain;
  }

  const cleanRoot = rootDomain.replace(/^dev\./, '');
  const effectiveDomain = isStaging ? `dev.${cleanRoot}` : cleanRoot;
  return tenantSlug ? `https://${tenantSlug}.${effectiveDomain}` : `https://${effectiveDomain}`;
}

function samePin(given: string, expected: string): boolean {
  const a = Buffer.from(given.trim());
  const b = Buffer.from(expected.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

export const cateringRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Darf diese Anfrage physische Bons am Stand prüfen und entwerten?
   * - Eingeloggt mit Anwesenheits-Recht (OK) → ja, unter eigenem Namen
   * - Sonst nur mit dem Stand-PIN des Anlasses. Ohne gesetzten PIN gibt es keinen anonymen Zugang,
   *   sonst könnte jede Person mit einem Papier-Bon ihn mit der Handykamera selbst entwerten.
   * Schickt bei Ablehnung selbst die Antwort und gibt dann null zurück.
   */
  async function authorizeStaff(
    request: FastifyRequest,
    reply: FastifyReply,
    event: { id: string; title: string; cateringStaffPin: string | null } & Parameters<typeof managerFlags>[1],
    givenPin: string | undefined
  ): Promise<{ name: string } | null> {
    if (request.user) {
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (flags.isManager || flags.can.ATTENDANCE) {
        const staffUser = await fastify.prisma.user.findUnique({
          where: { id: request.user.id },
          select: { nickname: true, firstName: true },
        });
        return { name: staffUser?.nickname || staffUser?.firstName || 'OK' };
      }
    }

    const expected = event.cateringStaffPin?.trim();
    if (!expected) {
      reply.status(request.user ? 403 : 401).send({
        error: request.user
          ? 'Nur das OK oder Standpersonal mit Stand-PIN kann Bons entwerten.'
          : 'Bitte melde dich an. Für diesen Anlass ist kein Stand-PIN gesetzt.',
        needsLogin: true,
        eventTitle: event.title,
      });
      return null;
    }

    const limitKey = `${request.ip}:${event.id}`;
    if (staffPinLimiter.isBlocked(limitKey)) {
      reply.status(429).send({ error: 'Zu viele falsche PIN-Versuche. Bitte warte ein paar Minuten.' });
      return null;
    }
    if (!givenPin || !samePin(givenPin, expected)) {
      if (givenPin) staffPinLimiter.hit(limitKey);
      reply.status(401).send({
        error: givenPin ? 'Stand-PIN ist falsch' : 'Stand-PIN erforderlich',
        needsPin: true,
        eventTitle: event.title,
      });
      return null;
    }
    return { name: 'Standpersonal' };
  }

  async function findEvent(tenantId: string | undefined, slug: string, fallbackUserId?: string) {
    if (tenantId) {
      const byTenant = await fastify.prisma.event.findUnique({
        where: { departmentId_slug: { departmentId: tenantId, slug } },
        include: { organizers: true },
      });
      if (byTenant) return byTenant;
    }

    if (fallbackUserId) {
      return fastify.prisma.event.findFirst({
        where: {
          slug,
          OR: [
            { shifts: { some: { signups: { some: { userId: fallbackUserId } } } } },
            { shifts: { some: { responsibles: { some: { userId: fallbackUserId } } } } },
            { dayResponsibles: { some: { userId: fallbackUserId } } },
          ],
        },
        include: { organizers: true },
      });
    }

    return null;
  }

  // Eigene Verpflegungs- und Getränke-Bons eines Anlasses abrufen
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/my-catering-tokens',
    {
      schema: {
        params: SlugParams,
        tags: ['Verpflegung'],
        summary: 'Eigene Verpflegungs-Bons für einen Anlass abrufen',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await findEvent(request.tenant?.id, request.params.slug, request.user.id);
      if (!event) {
        return reply.status(404).send({ error: 'Anlass nicht gefunden' });
      }

      if (!event.cateringTokensEnabled) {
        return {
          eventTitle: event.title,
          earlyHours: event.cateringEarlyHours ?? DEFAULT_CATERING_EARLY_HOURS,
          tokens: [],
        };
      }

      const tokens = await getHelperCateringTokens(fastify.prisma, {
        eventId: event.id,
        userId: request.user.id,
        enabled: event.cateringTokensEnabled,
        tokenItems: event.cateringTokenItems ?? [...DEFAULT_CATERING_TOKEN_ITEMS],
        earlyHours: event.cateringEarlyHours ?? DEFAULT_CATERING_EARLY_HOURS,
      });

      return {
        eventTitle: event.title,
        earlyHours: event.cateringEarlyHours ?? DEFAULT_CATERING_EARLY_HOURS,
        tokens,
      };
    }
  );

  // Einen Verpflegungs-Bon einlösen / entwerten (One-Way durch Helfende/Schichtleitung oder OK)
  fastify.post<{ Params: { slug: string; tokenId: string } }>(
    '/api/events/:slug/catering-tokens/:tokenId/redeem',
    {
      schema: {
        params: TokenParams,
        tags: ['Verpflegung'],
        summary: 'Verpflegungs-Bon entwerten',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await findEvent(request.tenant?.id, request.params.slug, request.user.id);
      if (!event) {
        return reply.status(404).send({ error: 'Anlass nicht gefunden' });
      }

      if (!event.cateringTokensEnabled) {
        return reply.status(400).send({ error: 'Verpflegungs-Bons sind für diesen Anlass nicht aktiviert' });
      }

      const token = await fastify.prisma.cateringToken.findUnique({
        where: { id: request.params.tokenId },
        include: {
          signup: {
            select: {
              id: true,
              userId: true,
              guestName: true,
              attendance: true,
              user: { select: { firstName: true, lastName: true, nickname: true } },
              shift: {
                select: {
                  id: true,
                  eventId: true,
                  title: true,
                  startTime: true,
                  endTime: true,
                },
              },
              task: {
                select: { title: true },
              },
            },
          },
          shift: {
            select: {
              id: true,
              eventId: true,
              title: true,
              startTime: true,
              endTime: true,
            },
          },
          user: {
            select: { firstName: true, lastName: true, nickname: true },
          },
        },
      });

      const shift = token?.signup?.shift ?? token?.shift;
      if (!token || !shift || shift.eventId !== event.id) {
        return reply.status(404).send({ error: 'Verpflegungs-Bon nicht gefunden' });
      }

      const ownerUserId = token.signup?.userId ?? token.userId;
      const isOwner = ownerUserId === request.user.id;
      const flags = await managerFlags(fastify.prisma, event, request.user);
      const canManage = flags.can.ATTENDANCE || flags.isManager;

      if (!isOwner && !canManage) {
        return reply.status(403).send({ error: 'Du darfst nur deine eigenen Verpflegungs-Bons einlösen' });
      }

      if (token.status === 'REDEEMED') {
        return reply.status(409).send({
          error: 'Dieser Verpflegungs-Bon wurde bereits eingelöst',
          redeemedAt: token.redeemedAt ? token.redeemedAt.toISOString() : null,
        });
      }

      const now = new Date();
      const earlyHours = event.cateringEarlyHours ?? DEFAULT_CATERING_EARLY_HOURS;
      const available = isTokenAvailableNow({
        shiftStartTime: shift.startTime,
        earlyHours,
        attendance: token.signup?.attendance ?? null,
        now,
      });

      // OK-Mitglieder dürfen Bons auch ausserhalb des Zeitfensters manuell entwerten
      if (!available && !canManage) {
        const fromTime = availableFromTime(shift.startTime, earlyHours);
        return reply.status(400).send({
          error: `Dieser Bon ist erst ab ${formatZurichTime(fromTime)} Uhr (oder nach dem Check-in) einlösbar.`,
        });
      }

      const personUser = token.signup?.user ?? token.user;
      const redeemerName = personUser
        ? personLabel(personUser)
        : token.signup?.guestName || 'Helfende Person';

      // Nur entwerten, wenn noch nicht eingelöst: Zwei gleichzeitige Anfragen dürfen den Bon nicht beide einlösen
      const { count } = await fastify.prisma.cateringToken.updateMany({
        where: { id: token.id, status: { not: 'REDEEMED' } },
        data: {
          status: 'REDEEMED',
          redeemedAt: now,
          redeemedByName: redeemerName,
        },
      });
      const updated = await fastify.prisma.cateringToken.findUniqueOrThrow({ where: { id: token.id } });
      if (count === 0) {
        return reply.status(409).send({
          error: 'Dieser Verpflegungs-Bon wurde bereits eingelöst',
          redeemedAt: updated.redeemedAt ? updated.redeemedAt.toISOString() : null,
        });
      }

      const isResponsible = !token.shiftSignupId;
      const dto: CateringTokenDto = {
        id: updated.id,
        shiftSignupId: updated.shiftSignupId,
        shiftId: shift.id,
        shiftTitle: shift.title,
        taskTitle: isResponsible ? 'Schichtleitung' : (token.signup?.task?.title ?? null),
        shiftStartTime: shift.startTime.toISOString(),
        shiftEndTime: shift.endTime.toISOString(),
        title: updated.title,
        status: 'REDEEMED',
        isAvailableNow: true,
        availableFrom: availableFromTime(shift.startTime, earlyHours).toISOString(),
        redeemedAt: updated.redeemedAt ? updated.redeemedAt.toISOString() : now.toISOString(),
        redeemedByName: updated.redeemedByName ?? null,
        isResponsible,
        helperName: redeemerName,
      };

      return { token: dto };
    }
  );

  // OK: Versehentlich eingelösten Bon wieder zurücksetzen
  fastify.post<{ Params: { slug: string; tokenId: string } }>(
    '/api/events/:slug/catering-tokens/:tokenId/reset',
    {
      schema: {
        params: TokenParams,
        tags: ['Verpflegung'],
        summary: 'Eingelösten Verpflegungs-Bon zurücksetzen (nur OK)',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) {
        return reply.status(404).send({ error: 'Anlass nicht gefunden' });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ATTENDANCE && !flags.isManager) {
        return reply.status(403).send({ error: 'Nur das OK darf Verpflegungs-Bons zurücksetzen' });
      }

      const token = await fastify.prisma.cateringToken.findUnique({
        where: { id: request.params.tokenId },
        include: {
          signup: {
            select: {
              id: true,
              guestName: true,
              attendance: true,
              user: { select: { firstName: true, lastName: true, nickname: true } },
              shift: {
                select: {
                  id: true,
                  eventId: true,
                  title: true,
                  startTime: true,
                  endTime: true,
                },
              },
              task: { select: { title: true } },
            },
          },
          shift: {
            select: {
              id: true,
              eventId: true,
              title: true,
              startTime: true,
              endTime: true,
            },
          },
          user: {
            select: { firstName: true, lastName: true, nickname: true },
          },
        },
      });

      const shift = token?.signup?.shift ?? token?.shift;
      if (!token || !shift || shift.eventId !== event.id) {
        return reply.status(404).send({ error: 'Verpflegungs-Bon nicht gefunden' });
      }

      const updated = await fastify.prisma.cateringToken.update({
        where: { id: token.id },
        data: {
          status: 'AVAILABLE',
          redeemedAt: null,
          redeemedByName: null,
        },
      });

      const earlyHours = event.cateringEarlyHours ?? DEFAULT_CATERING_EARLY_HOURS;
      const isResponsible = !token.shiftSignupId;
      const personUser = token.signup?.user ?? token.user;
      const helperName = personUser
        ? personLabel(personUser)
        : token.signup?.guestName || 'Helfende Person';

      const dto: CateringTokenDto = {
        id: updated.id,
        shiftSignupId: updated.shiftSignupId,
        shiftId: shift.id,
        shiftTitle: shift.title,
        taskTitle: isResponsible ? 'Schichtleitung' : (token.signup?.task?.title ?? null),
        shiftStartTime: shift.startTime.toISOString(),
        shiftEndTime: shift.endTime.toISOString(),
        title: updated.title,
        status: 'AVAILABLE',
        isAvailableNow: isTokenAvailableNow({
          shiftStartTime: shift.startTime,
          earlyHours,
          attendance: token.signup?.attendance ?? null,
        }),
        availableFrom: availableFromTime(shift.startTime, earlyHours).toISOString(),
        redeemedAt: null,
        redeemedByName: null,
        isResponsible,
        helperName,
      };

      return { token: dto };
    }
  );

  // OK-Übersicht über ausgegebene und eingelöste Verpflegungs-Bons
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/catering-overview',
    {
      schema: {
        params: SlugParams,
        tags: ['Verpflegung'],
        summary: 'Übersicht über Verpflegungs-Bons für das OK',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) {
        return reply.status(404).send({ error: 'Anlass nicht gefunden' });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ATTENDANCE && !flags.isManager) {
        return reply.status(403).send({ error: 'Keine Berechtigung für die Verpflegungs-Übersicht' });
      }

      return getCateringOverview(fastify.prisma, {
        eventId: event.id,
        enabled: event.cateringTokensEnabled,
        tokenItems: event.cateringTokenItems ?? [...DEFAULT_CATERING_TOKEN_ITEMS],
        earlyHours: event.cateringEarlyHours ?? DEFAULT_CATERING_EARLY_HOURS,
      });
    }
  );

  // Helfer-Anzahl für die automatische Tranchen-Berechnung ermitteln
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/catering-batches/count-helpers',
    {
      schema: {
        params: SlugParams,
        tags: ['Verpflegung'],
        summary: 'Anzahl angemeldeter Helfenden und Schichtleitungen ermitteln',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await findEvent(request.tenant?.id, request.params.slug, request.user.id);
      if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ATTENDANCE && !flags.isManager) {
        return reply.status(403).send({ error: 'Keine Berechtigung' });
      }

      const [signupsCount, responsiblesCount] = await Promise.all([
        fastify.prisma.shiftSignup.count({
          where: { shift: { eventId: event.id } },
        }),
        fastify.prisma.shiftResponsible.count({
          where: { shift: { eventId: event.id } },
        }),
      ]);

      return {
        totalHelpersCount: signupsCount + responsiblesCount,
        signupsCount,
        responsiblesCount,
      };
    }
  );

  // Alle Tranchen eines Anlasses abrufen
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/catering-batches',
    {
      schema: {
        params: SlugParams,
        tags: ['Verpflegung'],
        summary: 'Alle Druck-Tranchen physischer Bons abrufen',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await findEvent(request.tenant?.id, request.params.slug, request.user.id);
      if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ATTENDANCE && !flags.isManager) {
        return reply.status(403).send({ error: 'Keine Berechtigung' });
      }

      return getEventCateringBatches(fastify.prisma, event.id);
    }
  );

  // Neue Tranche anlegen
  fastify.post<{ Params: { slug: string }; Body: unknown }>(
    '/api/events/:slug/catering-batches',
    {
      schema: {
        params: SlugParams,
        body: CreateCateringBatchSchema,
        tags: ['Verpflegung'],
        summary: 'Neue Druck-Tranche für physische Bons generieren',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await findEvent(request.tenant?.id, request.params.slug, request.user.id);
      if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ATTENDANCE && !flags.isManager) {
        return reply.status(403).send({ error: 'Keine Berechtigung' });
      }

      const input = request.body as z.output<typeof CreateCateringBatchSchema>;

      // Die Adresse landet gedruckt auf den Bons: nur die eigene Domain, nie ungeprüfte Header übernehmen
      const baseUrl = cateringBaseUrl(request.headers.host, request.tenant?.slug ?? null, request.tenant?.organization);

      const created = await createCateringBatch(fastify.prisma, {
        eventId: event.id,
        title: input.title,
        mode: input.mode,
        cardCount: input.cardCount,
        baseUrl,
      });

      return reply.status(201).send(created);
    }
  );

  // A4-PDF einer Tranche herunterladen
  fastify.get<{ Params: { slug: string; batchId: string } }>(
    '/api/events/:slug/catering-batches/:batchId/pdf',
    {
      schema: {
        params: BatchParams,
        tags: ['Verpflegung'],
        summary: 'A4-Druckbogen als PDF herunterladen',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await findEvent(request.tenant?.id, request.params.slug, request.user.id);
      if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ATTENDANCE && !flags.isManager) {
        return reply.status(403).send({ error: 'Keine Berechtigung' });
      }

      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const tenant = request.tenant;

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generateBatchPdf(fastify.prisma, {
          eventId: event.id,
          batchId: request.params.batchId,
          eventUrl: eventUrl(tenant.slug, event.slug, tenant.organization),
          // Gleiche Farben, gleicher Stil und gleiches Logo wie der Check-in-QR-Code
          branding: {
            color: tenant.qrCustomColors && tenant.qrColorPrimary ? tenant.qrColorPrimary : tenant.primaryColor,
            secondaryColor:
              tenant.qrCustomColors && tenant.qrColorSecondary ? tenant.qrColorSecondary : tenant.secondaryColor,
            qrStyle: (tenant.qrStyle as 'CORNERS' | 'GRADIENT' | 'SOLID') || 'CORNERS',
            logoUrl: event.logoUrl || tenant.logoUrl,
          },
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'Tranche nicht gefunden') {
          return reply.status(404).send({ error: err.message });
        }
        throw err;
      }

      // Enthält einlösbare Bon-Codes: nicht zwischenspeichern
      reply.header('Cache-Control', 'no-store');
      reply.header('Content-Type', 'application/pdf');
      reply.header(
        'Content-Disposition',
        `inline; filename="bons-${event.slug}-${request.params.batchId.slice(0, 8)}.pdf"`
      );
      return reply.send(pdfBuffer);
    }
  );

  // Tranche sperren / entsperren
  fastify.patch<{ Params: { slug: string; batchId: string } }>(
    '/api/events/:slug/catering-batches/:batchId/toggle-block',
    {
      schema: {
        params: BatchParams,
        tags: ['Verpflegung'],
        summary: 'Tranche sperren oder wieder freigeben',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await findEvent(request.tenant?.id, request.params.slug, request.user.id);
      if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ATTENDANCE && !flags.isManager) {
        return reply.status(403).send({ error: 'Keine Berechtigung' });
      }

      return toggleBatchBlocked(fastify.prisma, {
        eventId: event.id,
        batchId: request.params.batchId,
      });
    }
  );

  // Kartendaten beim Kamerascan abrufen (für Standpersonal)
  fastify.get<{ Params: { slug: string }; Querystring: { code?: string } }>(
    '/api/events/:slug/catering-scan',
    {
      schema: {
        params: SlugParams,
        querystring: ScanQuery,
        tags: ['Verpflegung'],
        summary: 'Physischen Bon per Scan-Code abrufen',
      },
      // Anmeldung ist freiwillig: Standpersonal ohne Konto kommt mit dem Stand-PIN rein
      preHandler: [fastify.optionalAuthenticate],
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!request.tenant) return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });

      const staff = await authorizeStaff(
        request,
        reply,
        event,
        request.headers['x-staff-pin'] as string | undefined
      );
      if (!staff) return reply;

      const code = request.query.code?.trim();
      if (!code) return reply.status(400).send({ error: 'Code fehlt' });

      const card = await getPhysicalCardByCode(fastify.prisma, { eventId: event.id, code });
      if (!card) {
        return reply.status(404).send({ error: 'Ungültiger oder unbekannter Bon-Code' });
      }

      return card;
    }
  );

  // Artikel einer physischen Karte entwerten
  fastify.post<{ Params: { slug: string }; Body: unknown }>(
    '/api/events/:slug/catering-scan/redeem',
    {
      schema: {
        params: SlugParams,
        body: RedeemPhysicalTokenSchema,
        tags: ['Verpflegung'],
        summary: 'Artikel eines physischen Bons entwerten',
      },
      preHandler: [fastify.optionalAuthenticate],
    },
    async (request, reply) => {
      if (!request.tenant) return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });

      const input = request.body as z.output<typeof RedeemPhysicalTokenSchema>;

      const staff = await authorizeStaff(
        request,
        reply,
        event,
        (request.headers['x-staff-pin'] as string | undefined) || input.staffPin
      );
      if (!staff) return reply;

      try {
        return await redeemPhysicalTokens(fastify.prisma, {
          eventId: event.id,
          code: input.code,
          tokenId: input.tokenId,
          redeemAll: input.redeemAll,
          redeemedByName: staff.name,
        });
      } catch (err) {
        return reply.status(400).send({
          error: err instanceof Error ? err.message : 'Entwertung fehlgeschlagen',
        });
      }
    }
  );
};

export default cateringRoutes;
