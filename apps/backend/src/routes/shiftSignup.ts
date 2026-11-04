import { z } from 'zod';
import { FastifyPluginAsync } from 'fastify';
import {
  ageAt,
  cancelDeadlineAt,
  cancelDeadlineText,
  formatZurichTimeRange,
  SignupShiftSchema,
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
import { findShiftCollisions } from '../services/shiftCollision.js';
import { UNRELATED_PERSON_ERROR, allUsersRelatedToEvent } from '../services/departmentVisibility.js';
import { trackUsage } from '../services/usageStats.js';
import { personLabel } from '../services/attendance.js';
import { notifyReplacementTaken, replacementOpen } from '../services/replacement.js';
import { EMAIL_REMINDER_MINUTES, PUSH_REMINDER_MINUTES } from '@schichtplan/shared';
import { pastReminderMinutes, } from '../services/shiftDto.js';

const shiftSignupRoutes: FastifyPluginAsync = async (fastify) => {
  // Zeitkollisionen prüfen (für Eintragen-Vorschau oder Admin-Zuweisung)
  fastify.get<{
    Params: { id: string };
    Querystring: { userId?: string; guestName?: string };
  }>(
    '/api/shifts/:id/check-collision',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Zeitkollision prüfen',
        description: 'Prüft, ob eine Person oder ein Gast zum Schichtzeitpunkt bereits in einer anderen Schicht eingetragen ist.',
        params: z.object({
          id: z.string().uuid().describe('ID der Schicht'),
        }),
        querystring: z.object({
          userId: z.string().uuid().optional().describe('ID des Benutzers'),
          guestName: z.string().optional().describe('Name des Gastes'),
        }),
      },
      preHandler: [fastify.optionalAuthenticate],
    },
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
          message = `Bereits eingetragen für «${first.shiftTitle}»${first.taskTitle ? ` (${first.taskTitle})` : ''} (${formatZurichTimeRange(first.startTime, first.endTime)}).`;
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
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Für Schicht eintragen oder Person einteilen',
        description: 'Trägt eine angemeldete Person, ein Abteilungsmitglied oder einen Gast in die Schicht ein oder übernimmt eine Schicht mit «Ersatz gesucht».',
        params: z.object({
          id: z.string().uuid().describe('ID der Schicht'),
        }),
        body: SignupShiftSchema.omit({ shiftId: true }),
      },
      preHandler: [fastify.optionalAuthenticate],
    },
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

      // Schicht übernehmen («Ersatz gesucht»): Die eigene Eintragung ersetzt die angebotene,
      // deren Platz gilt für alle Prüfungen als frei.
      const replaced = parse.data.replacesSignupId
        ? shift.signups.find((s) => s.id === parse.data.replacesSignupId) ?? null
        : null;
      if (parse.data.replacesSignupId) {
        if (!replaced?.replacementWantedAt) {
          return reply.status(409).send({ error: 'Für diese Eintragung wird kein Ersatz mehr gesucht.' });
        }
        if (replaced.userId === request.user.id) {
          return reply.status(400).send({ error: 'Das ist deine eigene Eintragung.' });
        }
        if (!replacementOpen(event, shift.startTime)) {
          return reply.status(409).send({ error: 'Diese Schicht kann nicht mehr übernommen werden.' });
        }
        shift.signups = shift.signups.filter((s) => s.id !== replaced.id);
        for (const t of shift.tasks) t.signups = t.signups.filter((s) => s.id !== replaced.id);
      }

      let targetUserId: string | null = null;
      let targetUser = null;
      let guestName: string | null = null;
      let guestEmail: string | null = null;
      let guestPhone: string | null = null;

      // Andere einteilen braucht «Helfende einteilen» (OK oder Recht), Sehen allein reicht nicht.
      // Ohne das Recht werden userId/guestName ignoriert und die Person trägt sich selbst ein.
      const canAssign = flags.can.HELPERS;

      // Fall 1: OK teilt eine andere Person ein
      if (canAssign && requestedUserId && !replaced) {
        // Nur Personen der Abteilung oder des Anlasses: sonst sähe das OK danach fremde Kontaktdaten
        if (!(await allUsersRelatedToEvent(fastify.prisma, event.id, [requestedUserId]))) {
          return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
        }
        targetUserId = requestedUserId;
        targetUser = await fastify.prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) {
          return reply.status(404).send({ error: 'Ausgewählte Person nicht gefunden' });
        }
      } else if (canAssign && reqGuestName && !replaced) {
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
            birthDate: true,
          },
        });
        if (!self) {
          return reply.status(401).send({ error: 'Konto nicht gefunden' });
        }
        targetUser = self;

        const hasGrant = await hasValidGrant(fastify.prisma, event.id, self.id);
        // Beim Übernehmen kommt kein Platz dazu: geschlossenes Eintragen hält es nicht auf
        const accessEvent = replaced ? { ...event, allowPublicSignup: true, signupOpensAt: null } : event;
        const access = evaluateEventAccess(accessEvent, event.department.name, self, flags, hasGrant);
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
          const timeStr = formatZurichTimeRange(first.startTime, first.endTime);
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
      if (replaced) {
        // Wer übernimmt, übernimmt auch die Arbeit
        chosenTask = shift.tasks.find((t) => t.id === replaced.taskId) ?? null;
      } else if (taskId) {
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
      const userAge = userBirthDate ? ageAt(userBirthDate, shiftDate) : null;

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
          error: `Für diese Schicht ${shift.title ? `(${shift.title}) ` : ''}ist ein Mindestalter von ${shift.minAge} Jahren erforderlich. Alter: ${userAge} Jahre.`,
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
              const age = ageAt(s.user.birthDate, shiftDate);
              return age !== null && age >= chosenTask!.minAge!;
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
        if (replaced) {
          // Unter der Sperre: zurückgezogen oder schon von jemand anderem übernommen?
          const stillOffered = await tx.shiftSignup.findFirst({
            where: { id: replaced.id, replacementWantedAt: { not: null } },
            select: { id: true },
          });
          if (!stillOffered) return { error: 'Diese Schicht wurde schon übernommen oder wird nicht mehr angeboten.' } as const;
          await tx.shiftSignup.delete({ where: { id: replaced.id } });
        }
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
                  : `Zur gleichen Zeit besteht bereits eine Eintragung für «${overlapping.shift.title || 'eine andere Schicht'}»`,
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
            sentEmailReminders: pastReminderMinutes(shift.startTime, EMAIL_REMINDER_MINUTES),
            sentPushReminders: pastReminderMinutes(shift.startTime, PUSH_REMINDER_MINUTES),
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
            // REPLACE: performedByName = wer die Schicht abgegeben hat
            action: replaced ? 'REPLACE' : 'SIGNUP',
            helperUserId: targetUserId,
            helperName: displayName,
            performedByUserId: request.user?.id || null,
            performedByName: replaced
              ? personLabel(replaced.user, replaced.guestName)
              : isSelf ? null : (performerName ? `${performerName} (OK)` : 'OK'),
            shiftTitle: shift.title || signup.task?.title || 'Schicht',
            shiftStartTime: shift.startTime,
            shiftEndTime: shift.endTime,
            taskTitle: signup.task?.title || null,
          },
        });
      } catch (logErr) {
        request.log.error(logErr, 'Fehler beim Erstellen des Signup-Logs');
      }

      if (replaced) {
        trackUsage('REPLACEMENT_TAKEN', { departmentId: event.departmentId });
        void notifyReplacementTaken(fastify.prisma, replaced, shift, event, displayName).catch((err) =>
          request.log.error(err, 'Mail «Ersatz gefunden» fehlgeschlagen')
        );
      } else {
        trackUsage('SIGNUP', {
          dim: targetUserId === request.user.id ? 'SELF' : targetUserId ? 'OK' : 'GUEST',
          departmentId: event.departmentId,
        });
      }

      return {
        id: signup.id,
        shiftId: signup.shiftId,
        taskId: signup.taskId,
        taskTitle: signup.task?.title || null,
        displayName,
        message: replaced ? 'Du hast die Schicht übernommen. Danke!' : 'Erfolgreich für die Schicht eingetragen!',
      };
    }
  );

  // Aus Schicht austragen (Eigene Eintragung oder Admin/Planner/Event-OK)
  fastify.delete<{ Params: { id: string }; Querystring: { signupId?: string } }>(
    '/api/shifts/:id/signup',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Aus Schicht austragen',
        description: 'Trägt eine Person aus einer Schicht aus (unter Einhaltung von Abmeldefristen oder durch das OK).',
        params: z.object({
          id: z.string().uuid().describe('ID der Schicht'),
        }),
        querystring: z.object({
          signupId: z.string().uuid().optional().describe('ID der konkreten Schicht-Eintragung'),
        }),
      },
      preHandler: [fastify.optionalAuthenticate],
    },
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
      // Andere austragen und Austrage-Frist übergehen: «Helfende einteilen»
      const isManager = flags.can.HELPERS;
      const isSelf = Boolean(request.user && existingSignup.userId === request.user.id);

      if (!isSelf && !isManager) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Löschen dieser Eintragung' });
      }

      // Austrag-Sperre prüfen: Helfer können sich ab X Tagen vor Event-Beginn nicht mehr selbst austragen
      if (!isManager && event.cancelDeadlineDays !== null && event.cancelDeadlineDays !== undefined) {
        const deadline = cancelDeadlineAt(event.startDate, event.cancelDeadlineDays);
        if (new Date() >= deadline) {
          const daysText = cancelDeadlineText(deadline, event.cancelDeadlineDays);
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
            shiftTitle: existingSignup.shift.title || existingSignup.task?.title || 'Schicht',
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
      trackUsage('SIGNOFF', { dim: isSelf ? 'SELF' : 'OK', departmentId: event.departmentId });

      return { message: 'Erfolgreich aus der Schicht ausgetragen' };
    }
  );
};

export default shiftSignupRoutes;
