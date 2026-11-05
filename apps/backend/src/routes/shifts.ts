import { z } from 'zod';
import { FastifyPluginAsync } from 'fastify';
import {
  addZurichDays,
  BulkShiftsSchema,
  CreateShiftSchema,
  CreateShiftSeriesSchema,
  calculateShiftSeriesIntervals,
  UpdateShiftSchema,
  type BulkShiftsResultDto,
} from '@schichtplan/shared';
import {
  managerFlags,
} from '../services/eventAccess.js';
import { UNRELATED_PERSON_ERROR, allUsersRelatedToEvent } from '../services/departmentVisibility.js';
import { syncEventRange } from '../services/eventRange.js';
import { EMAIL_REMINDER_MINUTES, PUSH_REMINDER_MINUTES, PLACEHOLDER_EMAIL_REGEX } from '@schichtplan/shared';
import { pastReminderMinutes, toResponsiblePersonDto } from '../services/shiftDto.js';
import { formatShiftTime, eventUrl } from '../services/shiftReminders.js';
import { sendShiftCancelledEmail } from '../services/email.js';

const shiftRoutes: FastifyPluginAsync = async (fastify) => {
  // Schicht erstellen (Admin, Planner oder Event-OK)
  fastify.post(
    '/api/shifts',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Einzelne Schicht erstellen',
        description: 'Erstellt eine neue Schicht mit Aufgaben und benötigten Plätzen für einen Anlass.',
        security: [{ bearerAuth: [] }],
        body: CreateShiftSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const parse = CreateShiftSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const {
        eventId,
        title,
        category,
        isSetupTeardown,
        startTime,
        endTime,
        requiredSlots: reqSlots,
        description,
        minAge,
        tasks,
        responsibleUserIds,
      } = parse.data;
      if (new Date(endTime) <= new Date(startTime)) {
        return reply.status(400).send({ error: 'Das Ende der Schicht muss nach dem Beginn liegen' });
      }

      // Event & Abteilung prüfen
      const event = await fastify.prisma.event.findUnique({
        where: { id: eventId },
        include: { organizers: true },
      });

      if (!event || (request.tenant && event.departmentId !== request.tenant.id)) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      // Prüfe Berechtigung: Abteilungsleitung, Planner oder Event-OK
      // Schichten planen: Abteilungsleitung, OK oder Recht «Schichten planen»
      const flags = await managerFlags(fastify.prisma, event, request.user);

      if (!flags.can.SHIFTS) {
        return reply
          .status(403)
          .send({ error: 'Keine Berechtigung zum Erstellen von Schichten für dieses Event' });
      }

      if (!(await allUsersRelatedToEvent(fastify.prisma, event.id, responsibleUserIds ?? []))) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
      }

      const hasValidTask = tasks && tasks.length > 0 && tasks.some((t) => t.title?.trim().length > 0);
      if (!title?.trim() && !hasValidTask) {
        return reply.status(400).send({ error: 'Bitte gib entweder einen Schichttitel oder mindestens eine Arbeit an.' });
      }

      const resolvedTasks =
        tasks && tasks.length > 0
          ? tasks
          : [
              {
                title: title?.trim() || 'Schicht',
                description: description || null,
                requiredSlots: reqSlots || 1,
                minAge: minAge || null,
                ageRequirementType: 'ALL' as const,
                taskDefinitionId: null,
              },
            ];

      const totalRequiredSlots = resolvedTasks.reduce((sum, t) => sum + (t.requiredSlots || 1), 0);

      const shift = await fastify.prisma.shift.create({
        data: {
          eventId,
          title: title?.trim() || null,
          category: category || null,
          isSetupTeardown: isSetupTeardown ?? false,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          requiredSlots: totalRequiredSlots,
          description: description || null,
          minAge: minAge || null,
          responsibles:
            responsibleUserIds && responsibleUserIds.length > 0
              ? {
                  create: responsibleUserIds.map((userId) => ({
                    userId,
                    sentEmailReminders: pastReminderMinutes(new Date(startTime), EMAIL_REMINDER_MINUTES),
                    sentPushReminders: pastReminderMinutes(new Date(startTime), PUSH_REMINDER_MINUTES),
                  })),
                }
              : undefined,
          tasks: {
            create: resolvedTasks.map((t) => ({
              taskDefinitionId: t.taskDefinitionId || null,
              title: t.title,
              description: t.description || null,
              requiredSlots: t.requiredSlots || 1,
              minAge: t.minAge || null,
              ageRequirementType: t.ageRequirementType || 'ALL',
            })),
          },
        },
        include: {
          tasks: {
            include: { signups: true },
          },
          responsibles: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, ceviName: true, phone: true, email: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await syncEventRange(fastify.prisma, eventId);

      return {
        ...shift,
        responsibles: shift.responsibles.map((r) =>
          toResponsiblePersonDto(r, event.contactVisibility || 'BOTH')
        ),
      };
    }
  );

  // Schicht-Serie erstellen (Raster-Planung für Stände und aufeinanderfolgende Schichten)
  fastify.post(
    '/api/shifts/series',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Schicht-Serie erstellen',
        description: 'Erstellt eine Reihe aufeinanderfolgender Schichten für Stände oder Stationen.',
        security: [{ bearerAuth: [] }],
        body: CreateShiftSeriesSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const parse = CreateShiftSeriesSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const {
        eventId,
        title,
        category,
        isSetupTeardown,
        startTime,
        endTime,
        durationMinutes,
        overlapMinutes,
        firstShiftIncludesOverlap,
        description,
        minAge,
        tasks,
        responsibleUserIds,
      } = parse.data;

      if (new Date(endTime) <= new Date(startTime)) {
        return reply.status(400).send({ error: 'Das Ende der Serie muss nach dem Beginn liegen' });
      }

      // Event & Abteilung prüfen
      const event = await fastify.prisma.event.findUnique({
        where: { id: eventId },
        include: { organizers: true },
      });

      if (!event || (request.tenant && event.departmentId !== request.tenant.id)) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      // Prüfe Berechtigung: Abteilungsleitung, Planner oder Event-OK
      // Schichten planen: Abteilungsleitung, OK oder Recht «Schichten planen»
      const flags = await managerFlags(fastify.prisma, event, request.user);

      if (!flags.can.SHIFTS) {
        return reply
          .status(403)
          .send({ error: 'Keine Berechtigung zum Erstellen von Schichten für dieses Event' });
      }

      if (!(await allUsersRelatedToEvent(fastify.prisma, event.id, responsibleUserIds ?? []))) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
      }

      const intervals = calculateShiftSeriesIntervals({
        startTime,
        endTime,
        durationMinutes,
        overlapMinutes,
        firstShiftIncludesOverlap,
      });

      if (intervals.length === 0) {
        return reply.status(400).send({ error: 'Keine Schichten generiert. Zeitraum oder Dauer prüfen.' });
      }

      if (intervals.length > 50) {
        return reply.status(400).send({ error: 'Maximal 50 Schichten pro Serie erlaubt.' });
      }

      const hasValidTask = tasks && tasks.length > 0 && tasks.some((t) => t.title?.trim().length > 0);
      if (!title?.trim() && !hasValidTask) {
        return reply.status(400).send({ error: 'Bitte gib entweder einen Schichttitel oder mindestens eine Arbeit an.' });
      }

      const resolvedTasks =
        tasks && tasks.length > 0
          ? tasks
          : [
              {
                title: title?.trim() || 'Schicht',
                description: description || null,
                requiredSlots: 1,
                minAge: minAge || null,
                ageRequirementType: 'ALL' as const,
                taskDefinitionId: null,
              },
            ];

      const totalRequiredSlots = resolvedTasks.reduce((sum, t) => sum + (t.requiredSlots || 1), 0);

      const createdShifts = await fastify.prisma.$transaction(
        intervals.map((interval) =>
          fastify.prisma.shift.create({
            data: {
              eventId,
              title: title?.trim() || null,
              category: category || null,
              isSetupTeardown: isSetupTeardown ?? false,
              startTime: interval.startTime,
              endTime: interval.endTime,
              requiredSlots: totalRequiredSlots,
              description: description || null,
              minAge: minAge || null,
              responsibles:
                responsibleUserIds && responsibleUserIds.length > 0
                  ? {
                      create: responsibleUserIds.map((userId) => ({
                    userId,
                    sentEmailReminders: pastReminderMinutes(new Date(startTime), EMAIL_REMINDER_MINUTES),
                    sentPushReminders: pastReminderMinutes(new Date(startTime), PUSH_REMINDER_MINUTES),
                  })),
                    }
                  : undefined,
              tasks: {
                create: resolvedTasks.map((t) => ({
                  taskDefinitionId: t.taskDefinitionId || null,
                  title: t.title,
                  description: t.description || null,
                  requiredSlots: t.requiredSlots || 1,
                  minAge: t.minAge || null,
                  ageRequirementType: t.ageRequirementType || 'ALL',
                })),
              },
            },
            include: {
              tasks: {
                include: { signups: true },
              },
              responsibles: {
                include: {
                  user: {
                    select: { id: true, firstName: true, lastName: true, ceviName: true, phone: true, email: true },
                  },
                },
                orderBy: { createdAt: 'asc' },
              },
            },
          })
        )
      );
      await syncEventRange(fastify.prisma, eventId);

      return {
        count: createdShifts.length,
        shifts: createdShifts.map((shift) => ({
          ...shift,
          responsibles: shift.responsibles.map((r) =>
            toResponsiblePersonDto(r, event.contactVisibility || 'BOTH')
          ),
        })),
      };
    }
  );

  // Schicht bearbeiten (Admin, Planner oder Event-OK)
  fastify.patch<{ Params: { id: string } }>(
    '/api/shifts/:id',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Schicht bearbeiten',
        description: 'Aktualisiert Zeiten, Aufgaben, Plätze oder Schichtleiter einer bestehenden Schicht.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Schicht'),
        }),
        body: UpdateShiftSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const shiftId = request.params.id;
      const parse = UpdateShiftSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const shift = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          event: { include: { organizers: true } },
          tasks: true,
        },
      });

      if (!shift || (request.tenant && shift.event.departmentId !== request.tenant.id)) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      // Berechtigung prüfen
      // Schichten planen: Abteilungsleitung, OK oder Recht «Schichten planen»
      const flags = await managerFlags(fastify.prisma, shift.event, request.user);

      if (!flags.can.SHIFTS) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Bearbeiten dieser Schicht' });
      }

      const { title, category, isSetupTeardown, startTime, endTime, description, minAge, tasks, responsibleUserIds } = parse.data;
      if (!(await allUsersRelatedToEvent(fastify.prisma, shift.eventId, responsibleUserIds ?? []))) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
      }
      if (new Date(endTime ?? shift.endTime) <= new Date(startTime ?? shift.startTime)) {
        return reply.status(400).send({ error: 'Das Ende der Schicht muss nach dem Beginn liegen' });
      }

      // Falls tasks übergeben wurden: Synchronisieren
      if (tasks && tasks.length > 0) {
        const totalSlots = tasks.reduce((sum, t) => sum + (t.requiredSlots || 1), 0);

        await fastify.prisma.$transaction(async (tx) => {
          // Bestehende Tasks ermitteln
          const existingTasks = await tx.shiftTask.findMany({ where: { shiftId } });
          const incomingIds = tasks.filter((t) => t.id).map((t) => t.id as string);

          // Lösche Tasks die nicht mehr in der Liste sind
          const toDelete = existingTasks.filter((et) => !incomingIds.includes(et.id));
          if (toDelete.length > 0) {
            await tx.shiftTask.deleteMany({
              where: { id: { in: toDelete.map((t) => t.id) } },
            });
          }

          // Update oder Create
          for (const t of tasks) {
            if (t.id && existingTasks.some((et) => et.id === t.id)) {
              await tx.shiftTask.update({
                where: { id: t.id },
                data: {
                  taskDefinitionId: t.taskDefinitionId !== undefined ? t.taskDefinitionId : undefined,
                  title: t.title,
                  description: t.description || null,
                  requiredSlots: t.requiredSlots || 1,
                  minAge: t.minAge || null,
                  ageRequirementType: t.ageRequirementType || 'ALL',
                },
              });
            } else {
              await tx.shiftTask.create({
                data: {
                  shiftId,
                  taskDefinitionId: t.taskDefinitionId || null,
                  title: t.title,
                  description: t.description || null,
                  requiredSlots: t.requiredSlots || 1,
                  minAge: t.minAge || null,
                  ageRequirementType: t.ageRequirementType || 'ALL',
                },
              });
            }
          }

          // Update Shift Details
          await tx.shift.update({
            where: { id: shiftId },
            data: {
              title: title !== undefined ? (title?.trim() || null) : undefined,
              category: category !== undefined ? (category || null) : undefined,
              isSetupTeardown: isSetupTeardown !== undefined ? isSetupTeardown : undefined,
              startTime: startTime ? new Date(startTime) : undefined,
              endTime: endTime ? new Date(endTime) : undefined,
              description: description !== undefined ? description : undefined,
              minAge: minAge !== undefined ? minAge : undefined,
              requiredSlots: totalSlots,
            },
          });
        });
      } else {
        await fastify.prisma.shift.update({
          where: { id: shiftId },
          data: {
            title: title !== undefined ? (title?.trim() || null) : undefined,
            category: category !== undefined ? (category || null) : undefined,
            isSetupTeardown: isSetupTeardown !== undefined ? isSetupTeardown : undefined,
            startTime: startTime ? new Date(startTime) : undefined,
            endTime: endTime ? new Date(endTime) : undefined,
            description: description !== undefined ? description : undefined,
            minAge: minAge !== undefined ? minAge : undefined,
            requiredSlots: parse.data.requiredSlots !== undefined ? parse.data.requiredSlots : undefined,
          },
        });
      }

      if (startTime || endTime) {
        await syncEventRange(fastify.prisma, shift.eventId);
      }

      if (startTime && new Date(startTime).getTime() !== shift.startTime.getTime()) {
        const newStart = new Date(startTime);
        const pastEmail = pastReminderMinutes(newStart, EMAIL_REMINDER_MINUTES);
        const pastPush = pastReminderMinutes(newStart, PUSH_REMINDER_MINUTES);

        await fastify.prisma.shiftSignup.updateMany({
          where: { shiftId },
          data: {
            sentEmailReminders: pastEmail,
            sentPushReminders: pastPush,
          },
        });

        if (responsibleUserIds === undefined) {
          await fastify.prisma.shiftResponsible.updateMany({
            where: { shiftId },
            data: {
              sentEmailReminders: pastEmail,
              sentPushReminders: pastPush,
            },
          });
        }
      }

      if (responsibleUserIds !== undefined) {
        await fastify.prisma.shiftResponsible.deleteMany({ where: { shiftId } });
        if (responsibleUserIds.length > 0) {
          await fastify.prisma.shiftResponsible.createMany({
            data: responsibleUserIds.map((userId) => ({
              shiftId,
              userId,
              sentEmailReminders: pastReminderMinutes(startTime ? new Date(startTime) : shift.startTime, EMAIL_REMINDER_MINUTES),
              sentPushReminders: pastReminderMinutes(startTime ? new Date(startTime) : shift.startTime, PUSH_REMINDER_MINUTES),
            })),
          });
        }
      }

      const updated = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          tasks: { include: { signups: true } },
          responsibles: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, ceviName: true, phone: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          // Nur Namen: das ganze User-Objekt enthielte Passwort-Hash, E-Mail und Cevi.DB-Rohdaten
          signups: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, ceviName: true } },
              task: true,
            },
          },
        },
      });

      if (!updated) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      return {
        ...updated,
        responsibles: updated.responsibles.map((r) =>
          toResponsiblePersonDto(r, shift.event.contactVisibility || 'BOTH')
        ),
      };
    }
  );

  // Schicht löschen (Admin, Planner oder Event-OK)
  fastify.delete<{ Params: { id: string }; Querystring: { notify?: string } }>(
    '/api/shifts/:id',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Schicht löschen',
        description: 'Löscht eine Schicht samt Aufgaben und Eintragungen. Helfende können optional per E-Mail informiert werden.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Schicht'),
        }),
        querystring: z.object({
          notify: z.string().optional().describe('Helfende per E-Mail benachrichtigen ("true" oder "false", Standard: true)'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const shiftId = request.params.id;
      const notify = request.query.notify !== 'false';

      const shift = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          event: {
            include: {
              organizers: true,
              department: { select: { slug: true, name: true, primaryColor: true } },
            },
          },
          signups: {
            include: {
              user: { select: { id: true, email: true, emailVerified: true, ceviName: true, firstName: true } },
              task: { select: { title: true } },
            },
          },
        },
      });

      if (!shift || (request.tenant && shift.event.departmentId !== request.tenant.id)) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      // Schichten planen: Abteilungsleitung, OK oder Recht «Schichten planen»
      const flags = await managerFlags(fastify.prisma, shift.event, request.user);

      if (!flags.can.SHIFTS) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Löschen dieser Schicht' });
      }

      // Helfende benachrichtigen, wenn notify aktiv ist
      if (notify && shift.signups.length > 0) {
        const timeFormatted = formatShiftTime(shift.startTime, shift.endTime);
        const targetUrl = eventUrl(shift.event.department.slug, shift.event.slug);

        for (const s of shift.signups) {
          const shiftTitle = shift.title?.trim()
            ? (s.task?.title && s.task.title !== shift.title ? `${shift.title} · ${s.task.title}` : shift.title)
            : (s.task?.title || 'Schicht');

          if (s.user?.email && s.user.emailVerified && !PLACEHOLDER_EMAIL_REGEX.test(s.user.email)) {
            void sendShiftCancelledEmail({
              to: s.user.email,
              name: s.user.ceviName || s.user.firstName,
              eventTitle: shift.event.title,
              shiftTitle,
              timeRangeFormatted: timeFormatted,
              eventUrl: targetUrl,
              departmentName: shift.event.department.name,
              accentColor: shift.event.department.primaryColor,
            }).catch((err) => request.log.error(err, 'Absage-Mail fehlgeschlagen'));
          } else if (!s.userId && s.guestEmail?.trim() && s.guestEmail.includes('@')) {
            void sendShiftCancelledEmail({
              to: s.guestEmail.trim(),
              name: s.guestName?.trim() || 'Helfer*in',
              eventTitle: shift.event.title,
              shiftTitle,
              timeRangeFormatted: timeFormatted,
              eventUrl: targetUrl,
              departmentName: shift.event.department.name,
              accentColor: shift.event.department.primaryColor,
            }).catch((err) => request.log.error(err, 'Gast-Absage-Mail fehlgeschlagen'));
          }
        }
      }

      await fastify.prisma.shift.delete({
        where: { id: shiftId },
      });
      await syncEventRange(fastify.prisma, shift.eventId);

      return { message: 'Schicht erfolgreich gelöscht' };
    }
  );

  // Schicht duplizieren (Admin, Planner oder Event-OK)
  fastify.post<{ Params: { id: string } }>(
    '/api/shifts/:id/duplicate',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Schicht duplizieren',
        description: 'Erstellt eine Kopie einer Schicht mit identischen Aufgaben und Zeiten.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Schicht'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const shiftId = request.params.id;

      const shift = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          tasks: true,
          responsibles: true,
          event: { include: { organizers: true } },
        },
      });

      if (!shift || (request.tenant && shift.event.departmentId !== request.tenant.id)) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      // Schichten planen: Abteilungsleitung, OK oder Recht «Schichten planen»
      const flags = await managerFlags(fastify.prisma, shift.event, request.user);

      if (!flags.can.SHIFTS) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Duplizieren dieser Schicht' });
      }

      const body = (request.body as any) || {};
      const newStartTime = body.startTime ? new Date(body.startTime) : new Date(shift.startTime);
      const newEndTime = body.endTime ? new Date(body.endTime) : new Date(shift.endTime);

      const duplicated = await fastify.prisma.shift.create({
        data: {
          eventId: shift.eventId,
          title: body.title !== undefined ? body.title : (shift.title ? `${shift.title} (Kopie)` : ''),
          category: shift.category,
          isSetupTeardown: shift.isSetupTeardown,
          startTime: newStartTime,
          endTime: newEndTime,
          requiredSlots: shift.requiredSlots,
          description: shift.description,
          minAge: shift.minAge,
          responsibles:
            shift.responsibles.length > 0
              ? {
                  create: shift.responsibles.map((r) => ({
                    userId: r.userId,
                    sentEmailReminders: pastReminderMinutes(newStartTime, EMAIL_REMINDER_MINUTES),
                    sentPushReminders: pastReminderMinutes(newStartTime, PUSH_REMINDER_MINUTES),
                  })),
                }
              : undefined,
          tasks: {
            create: shift.tasks.map((t) => ({
              taskDefinitionId: t.taskDefinitionId || null,
              title: t.title,
              description: t.description,
              requiredSlots: t.requiredSlots,
              minAge: t.minAge,
              ageRequirementType: t.ageRequirementType,
            })),
          },
        },
        include: {
          tasks: true,
          responsibles: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, ceviName: true, phone: true, email: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await syncEventRange(fastify.prisma, shift.eventId);

      return {
        ...duplicated,
        responsibles: duplicated.responsibles.map((r) =>
          toResponsiblePersonDto(r, shift.event.contactVisibility || 'BOTH')
        ),
      };
    }
  );

  // Mehrere Schichten eines Anlasses auf einmal ändern (Abteilungsleitung, Planung oder Event-OK)
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/shifts/bulk',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Mehrere Schichten gleichzeitig bearbeiten',
        description: 'Führt Massenänderungen an Schichten eines Anlasses durch (Titel, Zeiten, Aufgaben, Schichtverantwortliche).',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: BulkShiftsSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await fastify.prisma.event.findUnique({
        where: { departmentId_slug: { departmentId: request.tenant.id, slug: request.params.slug } },
        include: {
          organizers: true,
          department: { select: { slug: true, name: true, primaryColor: true } },
        },
      });
      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.SHIFTS) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Bearbeiten der Schichten' });
      }

      const parse = BulkShiftsSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }
      const shiftIds = [...new Set(parse.data.shiftIds)];
      const { action } = parse.data;

      const shifts = await fastify.prisma.shift.findMany({
        where: { id: { in: shiftIds }, eventId: event.id },
        include: { tasks: { include: { _count: { select: { signups: true } } } } },
      });
      if (shifts.length !== shiftIds.length) {
        return reply.status(400).send({ error: 'Eine Schicht gehört nicht zu diesem Anlass' });
      }

      const skipped: BulkShiftsResultDto['skipped'] = [];
      let updated = 0;

      await fastify.prisma.$transaction(async (tx) => {
        if (action.type === 'DELETE') {
          if (action.notify !== false) {
            const signupsToNotify = await tx.shiftSignup.findMany({
              where: { shiftId: { in: shiftIds } },
              include: {
                shift: true,
                user: { select: { id: true, email: true, emailVerified: true, ceviName: true, firstName: true } },
                task: { select: { title: true } },
              },
            });
            if (signupsToNotify.length > 0) {
              const targetUrl = eventUrl(event.department.slug, event.slug);
              for (const s of signupsToNotify) {
                const shiftTitle = s.shift.title?.trim()
                  ? (s.task?.title && s.task.title !== s.shift.title ? `${s.shift.title} · ${s.task.title}` : s.shift.title)
                  : (s.task?.title || 'Schicht');
                const timeFormatted = formatShiftTime(s.shift.startTime, s.shift.endTime);

                if (s.user?.email && s.user.emailVerified && !PLACEHOLDER_EMAIL_REGEX.test(s.user.email)) {
                  void sendShiftCancelledEmail({
                    to: s.user.email,
                    name: s.user.ceviName || s.user.firstName,
                    eventTitle: event.title,
                    shiftTitle,
                    timeRangeFormatted: timeFormatted,
                    eventUrl: targetUrl,
                    departmentName: event.department.name,
                    accentColor: event.department.primaryColor,
                  }).catch((err) => request.log.error(err, 'Bulk-Absage-Mail fehlgeschlagen'));
                } else if (!s.userId && s.guestEmail?.trim() && s.guestEmail.includes('@')) {
                  void sendShiftCancelledEmail({
                    to: s.guestEmail.trim(),
                    name: s.guestName?.trim() || 'Helfer*in',
                    eventTitle: event.title,
                    shiftTitle,
                    timeRangeFormatted: timeFormatted,
                    eventUrl: targetUrl,
                    departmentName: event.department.name,
                    accentColor: event.department.primaryColor,
                  }).catch((err) => request.log.error(err, 'Bulk-Gast-Absage-Mail fehlgeschlagen'));
                }
              }
            }
          }
          updated = (await tx.shift.deleteMany({ where: { id: { in: shiftIds } } })).count;
        } else if (action.type === 'MOVE') {
          const move = (d: Date) => new Date(addZurichDays(d, action.days).getTime() + action.minutes * 60 * 1000);
          for (const shift of shifts) {
            await tx.shift.update({
              where: { id: shift.id },
              data: { startTime: move(shift.startTime), endTime: move(shift.endTime) },
            });
            await tx.shiftSignup.updateMany({
              where: { shiftId: shift.id },
              data: { sentEmailReminders: [], sentPushReminders: [] },
            });
            await tx.shiftResponsible.updateMany({
              where: { shiftId: shift.id },
              data: { sentEmailReminders: [], sentPushReminders: [] },
            });
            updated++;
          }
        } else if (action.type === 'SET_SLOTS') {
          for (const shift of shifts) {
            if (shift.tasks.length !== 1) {
              skipped.push({ id: shift.id, title: shift.title, reason: 'Hat mehrere Arbeiten, Plätze einzeln anpassen' });
              continue;
            }
            const task = shift.tasks[0];
            if (task._count.signups > action.requiredSlots) {
              skipped.push({
                id: shift.id,
                title: shift.title,
                reason: `Schon ${task._count.signups} Personen eingetragen`,
              });
              continue;
            }
            await tx.shiftTask.update({ where: { id: task.id }, data: { requiredSlots: action.requiredSlots } });
            await tx.shift.update({ where: { id: shift.id }, data: { requiredSlots: action.requiredSlots } });
            updated++;
          }
        } else if (action.type === 'SET_SETUP') {
          updated = (
            await tx.shift.updateMany({ where: { id: { in: shiftIds } }, data: { isSetupTeardown: action.isSetupTeardown } })
          ).count;
        } else {
          updated = (
            await tx.shift.updateMany({ where: { id: { in: shiftIds } }, data: { category: action.category || null } })
          ).count;
        }
        if (action.type === 'DELETE' || action.type === 'MOVE') {
          await syncEventRange(tx, event.id);
        }
      });

      return { updated, skipped } satisfies BulkShiftsResultDto;
    }
  );
};

export default shiftRoutes;
