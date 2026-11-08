import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  InstantiateTemplateSchema,
  addDaysToDayKey,
  toEventAccessType,
  zurichDateTime,
  zurichDayKey,
  type EventTemplateData,
} from '@schichtplan/shared';
import { cleanRequiredFields } from '../services/profile.js';
import { UNRELATED_PERSON_ERROR, allUsersRelatedTo, isDepartmentManager } from '../services/departmentVisibility.js';
import { hasDepartmentPermission } from '../services/permissions.js';
import { generateCheckinToken } from '../services/attendance.js';
import { syncEventRange } from '../services/eventRange.js';
import { replaceAccessLists, resolveAccessLists, syncQuestions } from './events.js';

const eventTemplateRoutes: FastifyPluginAsync = async (fastify) => {
  // Liste aller Event-Vorlagen der Abteilung
  fastify.get(
    '/api/event-templates',
    {
      schema: {
        tags: ['Vorlagen'],
        summary: 'Event-Vorlagen der Abteilung auflisten',
        description: 'Liefert alle gespeicherten Event- und Schichtvorlagen der aktuellen Abteilung.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      // Vorlagen (mit Fragen und Freigaben) nur für wer hier plant
      if (!(await isDepartmentManager(fastify.prisma, request.tenant.id, request.user.id))) {
        return reply.status(403).send({ error: 'Nur die Abteilungsleitung oder ein Event-OK' });
      }

      const templates = await fastify.prisma.eventTemplate.findMany({
        where: { departmentId: request.tenant.id },
        orderBy: { createdAt: 'desc' },
      });

      return templates.map((t) => {
        const data = t.data as unknown as EventTemplateData;
        const shifts = data?.shifts || [];
        return {
          id: t.id,
          departmentId: t.departmentId,
          title: t.title,
          description: t.description,
          accessType: toEventAccessType(t.accessType),
          leadersOnly: t.leadersOnly,
          requiredFields: cleanRequiredFields(t.requiredFields),
          minShiftsPerPerson: t.minShiftsPerPerson ?? null,
          cancelDeadlineDays: t.cancelDeadlineDays ?? null,
          overlapToleranceMinutes: t.overlapToleranceMinutes ?? 15,
          shiftCount: shifts.length,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          data,
        };
      });
    }
  );

  // Details einer Event-Vorlage
  fastify.get<{ Params: { id: string } }>(
    '/api/event-templates/:id',
    {
      schema: {
        tags: ['Vorlagen'],
        summary: 'Details einer Event-Vorlage abrufen',
        description: 'Liefert die vollständigen Konfigurations- und Schichtdaten einer Vorlage.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('Eindeutige ID der Vorlage'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      if (!(await isDepartmentManager(fastify.prisma, request.tenant.id, request.user.id))) {
        return reply.status(403).send({ error: 'Nur die Abteilungsleitung oder ein Event-OK' });
      }

      const template = await fastify.prisma.eventTemplate.findUnique({
        where: { id: request.params.id },
      });

      if (!template || template.departmentId !== request.tenant.id) {
        return reply.status(404).send({ error: 'Vorlage nicht gefunden' });
      }

      const data = template.data as unknown as EventTemplateData;
      return {
        id: template.id,
        departmentId: template.departmentId,
        title: template.title,
        description: template.description,
        accessType: toEventAccessType(template.accessType),
        leadersOnly: template.leadersOnly,
        requiredFields: cleanRequiredFields(template.requiredFields),
        minShiftsPerPerson: template.minShiftsPerPerson ?? null,
        cancelDeadlineDays: template.cancelDeadlineDays ?? null,
        overlapToleranceMinutes: template.overlapToleranceMinutes ?? 15,
        shiftCount: data?.shifts?.length || 0,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
        data,
      };
    }
  );

  // Event aus Vorlage erzeugen (z.B. für das kommende Jahr)
  fastify.post<{ Params: { id: string } }>(
    '/api/event-templates/:id/instantiate',
    {
      schema: {
        tags: ['Vorlagen'],
        summary: 'Neuen Anlass aus Vorlage generieren',
        description: 'Erstellt einen neuen Anlass mit allen zugehörigen Schichten, Aufgaben und Einstellungen auf Basis einer Vorlage.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('Eindeutige ID der Vorlage'),
        }),
        body: InstantiateTemplateSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      if (!(await hasDepartmentPermission(fastify.prisma, request.tenant.id, request.user.id, 'EVENTS_CREATE'))) {
        return reply.status(403).send({ error: 'Anlässe aus Vorlagen erstellen braucht das Recht «Anlässe erstellen»' });
      }

      const template = await fastify.prisma.eventTemplate.findUnique({
        where: { id: request.params.id },
      });

      if (!template || template.departmentId !== request.tenant.id) {
        return reply.status(404).send({ error: 'Vorlage nicht gefunden' });
      }

      const input = request.body as z.output<typeof InstantiateTemplateSchema>;
      if (!(await allUsersRelatedTo(fastify.prisma, { departmentIds: [request.tenant.id] }, [input.contactUserId]))) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
      }

      const {
        title,
        slug,
        description,
        logoUrl,
        bannerUrl,
        startDate,
        accessType,
        leadersOnly,
        requiredFields,
        allowedDepartmentIds,
        allowedStufeIds,
        questions,
        allowPublicSignup,
      } = input;

      const existing = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug,
          },
        },
      });

      if (existing) {
        return reply
          .status(409)
          .send({ error: 'Ein Event mit diesem Slug existiert bereits in dieser Abteilung' });
      }

      const lists = await resolveAccessLists(
        fastify.prisma,
        request.tenant.id,
        accessType,
        allowedDepartmentIds,
        allowedStufeIds
      );
      if ('error' in lists) {
        return reply.status(400).send({ error: lists.error });
      }

      const templateData = template.data as unknown as EventTemplateData;
      const templateShifts = templateData?.shifts || [];
      const instantiateAttendanceMode = input.attendanceMode ?? templateData?.attendanceMode ?? 'OFF';

      // Erster Tag und Uhrzeiten der Vorlage gelten in Schweizer Zeit (der Server läuft in UTC)
      const baseDay = zurichDayKey(startDate);

      const tenantId = request.tenant.id;

      // Transaktionale Event- und Schichterstellung
      const createdEvent = await fastify.prisma.$transaction(async (tx) => {
        const ev = await tx.event.create({
          data: {
            departmentId: tenantId,
            title,
            slug,
            description: description || template.description || null,
            logoUrl: logoUrl || null,
            bannerUrl: bannerUrl || null,
            startDate: new Date(startDate),
            endDate: new Date(startDate),
            accessType,
            leadersOnly,
            requiredFields,
            allowPublicSignup,
            minShiftsPerPerson: input.minShiftsPerPerson ?? template.minShiftsPerPerson ?? null,
            cancelDeadlineDays: input.cancelDeadlineDays !== undefined ? input.cancelDeadlineDays : (template.cancelDeadlineDays ?? null),
            overlapToleranceMinutes: input.overlapToleranceMinutes !== undefined ? input.overlapToleranceMinutes : (template.overlapToleranceMinutes ?? 15),
            contactUserId: input.contactUserId || null,
            dayCutoffTime: input.dayCutoffTime || '04:00',
            responsibleMode: input.responsibleMode || 'BY_SHIFT',
            contactVisibility: input.contactVisibility || (template.data as any)?.contactVisibility || 'BOTH',
            signupOpensAt: input.signupOpensAt ? new Date(input.signupOpensAt) : null,
            attendanceMode: instantiateAttendanceMode,
            allowReplacement: input.allowReplacement ?? templateData?.allowReplacement ?? true,
            replacementCutoffHours: input.replacementCutoffHours ?? templateData?.replacementCutoffHours ?? 0,
            reminderNote: input.reminderNote !== undefined ? (input.reminderNote?.trim() || null) : (templateData?.reminderNote || null),
            checkinToken: instantiateAttendanceMode === 'OK_AND_QR' ? generateCheckinToken() : null,
          },
        });
        await replaceAccessLists(tx, ev.id, lists.departmentIds, lists.stufeIds);
        await syncQuestions(tx, ev.id, questions);

        for (const s of templateShifts) {
          const shiftDay = addDaysToDayKey(baseDay, s.dayOffset || 0);
          const shiftStart = zurichDateTime(shiftDay, s.startTimeStr || '12:00');
          let shiftEnd = zurichDateTime(shiftDay, s.endTimeStr || '14:00');

          // Falls Schicht über Mitternacht geht: Ende auf Folgetag
          if (shiftEnd <= shiftStart) {
            shiftEnd = zurichDateTime(addDaysToDayKey(shiftDay, 1), s.endTimeStr || '14:00');
          }

          const tasks = s.tasks || [];
          const totalSlots = tasks.length > 0 ? tasks.reduce((sum, t) => sum + (t.requiredSlots || 1), 0) : 1;

          await tx.shift.create({
            data: {
              eventId: ev.id,
              title: s.title,
              category: s.category || null,
              isSetupTeardown: s.isSetupTeardown ?? false,
              description: s.description || null,
              minAge: s.minAge || null,
              startTime: shiftStart,
              endTime: shiftEnd,
              requiredSlots: totalSlots,
              tasks: {
                create:
                  tasks.length > 0
                    ? tasks.map((t) => ({
                        title: t.title,
                        description: t.description || null,
                        requiredSlots: t.requiredSlots || 1,
                        minAge: t.minAge || null,
                        ageRequirementType: t.ageRequirementType || 'ALL',
                      }))
                    : [
                        {
                          title: s.title,
                          description: s.description || null,
                          requiredSlots: 1,
                          minAge: s.minAge || null,
                          ageRequirementType: 'ALL',
                        },
                      ],
              },
            },
          });
        }
        await syncEventRange(tx, ev.id);

        return tx.event.findUniqueOrThrow({ where: { id: ev.id } });
      });

      return {
        id: createdEvent.id,
        title: createdEvent.title,
        slug: createdEvent.slug,
        startDate: createdEvent.startDate.toISOString(),
        endDate: createdEvent.endDate.toISOString(),
        message: 'Event erfolgreich aus Vorlage erstellt!',
      };
    }
  );

  // Vorlage löschen
  fastify.delete<{ Params: { id: string } }>(
    '/api/event-templates/:id',
    {
      schema: {
        tags: ['Vorlagen'],
        summary: 'Event-Vorlage löschen',
        description: 'Löscht eine gespeicherte Event-Vorlage aus der Abteilung.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('Eindeutige ID der Vorlage'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      if (!(await hasDepartmentPermission(fastify.prisma, request.tenant.id, request.user.id, 'TEMPLATES_MANAGE'))) {
        return reply.status(403).send({ error: 'Vorlagen löschen braucht das Recht «Vorlagen verwalten»' });
      }

      const template = await fastify.prisma.eventTemplate.findUnique({
        where: { id: request.params.id },
      });

      if (!template || template.departmentId !== request.tenant.id) {
        return reply.status(404).send({ error: 'Vorlage nicht gefunden' });
      }

      await fastify.prisma.eventTemplate.delete({
        where: { id: template.id },
      });

      return { message: 'Vorlage erfolgreich gelöscht' };
    }
  );
};

export default eventTemplateRoutes;
