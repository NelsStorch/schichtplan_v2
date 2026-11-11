import { FastifyPluginAsync } from 'fastify';
import { Prisma, } from '../../db.js';
import { z } from 'zod';
import {
  ConfirmDeleteSchema,
  AdminUpdateEventSchema,
  type AdminEventListDto,
} from '@schichtplan/shared';
import { recordAdminAction } from '../../services/adminAudit.js';
import { EventListQuerySchema, eventSelect, toEventItems, } from './shared.js';

/** Anlässe aller Abteilungen (nur globale Admins, siehe guard) */
const adminEventRoutes: FastifyPluginAsync = async (fastify) => {
  const guard = { preHandler: [fastify.requireGlobalAdmin] };

  // ---------------------------------------------------------------------------
  // Anlässe
  // ---------------------------------------------------------------------------

  fastify.get(
    '/api/admin/events',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Alle Anlässe plattformweit durchsuchen (Admin)',
        description: 'Paginierte Liste aller Anlässe mit Filter nach Zeitraum, Status oder Abteilung.',
        security: [{ bearerAuth: [] }],
        querystring: EventListQuerySchema,
      },
    },
    async (request, _reply) => {
    const queryInput = request.query as z.output<typeof EventListQuerySchema>;
    const { q, departmentId, when, page, pageSize } = queryInput;
    const now = new Date();

    const terms = (q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
    const where: Prisma.EventWhereInput = {
      AND: [
        ...terms.map((term) => ({
          OR: [
            { title: { contains: term, mode: 'insensitive' as const } },
            { slug: { contains: term, mode: 'insensitive' as const } },
            { department: { name: { contains: term, mode: 'insensitive' as const } } },
          ],
        })),
        ...(departmentId ? [{ departmentId }] : []),
        ...(when === 'upcoming'
          ? [{ endDate: { gte: now } }]
          : when === 'past'
            ? [{ endDate: { lt: now } }]
            : when === 'drafts'
              ? [{ isPublished: false }]
              : when === 'signup_closed'
                ? [{ allowPublicSignup: false }]
                : when === 'urgent'
                  ? [{ endDate: { gte: now }, isPublished: true }]
                  : []),
      ],
    };

    const [total, rows] = await fastify.prisma.$transaction([
      fastify.prisma.event.count({ where }),
      fastify.prisma.event.findMany({
        where,
        orderBy: [{ startDate: when === 'upcoming' ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: eventSelect,
      }),
    ]);

    const result: AdminEventListDto = {
      items: await toEventItems(fastify.prisma, rows),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
    return result;
  });

  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/events/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Anlass-Status ändern (Admin)',
        description: 'Schaltet Veröffentlichung oder öffentliche Anmeldung eines Anlasses um.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID des Anlasses'),
        }),
        body: AdminUpdateEventSchema,
      },
    },
    async (request, reply) => {
    const input = request.body as z.output<typeof AdminUpdateEventSchema>;

    const updated = await fastify.prisma.event
      .update({
        where: { id: request.params.id },
        data: input,
        select: { id: true, title: true, department: { select: { name: true } } },
      })
      .catch(() => null);
    if (!updated) return reply.status(404).send({ error: 'Anlass nicht gefunden' });

    await recordAdminAction(fastify.prisma, request, {
      action: 'EVENT_UPDATE',
      targetType: 'EVENT',
      targetId: updated.id,
      targetLabel: `${updated.title} (${updated.department.name})`,
      details: { changes: input },
    });
    return { success: true };
  });

  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/events/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Anlass löschen (Admin)',
        description: 'Löscht einen Anlass samt Schichten und Eintragungen (Bestätigung des Slugs erforderlich).',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID des Anlasses'),
        }),
        body: ConfirmDeleteSchema,
      },
    },
    async (request, reply) => {
    const input = request.body as z.output<typeof ConfirmDeleteSchema>;

    const event = await fastify.prisma.event
      .findUnique({
        where: { id: request.params.id },
        select: { id: true, slug: true, title: true, departmentId: true, department: { select: { name: true } } },
      })
      .catch(() => null);
    if (!event) return reply.status(404).send({ error: 'Anlass nicht gefunden' });
    if (input.confirm !== event.slug) {
      return reply.status(400).send({ error: 'Zur Bestätigung das Kürzel des Anlasses genau eintippen.' });
    }

    // Kaskadiert zu Schichten, Eintragungen, OK, Fragen, Zugangs-Links, Protokoll und Nachrichten
    await fastify.prisma.event.delete({ where: { id: event.id } });

    await recordAdminAction(fastify.prisma, request, {
      action: 'EVENT_DELETE',
      targetType: 'EVENT',
      targetId: event.id,
      targetLabel: `${event.title} (${event.department.name})`,
      details: { slug: event.slug, departmentId: event.departmentId },
    });
    return { success: true };
  });
};

export default adminEventRoutes;
