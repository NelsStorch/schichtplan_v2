import { z } from 'zod';
import { shiftDisplayTitle } from '../../services/shiftDto.js';
import { FastifyPluginAsync } from 'fastify';
import type { Prisma, } from '../../db.js';
import {
  AddEventOrganizerSchema,
  SetDayResponsiblesSchema,
  UnregisterHelperSchema,
  type AttendanceStatus,
  type ShiftSignupLogAction,
} from '@schichtplan/shared';
import {
  managerFlags,
} from '../../services/eventAccess.js';
import { resolveOrganizerUser } from '../../services/nicknameLogin.js';
import {
  UNRELATED_PERSON_ERROR,
  allUsersRelatedToEvent,
} from '../../services/departmentVisibility.js';

import { toResponsiblePersonDto, } from './shared.js';

/** OK-Team, Tagesverantwortliche, Helfende abmelden und Eintragungsprotokoll */
const eventTeamRoutes: FastifyPluginAsync = async (fastify) => {
  // Tagesverantwortliche setzen (Abteilungsleitung ODER Event-OK)
  fastify.put<{ Params: { slug: string; dayDate: string } }>(
    '/api/events/:slug/days/:dayDate/responsibles',
    {
      schema: {
        tags: ['Events'],
        summary: 'Tagesverantwortliche festlegen',
        description: 'Weist bestimmten Benutzern die Tagesverantwortung für einen Kalendertag des Anlasses zu.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
          dayDate: z.string().describe('Kalendertag im Format YYYY-MM-DD'),
        }),
        body: SetDayResponsiblesSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      const { slug, dayDate } = request.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) {
        return reply.status(400).send({ error: 'Ungültiges Datumsformat (erwartet YYYY-MM-DD)' });
      }

      const event = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug,
          },
        },
        include: { organizers: true },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.SHIFTS) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Verwalten der Tagesverantwortlichen' });
      }

      const input = request.body as z.output<typeof SetDayResponsiblesSchema>;

      if (!(await allUsersRelatedToEvent(fastify.prisma, event.id, input.userIds))) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
      }

      await fastify.prisma.$transaction(async (tx) => {
        await tx.eventDayResponsible.deleteMany({
          where: {
            eventId: event.id,
            dayDate,
          },
        });
        if (input.userIds.length > 0) {
          await tx.eventDayResponsible.createMany({
            data: input.userIds.map((userId) => ({
              eventId: event.id,
              dayDate,
              userId,
            })),
          });
        }
      });

      const updated = await fastify.prisma.eventDayResponsible.findMany({
        where: {
          eventId: event.id,
          dayDate,
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, nickname: true, phone: true, email: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return {
        dayDate,
        responsibles: updated.map((r) =>
          toResponsiblePersonDto(r.user, event.contactVisibility || 'BOTH')
        ),
      };
    }
  );

  // Mitglied zum Event-OK hinzufügen
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/organizers',
    {
      schema: {
        tags: ['Events'],
        summary: 'OK-Mitglied hinzufügen',
        description: 'Fügt eine Person zum Organisationskomitee (OK) des Anlasses hinzu.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: AddEventOrganizerSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      const event = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug: request.params.slug,
          },
        },
        include: { organizers: true },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      // Nur Abteilungsleitung oder OK_LEAD darf OK-Mitglieder verwalten
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ORGANIZERS) {
        return reply.status(403).send({ error: 'Keine Berechtigung zur OK-Verwaltung' });
      }

      const input = request.body as z.output<typeof AddEventOrganizerSchema>;

      const { userId, ceviName, email, role, roleTitle } = input;

      // Benutzer finden anhand ID, E-Mail oder Cevi-Name (nur Konten mit Cevi.DB oder Passwort)
      const resolved = await resolveOrganizerUser(fastify.prisma, request.tenant.id, { userId, ceviName, email });
      if ('error' in resolved) {
        return reply.status(resolved.status).send({ error: resolved.error });
      }
      const targetUser = resolved.user;

      const organizer = await fastify.prisma.eventOrganizer.upsert({
        where: {
          eventId_userId: {
            eventId: event.id,
            userId: targetUser.id,
          },
        },
        update: {
          role,
          roleTitle: roleTitle !== undefined ? roleTitle.trim() || null : undefined,
        },
        create: {
          eventId: event.id,
          userId: targetUser.id,
          role,
          roleTitle: roleTitle?.trim() || 'OK-Mitglied',
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, nickname: true },
          },
        },
      });

      return {
        id: organizer.id,
        userId: organizer.userId,
        displayName: organizer.user.nickname
          ? `${organizer.user.firstName} / ${organizer.user.nickname}`
          : `${organizer.user.firstName} ${organizer.user.lastName}`,
        role: organizer.role,
        roleTitle: organizer.roleTitle,
      };
    }
  );

  // Mitglied aus dem Event-OK entfernen (Abteilungsleitung oder OK-Leitung)
  fastify.delete<{ Params: { slug: string; organizerId: string } }>(
    '/api/events/:slug/organizers/:organizerId',
    {
      schema: {
        tags: ['Events'],
        summary: 'OK-Mitglied entfernen',
        description: 'Entfernt eine Person aus dem Organisationskomitee (OK).',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
          organizerId: z.string().uuid().describe('ID des OK-Eintrags'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { organizerId } = request.params;

      const existing = await fastify.prisma.eventOrganizer.findUnique({
        where: { id: organizerId },
        include: { event: { include: { organizers: true } } },
      });

      if (!existing || (request.tenant && existing.event.departmentId !== request.tenant.id)) {
        return reply.status(404).send({ error: 'OK-Mitglied nicht gefunden' });
      }

      const flags = await managerFlags(fastify.prisma, existing.event, request.user);
      if (!flags.can.ORGANIZERS) {
        return reply.status(403).send({ error: 'Keine Berechtigung zur OK-Verwaltung' });
      }

      await fastify.prisma.eventOrganizer.delete({
        where: { id: organizerId },
      });

      return { message: 'OK-Mitglied erfolgreich entfernt' };
    }
  );

  // Helfer komplett vom Event abmelden (aus allen Schichten dieses Events austragen)
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/unregister-helper',
    {
      schema: {
        tags: ['Events'],
        summary: 'Helfer komplett vom Anlass austragen',
        description: 'Trägt einen Helfer oder Gast aus ausnahmslos allen Schichten dieses Anlasses aus.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: UnregisterHelperSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      const event = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug: request.params.slug,
          },
        },
        include: { organizers: true },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.HELPERS) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Abmelden von Helfenden' });
      }

      const input = request.body as z.output<typeof UnregisterHelperSchema>;

      const { userId, guestName } = input;

      if (!userId && !guestName) {
        return reply.status(400).send({ error: 'userId oder guestName erforderlich' });
      }

      const whereClause: Prisma.ShiftSignupWhereInput = {
        shift: { eventId: event.id },
      };

      if (userId) {
        whereClause.userId = userId;
      } else if (guestName) {
        whereClause.guestName = { equals: guestName, mode: 'insensitive' };
      }

      const signupsToCancel = await fastify.prisma.shiftSignup.findMany({
        where: whereClause,
        include: {
          shift: true,
          task: true,
          user: {
            select: { id: true, firstName: true, lastName: true, nickname: true },
          },
        },
      });

      const deleted = await fastify.prisma.shiftSignup.deleteMany({
        where: whereClause,
      });

      // Im Aktivitäts-Protokoll festhalten
      if (signupsToCancel.length > 0) {
        try {
          const performerUser = request.user
            ? await fastify.prisma.user.findUnique({
                where: { id: request.user.id },
                select: { firstName: true, lastName: true, nickname: true },
              })
            : null;
          const performerName = performerUser
            ? (performerUser.nickname ? `${performerUser.firstName} / ${performerUser.nickname}` : `${performerUser.firstName} ${performerUser.lastName}`.trim())
            : null;
          const pLabel = performerName ? `${performerName} (OK)` : 'OK';

          await fastify.prisma.shiftSignupLog.createMany({
            data: signupsToCancel.map((su) => {
              const hName = su.user
                ? (su.user.nickname ? `${su.user.firstName} / ${su.user.nickname}` : `${su.user.firstName} ${su.user.lastName}`.trim())
                : (su.guestName || 'Gast');
              return {
                eventId: event.id,
                shiftId: su.shiftId,
                action: 'SIGNOFF',
                helperUserId: su.userId,
                helperName: hName,
                performedByUserId: request.user?.id || null,
                performedByName: pLabel,
                shiftTitle: shiftDisplayTitle(su.shift, su.task),
                shiftStartTime: su.shift.startTime,
                shiftEndTime: su.shift.endTime,
                taskTitle: su.task?.title || null,
              };
            }),
          });
        } catch (logErr) {
          request.log.error(logErr, 'Fehler beim Erstellen der Abmelde-Logs');
        }
      }

      return {
        message: `${deleted.count} Schichteintragung(en) erfolgreich entfernt`,
        deletedCount: deleted.count,
      };
    }
  );

  // Protokoll aller Schicht-Eintragungen und -Austragungen (Abteilungsleitung ODER Event-OK)
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/logs',
    {
      schema: {
        tags: ['Events'],
        summary: 'Schicht- und Helferprotokoll abrufen',
        description: 'Liefert den detaillierten Audit-Log über Einteilungen, Austragungen und Anwesenheitsänderungen.',
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

      const event = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug: request.params.slug,
          },
        },
        include: { organizers: true },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.isManager) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Einsehen des Protokolls' });
      }

      const logs = await fastify.prisma.shiftSignupLog.findMany({
        where: { eventId: event.id },
        orderBy: { createdAt: 'desc' },
        take: 300,
      });

      return logs.map((l) => ({
        id: l.id,
        eventId: l.eventId,
        shiftId: l.shiftId,
        action: l.action as ShiftSignupLogAction,
        helperUserId: l.helperUserId,
        helperName: l.helperName,
        performedByUserId: l.performedByUserId,
        performedByName: l.performedByName,
        shiftTitle: l.shiftTitle,
        shiftStartTime: l.shiftStartTime ? l.shiftStartTime.toISOString() : null,
        shiftEndTime: l.shiftEndTime ? l.shiftEndTime.toISOString() : null,
        taskTitle: l.taskTitle,
        attendance: l.attendance as AttendanceStatus | null,
        createdAt: l.createdAt.toISOString(),
      }));
    }
  );
};

export default eventTeamRoutes;
