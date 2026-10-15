import { FastifyPluginAsync } from 'fastify';
import { CreateShiftSchema, UpdateShiftSchema, SignupShiftSchema } from '@schichtplan/shared';
import {
  accessEventInclude,
  accessUserSelect,
  evaluateEventAccess,
  hasValidGrant,
  managerFlags,
} from '../services/eventAccess.js';
import { missingProfileFields } from '../services/profile.js';
import { validateAnswers } from './eventParticipation.js';

function calculateAge(birthDate: Date, targetDate: Date): number {
  let age = targetDate.getFullYear() - birthDate.getFullYear();
  const m = targetDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && targetDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
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

      const { eventId, title, category, isSetupTeardown, startTime, endTime, requiredSlots: reqSlots, description, minAge, tasks } =
        parse.data;

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
        },
      });

      return shift;
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

      const { title, category, isSetupTeardown, startTime, endTime, description, minAge, tasks } = parse.data;

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

      const updated = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          tasks: { include: { signups: true } },
          signups: { include: { user: true, task: true } },
        },
      });

      return updated;
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
        },
      });

      return duplicated;
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
        targetUserId = requestedUserId;
        targetUser = await fastify.prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) {
          return reply.status(404).send({ error: 'Ausgewählter Benutzer nicht gefunden' });
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
            phone: true,
            address: true,
            birthDate: true,
          },
        });
        if (!self) {
          return reply.status(401).send({ error: 'Benutzerkonto nicht gefunden' });
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

      // Prüfe Duplikate
      if (targetUserId) {
        const alreadySignedUp = shift.signups.some((s) => s.userId === targetUserId);
        if (alreadySignedUp) {
          return reply.status(409).send({ error: 'Diese Person ist für diese Schicht bereits eingetragen' });
        }
      } else if (guestName) {
        const nameConflict = shift.signups.some(
          (s) => s.guestName?.toLowerCase() === guestName!.toLowerCase()
        );
        if (nameConflict) {
          return reply.status(409).send({
            error: `Jemand mit dem Namen "${guestName}" ist für diese Schicht bereits eingetragen`,
          });
        }
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
              error: `Für die Arbeit "${chosenTask.title}" müssen alle Helfer mindestens ${chosenTask.minAge} Jahre alt sein. Alter: ${userAge} Jahre.`,
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

      const signup = await fastify.prisma.shiftSignup.create({
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

      const displayName =
        signup.user?.ceviName ||
        (signup.user ? `${signup.user.firstName} ${signup.user.lastName}`.trim() : null) ||
        signup.guestName ||
        'Helfer*in';

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
          include: { shift: { include: { event: { include: { organizers: true } } } } },
        });
      } else if (request.user) {
        existingSignup = await fastify.prisma.shiftSignup.findFirst({
          where: {
            shiftId,
            userId: request.user.id,
          },
          include: { shift: { include: { event: { include: { organizers: true } } } } },
        });
      }

      if (!existingSignup) {
        return reply.status(404).send({ error: 'Eintragung nicht gefunden' });
      }

      // Prüfe Berechtigung: Eigener Eintrag ODER Abteilungsleitung ODER Event-OK
      let isAllowed = false;
      if (request.user && existingSignup.userId === request.user.id) {
        isAllowed = true;
      } else if (request.user) {
        const member = await fastify.prisma.departmentMember.findUnique({
          where: {
            departmentId_userId: {
              departmentId: existingSignup.shift.event.departmentId,
              userId: request.user.id,
            },
          },
        });
        const isDeptAdmin = member && (member.role === 'ADMIN' || member.role === 'PLANNER');
        const isEventOk = existingSignup.shift.event.organizers?.some(
          (o) => o.userId === request.user.id
        );
        if (isDeptAdmin || isEventOk || request.user.isGlobalAdmin) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Löschen dieser Eintragung' });
      }

      await fastify.prisma.shiftSignup.delete({
        where: { id: existingSignup.id },
      });

      return { message: 'Erfolgreich aus der Schicht ausgetragen' };
    }
  );

  // Meine Schichten abfragen
  fastify.get(
    '/api/shifts/my',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const signups = await fastify.prisma.shiftSignup.findMany({
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
                  department: { select: { name: true, slug: true } },
                },
              },
            },
          },
        },
        orderBy: { shift: { startTime: 'asc' } },
      });

      return signups.map((su) => ({
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
        departmentName: su.shift.event.department.name,
        departmentSlug: su.shift.event.department.slug,
        createdAt: su.createdAt.toISOString(),
      }));
    }
  );
};

export default shiftRoutes;
