import { FastifyPluginAsync } from 'fastify';
import { InstantiateTemplateSchema, toEventAccessType, type EventTemplateData } from '@schichtplan/shared';
import { cleanRequiredFields } from '../services/profile.js';
import { replaceAccessLists, resolveAccessLists, syncQuestions } from './events.js';

const eventTemplateRoutes: FastifyPluginAsync = async (fastify) => {
  // Liste aller Event-Vorlagen der Abteilung
  fastify.get('/api/event-templates', async (request, reply) => {
    if (!request.tenant) {
      return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
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
        shiftCount: shifts.length,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        data,
      };
    });
  });

  // Details einer Event-Vorlage
  fastify.get<{ Params: { id: string } }>('/api/event-templates/:id', async (request, reply) => {
    if (!request.tenant) {
      return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
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
      shiftCount: data?.shifts?.length || 0,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      data,
    };
  });

  // Event aus Vorlage erzeugen (z.B. für das kommende Jahr)
  fastify.post<{ Params: { id: string } }>(
    '/api/event-templates/:id/instantiate',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: request.tenant.id,
            userId: request.user.id,
          },
        },
      });

      if (!member || (member.role !== 'ADMIN' && member.role !== 'PLANNER' && !request.user.isGlobalAdmin)) {
        return reply.status(403).send({ error: 'Nur die Abteilungsleitung darf neue Events aus Vorlagen erstellen' });
      }

      const template = await fastify.prisma.eventTemplate.findUnique({
        where: { id: request.params.id },
      });

      if (!template || template.departmentId !== request.tenant.id) {
        return reply.status(404).send({ error: 'Vorlage nicht gefunden' });
      }

      const parse = InstantiateTemplateSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const {
        title,
        slug,
        description,
        logoUrl,
        bannerUrl,
        startDate,
        endDate,
        accessType,
        leadersOnly,
        requiredFields,
        allowedDepartmentIds,
        allowedStufeIds,
        questions,
        allowPublicSignup,
      } = parse.data;

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

      // Basisdatum ermitteln
      const startBase = new Date(startDate);
      const baseYear = startBase.getFullYear();
      const baseMonth = startBase.getMonth();
      const baseDate = startBase.getDate();

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
            endDate: new Date(endDate),
            accessType,
            leadersOnly,
            requiredFields,
            allowPublicSignup,
            minShiftsPerPerson: parse.data.minShiftsPerPerson ?? template.minShiftsPerPerson ?? null,
            organizers: {
              create: [
                {
                  userId: request.user.id,
                  role: 'OK_LEAD',
                  roleTitle: 'Event-Leitung',
                },
              ],
            },
          },
        });
        await replaceAccessLists(tx, ev.id, lists.departmentIds, lists.stufeIds);
        await syncQuestions(tx, ev.id, questions);

        for (const s of templateShifts) {
          const shiftDay = new Date(baseYear, baseMonth, baseDate + (s.dayOffset || 0));

          const [startH, startM] = (s.startTimeStr || '12:00').split(':').map(Number);
          const [endH, endM] = (s.endTimeStr || '14:00').split(':').map(Number);

          const shiftStart = new Date(shiftDay.getFullYear(), shiftDay.getMonth(), shiftDay.getDate(), startH, startM);
          let shiftEnd = new Date(shiftDay.getFullYear(), shiftDay.getMonth(), shiftDay.getDate(), endH, endM);

          // Falls Schicht über Mitternacht geht: Ende auf Folgetag
          if (shiftEnd <= shiftStart) {
            shiftEnd = new Date(shiftDay.getFullYear(), shiftDay.getMonth(), shiftDay.getDate() + 1, endH, endM);
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

        return ev;
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
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: request.tenant.id,
            userId: request.user.id,
          },
        },
      });

      if (!member || (member.role !== 'ADMIN' && member.role !== 'PLANNER' && !request.user.isGlobalAdmin)) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Löschen von Vorlagen' });
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
