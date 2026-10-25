import { FastifyPluginAsync } from 'fastify';
import {
  addZurichDays,
  toZurichInput,
  BulkShiftsSchema,
  CreateShiftSchema,
  CreateShiftSeriesSchema,
  calculateShiftSeriesIntervals,
  UpdateShiftSchema,
  SignupShiftSchema,
  type BulkShiftsResultDto,
  type ResponsiblePersonDto,
} from '@schichtplan/shared';
import {
  accessEventInclude,
  accessUserSelect,
  evaluateEventAccess,
  hasValidGrant,
  managerFlags,
} from '../services/eventAccess.js';
import { missingProfileFields } from '../services/profile.js';
import { validateAnswers } from './eventParticipation.js';
import { findShiftCollisions, formatZurichTime } from '../services/shiftCollision.js';
import { UNRELATED_PERSON_ERROR, allUsersRelatedToEvent } from '../services/departmentVisibility.js';
import { syncEventRange } from '../services/eventRange.js';

function calculateAge(birthDate: Date, targetDate: Date): number {
  let age = targetDate.getFullYear() - birthDate.getFullYear();
  const m = targetDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && targetDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function toResponsiblePersonDto(
  r: {
    user: {
      id: string;
      firstName: string;
      lastName: string;
      ceviName?: string | null;
      phone?: string | null;
      email?: string | null;
    };
  },
  contactVisibility: string = 'BOTH'
): ResponsiblePersonDto {
  const allowPhone = contactVisibility === 'BOTH' || contactVisibility === 'PHONE';
  const allowEmail = contactVisibility === 'BOTH' || contactVisibility === 'EMAIL';
  return {
    id: r.user.id,
    displayName: r.user.ceviName
      ? `${r.user.firstName} / ${r.user.ceviName}`
      : `${r.user.firstName} ${r.user.lastName}`,
    firstName: r.user.firstName,
    lastName: r.user.lastName,
    ceviName: r.user.ceviName,
    phone: allowPhone ? r.user.phone : null,
    email: allowEmail ? r.user.email : null,
  };
}

const shiftRoutes: FastifyPluginAsync = async (fastify) => {
  // Schicht erstellen (Admin, Planner oder Event-OK)
  fastify.post(
    '/api/shifts',
    { preHandler: [fastify.authenticate] },
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

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      // Prüfe Berechtigung: Abteilungsleitung, Planner oder Event-OK
      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: event.departmentId,
            userId: request.user.id,
          },
        },
      });

      const isDeptAdmin = member && (member.role === 'ADMIN' || member.role === 'PLANNER');
      const isEventOk = event.organizers.some((o) => o.userId === request.user.id);

      if (!isDeptAdmin && !isEventOk && !request.user.isGlobalAdmin) {
        return reply
          .status(403)
          .send({ error: 'Keine Berechtigung zum Erstellen von Schichten für dieses Event' });
      }

      if (!(await allUsersRelatedToEvent(fastify.prisma, event.id, responsibleUserIds ?? []))) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
      }

      const resolvedTasks =
        tasks && tasks.length > 0
          ? tasks
          : [
              {
                title,
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
          title,
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
                  create: responsibleUserIds.map((userId) => ({ userId })),
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
    { preHandler: [fastify.authenticate] },
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

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      // Prüfe Berechtigung: Abteilungsleitung, Planner oder Event-OK
      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: event.departmentId,
            userId: request.user.id,
          },
        },
      });

      const isDeptAdmin = member && (member.role === 'ADMIN' || member.role === 'PLANNER');
      const isEventOk = event.organizers.some((o) => o.userId === request.user.id);

      if (!isDeptAdmin && !isEventOk && !request.user.isGlobalAdmin) {
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

      const resolvedTasks =
        tasks && tasks.length > 0
          ? tasks
          : [
              {
                title,
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
              title,
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
                      create: responsibleUserIds.map((userId) => ({ userId })),
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
    { preHandler: [fastify.authenticate] },
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

      if (!shift) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      // Berechtigung prüfen
      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: shift.event.departmentId,
            userId: request.user.id,
          },
        },
      });

      const isDeptAdmin = member && (member.role === 'ADMIN' || member.role === 'PLANNER');
      const isEventOk = shift.event.organizers.some((o) => o.userId === request.user.id);

      if (!isDeptAdmin && !isEventOk && !request.user.isGlobalAdmin) {
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
              title: title !== undefined ? title : undefined,
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
            title: title !== undefined ? title : undefined,
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

      if (responsibleUserIds !== undefined) {
        await fastify.prisma.shiftResponsible.deleteMany({ where: { shiftId } });
        if (responsibleUserIds.length > 0) {
          await fastify.prisma.shiftResponsible.createMany({
            data: responsibleUserIds.map((userId) => ({ shiftId, userId })),
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
  fastify.delete<{ Params: { id: string } }>(
    '/api/shifts/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const shiftId = request.params.id;

      const shift = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: { event: { include: { organizers: true } } },
      });

      if (!shift) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: shift.event.departmentId,
            userId: request.user.id,
          },
        },
      });

      const isDeptAdmin = member && (member.role === 'ADMIN' || member.role === 'PLANNER');
      const isEventOk = shift.event.organizers.some((o) => o.userId === request.user.id);

      if (!isDeptAdmin && !isEventOk && !request.user.isGlobalAdmin) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Löschen dieser Schicht' });
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
    { preHandler: [fastify.authenticate] },
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

      if (!shift) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: shift.event.departmentId,
            userId: request.user.id,
          },
        },
      });

      const isDeptAdmin = member && (member.role === 'ADMIN' || member.role === 'PLANNER');
      const isEventOk = shift.event.organizers.some((o) => o.userId === request.user.id);

      if (!isDeptAdmin && !isEventOk && !request.user.isGlobalAdmin) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Duplizieren dieser Schicht' });
      }

      const body = (request.body as any) || {};
      const newStartTime = body.startTime ? new Date(body.startTime) : new Date(shift.startTime);
      const newEndTime = body.endTime ? new Date(body.endTime) : new Date(shift.endTime);

      const duplicated = await fastify.prisma.shift.create({
        data: {
          eventId: shift.eventId,
          title: body.title || `${shift.title} (Kopie)`,
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
                  create: shift.responsibles.map((r) => ({ userId: r.userId })),
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

  // Zeitkollisionen prüfen (für Eintragen-Vorschau oder Admin-Zuweisung)
  fastify.get<{
    Params: { id: string };
    Querystring: { userId?: string; guestName?: string };
  }>(
    '/api/shifts/:id/check-collision',
    { preHandler: [fastify.optionalAuthenticate] },
    async (request, reply) => {
      const shiftId = request.params.id;
      const { userId, guestName } = request.query;

      const shift = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          event: {
            include: {
              organizers: true,
            },
          },
        },
      });

      if (!shift || (request.tenant && shift.event.departmentId !== request.tenant.id)) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      if (!request.user) {
        return reply.status(401).send({ error: 'Nicht angemeldet' });
      }

      const flags = await managerFlags(fastify.prisma, shift.event, request.user);
      const isOkOrAdmin = flags.isManager;

      let targetUserId: string | null = null;
      let targetGuestName: string | null = null;

      if (userId) {
        if (userId !== request.user.id && !isOkOrAdmin) {
          return reply.status(403).send({ error: 'Keine Berechtigung' });
        }
        targetUserId = userId;
      } else if (guestName) {
        if (!isOkOrAdmin) {
          return reply.status(403).send({ error: 'Keine Berechtigung' });
        }
        targetGuestName = guestName;
      } else {
        targetUserId = request.user.id;
      }

      const conflicts = await findShiftCollisions(fastify.prisma, {
        shiftId: shift.id,
        startTime: shift.startTime,
        endTime: shift.endTime,
        eventId: shift.eventId,
        userId: targetUserId,
        guestName: targetGuestName,
      });

      let message: string | undefined;
      if (conflicts.length > 0) {
        const first = conflicts[0];
        if (first.sameShift) {
          message = `Bereits in dieser Schicht eingetragen${first.taskTitle ? ` (${first.taskTitle})` : ''}.`;
        } else {
          message = `Bereits eingetragen für «${first.shiftTitle}»${first.taskTitle ? ` (${first.taskTitle})` : ''} (${formatZurichTime(first.startTime)} – ${formatZurichTime(first.endTime)} Uhr).`;
        }
      }

      return {
        hasCollision: conflicts.length > 0,
        conflicts,
        message,
      };
    }
  );

  // In Schicht eintragen (oder durch OK einteilen)
  fastify.post<{ Params: { id: string } }>(
    '/api/shifts/:id/signup',
    { preHandler: [fastify.optionalAuthenticate] },
    async (request, reply) => {
      const shiftId = request.params.id;

      const shift = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          tasks: {
            include: {
              signups: {
                include: { user: true },
              },
            },
          },
          signups: {
            include: { user: true },
          },
          event: {
            include: {
              ...accessEventInclude,
              department: { select: { name: true } },
              questions: { select: { id: true, required: true, scope: true, label: true, type: true, options: true } },
            },
          },
        },
      });

      if (!shift || (request.tenant && shift.event.departmentId !== request.tenant.id)) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      const event = shift.event;

      // Selbsteintragung braucht immer ein Konto (ein Cevi-Name-Profil reicht)
      if (!request.user) {
        return reply.status(401).send({
          error: 'Zum Eintragen brauchst du ein Konto. Ein Cevi-Name ohne Passwort reicht.',
          requiresLogin: true,
        });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      const isOkOrAdmin = flags.isManager;
      if (!event.isPublished && !isOkOrAdmin) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      // Body parsen
      const parse = SignupShiftSchema.safeParse({ ...(request.body as object), shiftId });
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const { taskId, userId: requestedUserId, guestName: reqGuestName, guestEmail: reqGuestEmail, guestPhone: reqGuestPhone } =
        parse.data;

      // Antworten auf Fragen, die bei jeder Eintragung neu gestellt werden (PER_SIGNUP)
      const perSignupQuestions = event.questions.filter((q) => q.scope === 'PER_SIGNUP');
      const signupAnswers = Object.fromEntries(
        perSignupQuestions
          .map((q) => [q.id, (parse.data.answers?.[q.id] ?? '').trim()] as const)
          .filter(([, value]) => value)
      );
      const invalidAnswer = validateAnswers(perSignupQuestions, signupAnswers);
      if (invalidAnswer) return reply.status(400).send({ error: invalidAnswer });

      let targetUserId: string | null = null;
      let targetUser = null;
      let guestName: string | null = null;
      let guestEmail: string | null = null;
      let guestPhone: string | null = null;

      // Fall 1: OK teilt eine andere Person ein
      if (isOkOrAdmin && requestedUserId) {
        // Nur Personen der Abteilung oder des Anlasses: sonst sähe das OK danach fremde Kontaktdaten
        if (!(await allUsersRelatedToEvent(fastify.prisma, event.id, [requestedUserId]))) {
          return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
        }
        targetUserId = requestedUserId;
        targetUser = await fastify.prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) {
          return reply.status(404).send({ error: 'Ausgewählte Person nicht gefunden' });
        }
      } else if (isOkOrAdmin && reqGuestName) {
        // OK trägt manuellen Gast/Helfer ein
        guestName = reqGuestName.trim();
        guestEmail = reqGuestEmail?.trim() || null;
        guestPhone = reqGuestPhone?.trim() || null;
      } else {
        // Angemeldete Person trägt sich selbst ein: Zugang, Pflichtangaben und Pflichtfragen prüfen
        targetUserId = request.user.id;
        const self = await fastify.prisma.user.findUnique({
          where: { id: targetUserId },
          select: {
            ...accessUserSelect,
            email: true,
            firstName: true,
            lastName: true,
            ceviName: true,
            phone: true,
            address: true,
            birthDate: true,
          },
        });
        if (!self) {
          return reply.status(401).send({ error: 'Konto nicht gefunden' });
        }
        targetUser = self;

        const hasGrant = await hasValidGrant(fastify.prisma, event.id, self.id);
        const access = evaluateEventAccess(event, event.department.name, self, flags, hasGrant);
        if (!access.canSignup) {
          return reply.status(403).send({ error: access.message, reason: access.reason });
        }

        const missingFields = missingProfileFields(self, event.requiredFields);
        const answered = await fastify.prisma.eventAnswer.findMany({
          where: { eventId: event.id, userId: self.id },
          select: { questionId: true, value: true },
        });
        const missingQuestionIds = event.questions
          .filter(
            (q) =>
              q.scope !== 'PER_SIGNUP' &&
              q.required &&
              !answered.some((a) => a.questionId === q.id && a.value.trim())
          )
          .map((q) => q.id);
        const missingSignupQuestionIds = perSignupQuestions
          .filter((q) => q.required && !signupAnswers[q.id])
          .map((q) => q.id);
        if (missingFields.length > 0 || missingQuestionIds.length > 0 || missingSignupQuestionIds.length > 0) {
          return reply.status(400).send({
            error: 'Für diesen Anlass fehlen noch Angaben.',
            code: 'MISSING_INFO',
            missingFields,
            missingQuestionIds,
            missingSignupQuestionIds,
          });
        }
      }

      // Zeitkollisionen & Duplikate prüfen (gleiche Schicht oder überlappende Schichten)
      const allowCollision = Boolean(isOkOrAdmin && parse.data.confirmCollision);
      const conflicts = await findShiftCollisions(fastify.prisma, {
        shiftId,
        startTime: shift.startTime,
        endTime: shift.endTime,
        eventId: shift.eventId,
        userId: targetUserId,
        guestName,
      });

      if (conflicts.length > 0 && !allowCollision) {
        const first = conflicts[0];
        const sameShift = conflicts.some((c) => c.sameShift);
        const isSelf = targetUserId === request.user.id;

        let error: string;
        if (sameShift) {
          if (isSelf) {
            error = first.taskTitle
              ? `Du bist für diese Schicht bereits für die Arbeit «${first.taskTitle}» eingetragen.`
              : 'Du bist für diese Schicht bereits eingetragen.';
          } else {
            error = first.taskTitle
              ? `Diese Person ist für diese Schicht bereits für die Arbeit «${first.taskTitle}» eingetragen.`
              : 'Diese Person ist für diese Schicht bereits eingetragen.';
          }
        } else {
          const timeStr = `${formatZurichTime(first.startTime)} – ${formatZurichTime(first.endTime)} Uhr`;
          if (isSelf) {
            error = first.taskTitle
              ? `Du bist zur gleichen Zeit bereits für die Schicht «${first.shiftTitle}» (${first.taskTitle}, ${timeStr}) eingetragen.`
              : `Du bist zur gleichen Zeit bereits für die Schicht «${first.shiftTitle}» (${timeStr}) eingetragen.`;
          } else {
            const name =
              targetUser?.ceviName ||
              (targetUser ? `${targetUser.firstName} ${targetUser.lastName}`.trim() : guestName) ||
              'Diese Person';
            error = first.taskTitle
              ? `${name} ist zur gleichen Zeit bereits für die Schicht «${first.shiftTitle}» (${first.taskTitle}, ${timeStr}) eingetragen.`
              : `${name} ist zur gleichen Zeit bereits für die Schicht «${first.shiftTitle}» (${timeStr}) eingetragen.`;
          }
        }

        return reply.status(409).send({
          error,
          code: 'TIME_COLLISION',
          conflicts,
        });
      }

      // Prüfe freie Plätze in der Gesamtschicht
      if (shift.signups.length >= shift.requiredSlots) {
        return reply.status(409).send({ error: 'Diese Schicht ist bereits voll belegt' });
      }

      // Arbeit (Task) bestimmen
      let chosenTask = null;
      if (taskId) {
        chosenTask = shift.tasks.find((t) => t.id === taskId);
        if (!chosenTask) {
          return reply.status(404).send({ error: 'Arbeit in dieser Schicht nicht gefunden' });
        }
      } else if (shift.tasks.length === 1) {
        chosenTask = shift.tasks[0];
      } else {
        // Nimm erste Arbeit mit freien Plätzen
        chosenTask = shift.tasks.find((t) => t.signups.length < t.requiredSlots) || shift.tasks[0] || null;
      }

      // Prüfe freie Plätze in der gewählten Arbeit
      if (chosenTask && chosenTask.signups.length >= chosenTask.requiredSlots) {
        return reply.status(409).send({
          error: `Für die Arbeit "${chosenTask.title}" sind alle Plätze belegt. Bitte wähle eine andere Arbeit.`,
        });
      }

      // Altersprüfungen
      const shiftDate = new Date(shift.startTime);
      const userBirthDate = targetUser?.birthDate ? new Date(targetUser.birthDate) : null;
      const userAge = userBirthDate ? calculateAge(userBirthDate, shiftDate) : null;

      // Wer sich selbst einträgt, muss bei einer Altersgrenze das Geburtsdatum angeben
      // (sonst liesse sich «Bar ab 18» mit einem Konto ohne Geburtsdatum umgehen)
      const strictMinAge = Boolean(shift.minAge || (chosenTask?.minAge && chosenTask.ageRequirementType === 'ALL'));
      if (targetUserId === request.user.id && !isOkOrAdmin && strictMinAge && userAge === null) {
        return reply.status(400).send({
          error: 'Für diese Schicht gibt es ein Mindestalter. Bitte gib dein Geburtsdatum an.',
          code: 'MISSING_INFO',
          missingFields: ['BIRTH_DATE'],
          missingQuestionIds: [],
          missingSignupQuestionIds: [],
        });
      }

      // 1) Mindestalter der Schicht selbst
      if (shift.minAge && userAge !== null && userAge < shift.minAge) {
        return reply.status(403).send({
          error: `Für diese Schicht (${shift.title}) ist ein Mindestalter von ${shift.minAge} Jahren erforderlich. Alter: ${userAge} Jahre.`,
        });
      }

      // 2) Mindestalter der spezifischen Arbeit
      if (chosenTask && chosenTask.minAge) {
        if (chosenTask.ageRequirementType === 'ALL') {
          // Alle müssen das Mindestalter haben
          if (userAge !== null && userAge < chosenTask.minAge) {
            return reply.status(403).send({
              error: `Für die Arbeit "${chosenTask.title}" müssen alle Helfenden mindestens ${chosenTask.minAge} Jahre alt sein. Alter: ${userAge} Jahre.`,
            });
          }
        } else if (chosenTask.ageRequirementType === 'AT_LEAST_ONE') {
          // Mindestens eine Person in der Schicht muss das Mindestalter haben
          // Prüfen, ob bereits jemand in der Schicht das Mindestalter erfüllt
          const alreadyHasAdult = shift.signups.some((s) => {
            if (s.user?.birthDate) {
              const age = calculateAge(new Date(s.user.birthDate), shiftDate);
              return age >= chosenTask!.minAge!;
            }
            return false;
          });

          if (!alreadyHasAdult) {
            // Noch niemand in der Schicht hat das geforderte Alter
            const isUserOldEnough = userAge !== null && userAge >= chosenTask.minAge;

            if (!isUserOldEnough) {
              // Helfer ist zu jung oder Alter unbekannt.
              // Prüfe, ob dies der LETZTE freie Platz in der Schicht ist:
              const remainingShiftSlots = shift.requiredSlots - shift.signups.length;
              if (remainingShiftSlots <= 1) {
                return reply.status(403).send({
                  error: `Für die Arbeit "${chosenTask.title}" muss mindestens eine Person in der Schicht mindestens ${chosenTask.minAge} Jahre alt sein. Da dies der letzte freie Platz ist, muss dieser von einer Person ab ${chosenTask.minAge} Jahren besetzt werden.`,
                });
              }
            }
          }
        }
      }

      // Plätze und Doppel-Eintragung unter Sperre der Schicht nochmals prüfen: Zwei gleichzeitige
      // Eintragungen für den letzten Platz (oder ein Doppelklick) würden die Schicht sonst überbuchen.
      const result = await fastify.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM shifts WHERE id = ${shiftId} FOR UPDATE`;
        if (!allowCollision) {
          if (targetUserId) {
            const overlapping = await tx.shiftSignup.findFirst({
              where: {
                userId: targetUserId,
                shift: {
                  startTime: { lt: shift.endTime },
                  endTime: { gt: shift.startTime },
                },
              },
              include: { shift: true },
            });
            if (overlapping) {
              const isSame = overlapping.shiftId === shiftId;
              return {
                error: isSame
                  ? 'Diese Person ist für diese Schicht bereits eingetragen'
                  : `Zur gleichen Zeit besteht bereits eine Eintragung für «${overlapping.shift.title}»`,
              } as const;
            }
          } else if (guestName) {
            const overlapping = await tx.shiftSignup.findFirst({
              where: {
                shift: {
                  eventId: shift.eventId,
                  startTime: { lt: shift.endTime },
                  endTime: { gt: shift.startTime },
                },
                guestName: { equals: guestName, mode: 'insensitive' },
              },
              include: { shift: true },
            });
            if (overlapping) {
              return {
                error: `Jemand mit dem Namen "${guestName}" ist zur gleichen Zeit bereits eingetragen`,
              } as const;
            }
          }
        }
        if ((await tx.shiftSignup.count({ where: { shiftId } })) >= shift.requiredSlots) {
          return { error: 'Diese Schicht ist bereits voll belegt' } as const;
        }
        if (chosenTask && (await tx.shiftSignup.count({ where: { taskId: chosenTask.id } })) >= chosenTask.requiredSlots) {
          return {
            error: `Für die Arbeit "${chosenTask.title}" sind alle Plätze belegt. Bitte wähle eine andere Arbeit.`,
          } as const;
        }

        const created = await tx.shiftSignup.create({
          data: {
            shiftId,
            taskId: chosenTask?.id || null,
            userId: targetUserId,
            guestName,
            guestEmail,
            guestPhone,
            answers: {
              create: Object.entries(signupAnswers).map(([questionId, value]) => ({ questionId, value })),
            },
          },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                ceviName: true,
                birthDate: true,
              },
            },
            task: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        });
        return { signup: created } as const;
      });
      if ('error' in result) {
        return reply.status(409).send({ error: result.error });
      }
      const signup = result.signup;

      const displayName =
        signup.user?.ceviName ||
        (signup.user ? `${signup.user.firstName} ${signup.user.lastName}`.trim() : null) ||
        signup.guestName ||
        'Helfer*in';

      // Im Aktivitäts-Protokoll festhalten
      try {
        const isSelf = Boolean(request.user && targetUserId === request.user.id);
        let performerUser = null;
        if (request.user) {
          if (isSelf && signup.user) {
            performerUser = signup.user;
          } else {
            performerUser = await fastify.prisma.user.findUnique({
              where: { id: request.user.id },
              select: { firstName: true, lastName: true, ceviName: true },
            });
          }
        }
        const performerName = performerUser
          ? (performerUser.ceviName ? `${performerUser.firstName} / ${performerUser.ceviName}` : `${performerUser.firstName} ${performerUser.lastName}`.trim())
          : null;

        await fastify.prisma.shiftSignupLog.create({
          data: {
            eventId: event.id,
            shiftId: shift.id,
            action: 'SIGNUP',
            helperUserId: targetUserId,
            helperName: displayName,
            performedByUserId: request.user?.id || null,
            performedByName: isSelf ? null : (performerName ? `${performerName} (OK)` : 'OK'),
            shiftTitle: shift.title,
            shiftStartTime: shift.startTime,
            shiftEndTime: shift.endTime,
            taskTitle: signup.task?.title || null,
          },
        });
      } catch (logErr) {
        request.log.error(logErr, 'Fehler beim Erstellen des Signup-Logs');
      }

      return {
        id: signup.id,
        shiftId: signup.shiftId,
        taskId: signup.taskId,
        taskTitle: signup.task?.title || null,
        displayName,
        message: 'Erfolgreich für die Schicht eingetragen!',
      };
    }
  );

  // Aus Schicht austragen (Eigene Eintragung oder Admin/Planner/Event-OK)
  fastify.delete<{ Params: { id: string }; Querystring: { signupId?: string } }>(
    '/api/shifts/:id/signup',
    { preHandler: [fastify.optionalAuthenticate] },
    async (request, reply) => {
      const shiftId = request.params.id;
      const { signupId } = request.query;

      if (!signupId && !request.user) {
        return reply.status(401).send({ error: 'Nicht autorisiert' });
      }

      let existingSignup = null;

      if (signupId) {
        existingSignup = await fastify.prisma.shiftSignup.findUnique({
          where: { id: signupId },
          include: {
            shift: { include: { event: { include: { organizers: true } } } },
            task: true,
            user: true,
          },
        });
      } else if (request.user) {
        existingSignup = await fastify.prisma.shiftSignup.findFirst({
          where: {
            shiftId,
            userId: request.user.id,
          },
          include: {
            shift: { include: { event: { include: { organizers: true } } } },
            task: true,
            user: true,
          },
        });
      }

      if (!existingSignup) {
        return reply.status(404).send({ error: 'Eintragung nicht gefunden' });
      }

      // Prüfe Berechtigung: Eigener Eintrag ODER Abteilungsleitung ODER Event-OK
      const event = existingSignup.shift.event;
      const flags = await managerFlags(fastify.prisma, event, request.user);
      const isManager = flags.isManager;
      const isSelf = Boolean(request.user && existingSignup.userId === request.user.id);

      if (!isSelf && !isManager) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Löschen dieser Eintragung' });
      }

      // Austrag-Sperre prüfen: Helfer können sich ab X Tagen vor Event-Beginn nicht mehr selbst austragen
      if (!isManager && event.cancelDeadlineDays !== null && event.cancelDeadlineDays !== undefined) {
        const deadline = new Date(event.startDate.getTime() - event.cancelDeadlineDays * 24 * 60 * 60 * 1000);
        if (new Date() >= deadline) {
          const deadlineStr = deadline.toLocaleDateString('de-CH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const daysText =
            event.cancelDeadlineDays === 0
              ? 'seit Anlassbeginn'
              : `seit ${event.cancelDeadlineDays} Tag(en) vor dem Anlass (${deadlineStr} Uhr)`;
          return reply.status(403).send({
            error: `Austragen ist ${daysText} nicht mehr selbst möglich. Bitte wende dich direkt an das Event-OK.`,
          });
        }
      }

      // Im Aktivitäts-Protokoll festhalten
      try {
        let performerUser = null;
        if (request.user) {
          if (isSelf && existingSignup.user) {
            performerUser = existingSignup.user;
          } else {
            performerUser = await fastify.prisma.user.findUnique({
              where: { id: request.user.id },
              select: { firstName: true, lastName: true, ceviName: true },
            });
          }
        }
        const performerName = performerUser
          ? (performerUser.ceviName ? `${performerUser.firstName} / ${performerUser.ceviName}` : `${performerUser.firstName} ${performerUser.lastName}`.trim())
          : null;
        const helperName =
          existingSignup.user?.ceviName ||
          (existingSignup.user ? `${existingSignup.user.firstName} ${existingSignup.user.lastName}`.trim() : null) ||
          existingSignup.guestName ||
          'Helfer*in';

        await fastify.prisma.shiftSignupLog.create({
          data: {
            eventId: event.id,
            shiftId: existingSignup.shift.id,
            action: 'SIGNOFF',
            helperUserId: existingSignup.userId,
            helperName,
            performedByUserId: request.user?.id || null,
            performedByName: isSelf ? null : (performerName ? `${performerName} (OK)` : 'OK'),
            shiftTitle: existingSignup.shift.title,
            shiftStartTime: existingSignup.shift.startTime,
            shiftEndTime: existingSignup.shift.endTime,
            taskTitle: existingSignup.task?.title || null,
          },
        });
      } catch (logErr) {
        request.log.error(logErr, 'Fehler beim Erstellen des Signoff-Logs');
      }

      await fastify.prisma.shiftSignup.delete({
        where: { id: existingSignup.id },
      });

      return { message: 'Erfolgreich aus der Schicht ausgetragen' };
    }
  );

  // Meine Schichten abfragen (inkl. Schichten, bei denen man Schichtleitung oder Tagesleitung ist)
  fastify.get(
    '/api/shifts/my',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const [signups, shiftResp, dayResp] = await Promise.all([
        fastify.prisma.shiftSignup.findMany({
          where: { userId: request.user.id },
          include: {
            task: { select: { id: true, title: true } },
            shift: {
              include: {
                event: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                    startDate: true,
                    cancelDeadlineDays: true,
                    department: { select: { name: true, slug: true } },
                  },
                },
              },
            },
          },
        }),
        fastify.prisma.shiftResponsible.findMany({
          where: { userId: request.user.id },
          include: {
            shift: {
              include: {
                event: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                    startDate: true,
                    cancelDeadlineDays: true,
                    department: { select: { name: true, slug: true } },
                  },
                },
              },
            },
          },
        }),
        fastify.prisma.eventDayResponsible.findMany({
          where: { userId: request.user.id },
          include: {
            event: {
              select: {
                id: true,
                title: true,
                slug: true,
                startDate: true,
                cancelDeadlineDays: true,
                department: { select: { name: true, slug: true } },
                shifts: true,
              },
            },
          },
        }),
      ]);

      interface MyShiftItem {
        signupId: string;
        shiftId: string;
        taskId: string | null;
        taskTitle: string | null;
        title: string;
        category: string | null;
        description: string | null;
        startTime: string;
        endTime: string;
        eventId: string;
        eventTitle: string;
        eventSlug: string;
        eventStartDate: string;
        cancelDeadlineDays: number | null;
        departmentName: string;
        departmentSlug: string;
        createdAt: string;
        isSignup: boolean;
        isResponsible: boolean;
        responsibleRole: string | null;
      }

      const map = new Map<string, MyShiftItem>();

      for (const su of signups) {
        map.set(su.shift.id, {
          signupId: su.id,
          shiftId: su.shift.id,
          taskId: su.task?.id || null,
          taskTitle: su.task?.title || null,
          title: su.shift.title,
          category: su.shift.category,
          description: su.shift.description,
          startTime: su.shift.startTime.toISOString(),
          endTime: su.shift.endTime.toISOString(),
          eventId: su.shift.event.id,
          eventTitle: su.shift.event.title,
          eventSlug: su.shift.event.slug,
          eventStartDate: su.shift.event.startDate.toISOString(),
          cancelDeadlineDays: su.shift.event.cancelDeadlineDays,
          departmentName: su.shift.event.department.name,
          departmentSlug: su.shift.event.department.slug,
          createdAt: su.createdAt.toISOString(),
          isSignup: true,
          isResponsible: false,
          responsibleRole: null,
        });
      }

      for (const sr of shiftResp) {
        const existing = map.get(sr.shift.id);
        if (existing) {
          existing.isResponsible = true;
          existing.responsibleRole = 'Schichtleitung';
        } else {
          map.set(sr.shift.id, {
            signupId: `resp-${sr.shift.id}`,
            shiftId: sr.shift.id,
            taskId: null,
            taskTitle: null,
            title: sr.shift.title,
            category: sr.shift.category,
            description: sr.shift.description,
            startTime: sr.shift.startTime.toISOString(),
            endTime: sr.shift.endTime.toISOString(),
            eventId: sr.shift.event.id,
            eventTitle: sr.shift.event.title,
            eventSlug: sr.shift.event.slug,
            eventStartDate: sr.shift.event.startDate.toISOString(),
            cancelDeadlineDays: sr.shift.event.cancelDeadlineDays,
            departmentName: sr.shift.event.department.name,
            departmentSlug: sr.shift.event.department.slug,
            createdAt: sr.createdAt.toISOString(),
            isSignup: false,
            isResponsible: true,
            responsibleRole: 'Schichtleitung',
          });
        }
      }

      for (const dr of dayResp) {
        for (const s of dr.event.shifts) {
          const shiftDate = toZurichInput(s.startTime).slice(0, 10);
          if (shiftDate === dr.dayDate) {
            const existing = map.get(s.id);
            if (existing) {
              existing.isResponsible = true;
              existing.responsibleRole = existing.responsibleRole
                ? `${existing.responsibleRole} & Tagesleitung`
                : 'Tagesleitung';
            } else {
              map.set(s.id, {
                signupId: `dayresp-${s.id}`,
                shiftId: s.id,
                taskId: null,
                taskTitle: null,
                title: s.title,
                category: s.category,
                description: s.description,
                startTime: s.startTime.toISOString(),
                endTime: s.endTime.toISOString(),
                eventId: dr.event.id,
                eventTitle: dr.event.title,
                eventSlug: dr.event.slug,
                eventStartDate: dr.event.startDate.toISOString(),
                cancelDeadlineDays: dr.event.cancelDeadlineDays,
                departmentName: dr.event.department.name,
                departmentSlug: dr.event.department.slug,
                createdAt: dr.createdAt.toISOString(),
                isSignup: false,
                isResponsible: true,
                responsibleRole: 'Tagesleitung',
              });
            }
          }
        }
      }

      return Array.from(map.values()).sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    }
  );

  // Mehrere Schichten eines Anlasses auf einmal ändern (Abteilungsleitung, Planung oder Event-OK)
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/shifts/bulk',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await fastify.prisma.event.findUnique({
        where: { departmentId_slug: { departmentId: request.tenant.id, slug: request.params.slug } },
        include: { organizers: true },
      });
      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.isManager) {
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
          updated = (await tx.shift.deleteMany({ where: { id: { in: shiftIds } } })).count;
        } else if (action.type === 'MOVE') {
          const move = (d: Date) => new Date(addZurichDays(d, action.days).getTime() + action.minutes * 60 * 1000);
          for (const shift of shifts) {
            await tx.shift.update({
              where: { id: shift.id },
              data: { startTime: move(shift.startTime), endTime: move(shift.endTime) },
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
