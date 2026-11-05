import { FastifyPluginAsync } from 'fastify';
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
} from '@schichtplan/shared';

export const cateringRoutes: FastifyPluginAsync = async (fastify) => {
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
              user: { select: { firstName: true, lastName: true, ceviName: true } },
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
            select: { firstName: true, lastName: true, ceviName: true },
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

      const updated = await fastify.prisma.cateringToken.update({
        where: { id: token.id },
        data: {
          status: 'REDEEMED',
          redeemedAt: now,
          redeemedByName: redeemerName,
        },
      });

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
              user: { select: { firstName: true, lastName: true, ceviName: true } },
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
            select: { firstName: true, lastName: true, ceviName: true },
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

      const parsed = CreateCateringBatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Ungültige Eingabe' });
      }

      const host = request.headers.host || 'cevi-schichtplan.ch';
      const proto = (request.headers['x-forwarded-proto'] as string) || 'https';
      const baseUrl = `${proto}://${host}`;

      const created = await createCateringBatch(fastify.prisma, {
        eventId: event.id,
        title: parsed.data.title,
        mode: parsed.data.mode,
        cardCount: parsed.data.cardCount,
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

      const host = request.headers.host || 'cevi-schichtplan.ch';
      const proto = (request.headers['x-forwarded-proto'] as string) || 'https';
      const baseUrl = `${proto}://${host}`;

      const pdfBuffer = await generateBatchPdf(fastify.prisma, {
        eventId: event.id,
        batchId: request.params.batchId,
        baseUrl,
      });

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
  fastify.get<{ Params: { slug: string }; Querystring: { code: string; pin?: string } }>(
    '/api/events/:slug/catering-scan',
    {
      schema: {
        tags: ['Verpflegung'],
        summary: 'Physischen Bon per Scan-Code abrufen',
      },
    },
    async (request, reply) => {
      const event = await fastify.prisma.event.findFirst({
        where: { slug: request.params.slug },
        include: { organizers: true },
      });
      if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });

      let isAuthorized = false;

      try {
        await fastify.authenticate(request, reply);
        if (request.user) {
          const flags = await managerFlags(fastify.prisma, event, request.user);
          if (flags.isManager || flags.can.ATTENDANCE) {
            isAuthorized = true;
          }
        }
      } catch {
        // Nicht eingeloggt
      }

      if (!isAuthorized) {
        const staffPin =
          (request.headers['x-staff-pin'] as string | undefined) || request.query.pin;

        if (event.cateringStaffPin && event.cateringStaffPin.trim().length > 0) {
          if (!staffPin || staffPin.trim() !== event.cateringStaffPin.trim()) {
            return reply.status(401).send({
              error: 'Stand-PIN erforderlich oder falsch',
              needsPin: true,
              eventTitle: event.title,
            });
          }
          isAuthorized = true;
        } else {
          isAuthorized = true;
        }
      }

      const code = request.query.code;
      if (!code) return reply.status(400).send({ error: 'Code fehlt' });

      const card = await getPhysicalCardByCode(fastify.prisma, {
        eventId: event.id,
        code,
      });

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
        tags: ['Verpflegung'],
        summary: 'Artikel eines physischen Bons entwerten',
      },
    },
    async (request, reply) => {
      const event = await fastify.prisma.event.findFirst({
        where: { slug: request.params.slug },
        include: { organizers: true },
      });
      if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });

      const parsed = RedeemPhysicalTokenSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Ungültige Eingabe' });
      }

      let isAuthorized = false;
      let authorizedName = 'Standpersonal';

      try {
        await fastify.authenticate(request, reply);
        if (request.user) {
          const flags = await managerFlags(fastify.prisma, event, request.user);
          if (flags.isManager || flags.can.ATTENDANCE) {
            isAuthorized = true;
            const staffUser = await fastify.prisma.user.findUnique({
              where: { id: request.user.id },
              select: { ceviName: true, firstName: true },
            });
            authorizedName = staffUser?.ceviName || staffUser?.firstName || 'OK';
          }
        }
      } catch {
        // Nicht eingeloggt
      }

      if (!isAuthorized) {
        const staffPin =
          (request.headers['x-staff-pin'] as string | undefined) || parsed.data.staffPin;

        if (event.cateringStaffPin && event.cateringStaffPin.trim().length > 0) {
          if (!staffPin || staffPin.trim() !== event.cateringStaffPin.trim()) {
            return reply.status(401).send({
              error: 'Stand-PIN erforderlich oder falsch',
              needsPin: true,
            });
          }
          isAuthorized = true;
        } else {
          isAuthorized = true;
        }
      }

      try {
        const updated = await redeemPhysicalTokens(fastify.prisma, {
          eventId: event.id,
          code: parsed.data.code,
          tokenId: parsed.data.tokenId,
          redeemAll: parsed.data.redeemAll,
          redeemedByName: authorizedName,
        });

        return updated;
      } catch (err) {
        return reply.status(400).send({
          error: err instanceof Error ? err.message : 'Entwertung fehlgeschlagen',
        });
      }
    }
  );
};

export default cateringRoutes;
