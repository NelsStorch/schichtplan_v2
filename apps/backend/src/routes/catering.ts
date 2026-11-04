import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { RedeemCateringTokenSchema } from '@schichtplan/shared';
import { managerFlags } from '../services/eventAccess.js';
import { personLabel } from '../services/attendance.js';
import {
  getCateringOverview,
  getHelperCateringTokens,
  isTokenAvailableNow,
  tokenAvailableFrom,
} from '../services/cateringTokens.js';

export const cateringRoutes: FastifyPluginAsync = async (fastify) => {
  async function findEvent(tenantId: string, slug: string) {
    return fastify.prisma.event.findUnique({
      where: { departmentId_slug: { departmentId: tenantId, slug } },
      include: { organizers: true },
    });
  }

  // Eigene Verpflegungs- und Getränke-Tokens für einen Anlass abrufen
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/my-catering-tokens',
    {
      schema: {
        tags: ['Verpflegung'],
        summary: 'Eigene Verpflegungs-Tokens für einen Anlass abrufen',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const tokens = await getHelperCateringTokens(fastify.prisma, event.id, request.user.id);
      return tokens;
    }
  );

  // Token entwerten (durch Helfer via Swipe oder durch das OK)
  fastify.post<{ Params: { slug: string; tokenId: string }; Body: { force?: boolean } }>(
    '/api/events/:slug/catering-tokens/:tokenId/redeem',
    {
      schema: {
        tags: ['Verpflegung'],
        summary: 'Verpflegungs-Token entwerten',
        description: 'Entwertet einen Verpflegungs- oder Getränkegutschein am Stand.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
          tokenId: z.string().uuid().describe('ID des Tokens'),
        }),
        body: RedeemCateringTokenSchema.optional(),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const token = await fastify.prisma.cateringToken.findUnique({
        where: { id: request.params.tokenId },
        include: {
          signup: {
            include: {
              shift: true,
              task: true,
              user: { select: { firstName: true, lastName: true, ceviName: true } },
            },
          },
        },
      });

      if (!token || token.signup.shift.eventId !== event.id) {
        return reply.status(404).send({ error: 'Gutschein nicht gefunden' });
      }

      if (token.status === 'REDEEMED') {
        return reply.status(409).send({
          error: `Dieser Gutschein wurde bereits am ${token.redeemedAt ? new Date(token.redeemedAt).toLocaleTimeString('de-CH') : ''} entwertet.`,
          code: 'ALREADY_REDEEMED',
        });
      }

      if (token.status === 'CANCELLED') {
        return reply.status(400).send({
          error: 'Dieser Gutschein ist storniert.',
          code: 'TOKEN_CANCELLED',
        });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      const isOwner = token.signup.userId === request.user.id;
      const isManager = flags.can.ATTENDANCE || flags.isManager;

      if (!isOwner && !isManager) {
        return reply.status(403).send({ error: 'Du bist nicht berechtigt, diesen Gutschein zu entwerten' });
      }

      const force = request.body?.force && isManager;
      const now = new Date();
      const earlyHours = event.cateringEarlyHours ?? 2;
      const isAvailable = isTokenAvailableNow(token.signup.shift.startTime, token.signup.attendance, earlyHours, now);

      if (!isAvailable && !force) {
        const availableFrom = tokenAvailableFrom(token.signup.shift.startTime, earlyHours);
        return reply.status(400).send({
          error: `Dieser Gutschein ist erst ab ${availableFrom.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })} Uhr einlösbar.`,
          code: 'NOT_YET_AVAILABLE',
        });
      }

      const me = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { firstName: true, lastName: true, ceviName: true },
      });
      const redeemerName = isOwner ? personLabel(me) : `${personLabel(me)} (OK)`;

      const updated = await fastify.prisma.cateringToken.update({
        where: { id: token.id },
        data: {
          status: 'REDEEMED',
          redeemedAt: now,
          redeemedByName: redeemerName,
        },
      });

      return {
        id: updated.id,
        shiftSignupId: updated.shiftSignupId,
        shiftTitle: token.signup.shift.title,
        taskTitle: token.signup.task?.title || null,
        shiftStartTime: token.signup.shift.startTime.toISOString(),
        shiftEndTime: token.signup.shift.endTime.toISOString(),
        title: updated.title,
        status: updated.status as 'AVAILABLE' | 'REDEEMED' | 'CANCELLED',
        isAvailableNow: true,
        availableFrom: tokenAvailableFrom(token.signup.shift.startTime, earlyHours).toISOString(),
        redeemedAt: updated.redeemedAt?.toISOString() ?? null,
        redeemedByName: updated.redeemedByName,
      };
    }
  );

  // Verpflegungs-Übersicht für das OK (Kassensturz & Statistiken)
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/catering-overview',
    {
      schema: {
        tags: ['Verpflegung'],
        summary: 'Verpflegungs-Statistiken für das OK abrufen',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ATTENDANCE && !flags.isManager) {
        return reply.status(403).send({ error: 'Nur das OK hat Zugriff auf die Verpflegungs-Übersicht' });
      }

      const overview = await getCateringOverview(fastify.prisma, event.id);
      return overview;
    }
  );
};

export default cateringRoutes;
