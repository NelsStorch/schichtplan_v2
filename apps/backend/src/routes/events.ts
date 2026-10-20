import { FastifyPluginAsync } from 'fastify';
import type { Prisma, PrismaClient } from '../db.js';
import {
  accessTypeConfig,
  toEventAccessType,
  AddEventOrganizerSchema,
  CreateEventSchema,
  SaveAsTemplateSchema,
  UnregisterHelperSchema,
  UpdateEventSchema,
  type EventQuestionInput,
  type EventQuestionDto,
  type EventQuestionType,
} from '@schichtplan/shared';
import {
  accessEventInclude,
  accessUserSelect,
  audienceLabel,
  evaluateEventAccess,
  hasValidGrant,
  managerFlags,
} from '../services/eventAccess.js';
import { resolveOrganizerUser } from '../services/ceviNameLogin.js';
import { isDepartmentInsider } from '../services/departmentVisibility.js';
import { cleanRequiredFields, missingProfileFields } from '../services/profile.js';

type Tx = Prisma.TransactionClient;

function calculateAge(birthDate: Date, targetDate: Date): number {
  let age = targetDate.getFullYear() - birthDate.getFullYear();
  const m = targetDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && targetDate.getDate() < birthDate.getDate())) age--;
  return age;
}

export function toQuestionDto(q: {
  id: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  scope: string;
}): EventQuestionDto {
  return {
    id: q.id,
    label: q.label,
    type: (['TEXT', 'YES_NO', 'CHOICE'].includes(q.type) ? q.type : 'TEXT') as EventQuestionType,
    options: q.options,
    required: q.required,
    scope: q.scope === 'PER_SIGNUP' ? 'PER_SIGNUP' : 'ONCE',
  };
}

/**
 * Whitelist und Stufen-Filter prüfen: Whitelist nur bei Typen mit `whitelist`, Stufen nur bei
 * abteilungsbezogenen Typen und nur aus der eigenen oder einer freigeschalteten Abteilung.
 */
export async function resolveAccessLists(
  prisma: Pick<PrismaClient, 'department' | 'departmentStufe'> | Tx,
  departmentId: string,
  accessType: string,
  allowedDepartmentIds: string[],
  allowedStufeIds: string[]
): Promise<{ departmentIds: string[]; stufeIds: string[] } | { error: string }> {
  const cfg = accessTypeConfig(accessType);
  const departmentIds = cfg.whitelist
    ? [...new Set(allowedDepartmentIds)].filter((id) => id !== departmentId)
    : [];
  if (cfg.whitelist && departmentIds.length === 0) {
    return { error: 'Bitte mindestens eine weitere Abteilung freischalten oder einen anderen Typ wählen.' };
  }
  if (departmentIds.length > 0) {
    const found = await prisma.department.count({ where: { id: { in: departmentIds } } });
    if (found !== departmentIds.length) return { error: 'Eine der gewählten Abteilungen gibt es nicht' };
  }

  const stufeIds = cfg.scope === 'DEPARTMENT' ? [...new Set(allowedStufeIds)] : [];
  if (stufeIds.length > 0) {
    const allowedDepartments = [departmentId, ...departmentIds];
    const found = await prisma.departmentStufe.count({
      where: { id: { in: stufeIds }, departmentId: { in: allowedDepartments } },
    });
    if (found !== stufeIds.length) return { error: 'Eine der gewählten Stufen gehört nicht zu den Abteilungen' };
  }
  return { departmentIds, stufeIds };
}

/** Fragen abgleichen: bestehende (mit id) ändern, neue anlegen, fehlende löschen (samt Antworten). */
async function syncQuestions(tx: Tx, eventId: string, questions: EventQuestionInput[]) {
  const existing = await tx.eventQuestion.findMany({ where: { eventId }, select: { id: true } });
  const existingIds = new Set(existing.map((q) => q.id));
  const keepIds = questions.map((q) => q.id).filter((id): id is string => Boolean(id && existingIds.has(id)));
  await tx.eventQuestion.deleteMany({ where: { eventId, id: { notIn: keepIds } } });

  for (const [index, q] of questions.entries()) {
    const data = {
      label: q.label,
      type: q.type,
      options: q.type === 'CHOICE' ? q.options : [],
      required: q.required,
      scope: q.scope,
      sortOrder: index,
    };
    if (q.id && existingIds.has(q.id)) {
      await tx.eventQuestion.update({ where: { id: q.id }, data });
    } else {
      await tx.eventQuestion.create({ data: { ...data, eventId } });
    }
  }
}

async function replaceAccessLists(tx: Tx, eventId: string, departmentIds: string[], stufeIds: string[]) {
  await tx.eventAllowedDepartment.deleteMany({ where: { eventId } });
  await tx.eventAllowedStufe.deleteMany({ where: { eventId } });
  if (departmentIds.length) {
    await tx.eventAllowedDepartment.createMany({
      data: departmentIds.map((departmentId) => ({ eventId, departmentId })),
    });
  }
  if (stufeIds.length) {
    await tx.eventAllowedStufe.createMany({ data: stufeIds.map((stufeId) => ({ eventId, stufeId })) });
  }
}

const eventRoutes: FastifyPluginAsync = async (fastify) => {
  /** Ungelöster Einladungs-Link (?zugang=) erlaubt das Ansehen, damit man ihn danach einlösen kann */
  async function isValidLinkToken(eventId: string, token: string | undefined) {
    if (!token || token.length > 100) return false;
    const link = await fastify.prisma.eventAccessLink.findUnique({
      where: { token },
      select: { eventId: true, expiresAt: true },
    });
    return Boolean(link && link.eventId === eventId && (!link.expiresAt || link.expiresAt > new Date()));
  }

  // Liste aller Events der aktuellen Abteilung
  fastify.get('/api/events', { preHandler: [fastify.optionalAuthenticate] }, async (request, reply) => {
    if (!request.tenant) {
      return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
    }
    // Startseite nur für Mitglieder: Aussenstehende bekommen keine Liste
    if (request.tenant.membersOnly && !(await isDepartmentInsider(fastify.prisma, request.tenant.id, request.user?.id))) {
      reply.header('Cache-Control', 'no-store');
      return reply
        .status(403)
        .send({ error: 'Diese Abteilung zeigt ihre Anlässe nur Mitgliedern.', code: 'MEMBERS_ONLY' });
    }

    const events = await fastify.prisma.event.findMany({
      where: {
        departmentId: request.tenant.id,
        isPublished: true,
      },
      include: {
        shifts: { select: { requiredSlots: true, _count: { select: { signups: true } } } },
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((e) => ({
      id: e.id,
      departmentId: e.departmentId,
      title: e.title,
      slug: e.slug,
      description: e.description,
      logoUrl: e.logoUrl,
      bannerUrl: e.bannerUrl,
      startDate: e.startDate.toISOString(),
      endDate: e.endDate.toISOString(),
      isPublished: e.isPublished,
      allowPublicSignup: e.allowPublicSignup,
      accessType: toEventAccessType(e.accessType),
      leadersOnly: e.leadersOnly,
      requiredFields: cleanRequiredFields(e.requiredFields),
      createdAt: e.createdAt.toISOString(),
      shiftCount: e.shifts.length,
      totalSlots: e.shifts.reduce((sum, s) => sum + s.requiredSlots, 0),
      filledSlots: e.shifts.reduce((sum, s) => sum + Math.min(s._count.signups, s.requiredSlots), 0),
    }));
  });

  // Event Details anhand von Slug. Namen und Kontaktangaben je nach Berechtigung.
  fastify.get<{ Params: { slug: string }; Querystring: { zugang?: string } }>(
    '/api/events/:slug',
    { preHandler: [fastify.optionalAuthenticate] },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      reply.header('Cache-Control', 'no-store');

      const event = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug: request.params.slug,
          },
        },
        include: {
          ...accessEventInclude,
          organizers: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, ceviName: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          questions: { orderBy: { sortOrder: 'asc' } },
          shifts: {
            include: {
              tasks: { orderBy: { createdAt: 'asc' } },
              signups: {
                include: {
                  task: true,
                  user: {
                    select: { id: true, firstName: true, lastName: true, ceviName: true, birthDate: true },
                  },
                },
                orderBy: { createdAt: 'asc' },
              },
            },
            orderBy: { startTime: 'asc' },
          },
        },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const viewer = request.user
        ? await fastify.prisma.user.findUnique({
            where: { id: request.user.id },
            select: {
              ...accessUserSelect,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              address: true,
              birthDate: true,
              eventAnswers: { where: { eventId: event.id }, select: { questionId: true, value: true } },
            },
          })
        : null;

      const flags = await managerFlags(fastify.prisma, event, viewer);
      const hasGrant = viewer ? await hasValidGrant(fastify.prisma, event.id, viewer.id) : false;
      const access = evaluateEventAccess(event, request.tenant.name, viewer, flags, hasGrant);

      // «Nur für Mitglieder»: interne Anlässe sind für Aussenstehende unsichtbar (404), ausser mit Zugangs-Link.
      // Öffentliche Anlässe (scope ANY) bleiben über ihren direkten Link für alle erreichbar.
      if (
        request.tenant.membersOnly &&
        accessTypeConfig(event.accessType).scope !== 'ANY' &&
        !flags.isManager &&
        !hasGrant &&
        !(await isValidLinkToken(event.id, request.query.zugang)) &&
        !(await isDepartmentInsider(fastify.prisma, request.tenant.id, viewer?.id))
      ) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const answers = Object.fromEntries((viewer?.eventAnswers ?? []).map((a) => [a.questionId, a.value]));
      const missingQuestionIds = event.questions
        .filter((q) => q.scope !== 'PER_SIGNUP' && q.required && !answers[q.id]?.trim())
        .map((q) => q.id);

      return {
        id: event.id,
        title: event.title,
        slug: event.slug,
        description: event.description,
        logoUrl: event.logoUrl,
        bannerUrl: event.bannerUrl,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        isPublished: event.isPublished,
        allowPublicSignup: event.allowPublicSignup,
        accessType: toEventAccessType(event.accessType),
        leadersOnly: event.leadersOnly,
        requiredFields: cleanRequiredFields(event.requiredFields),
        minShiftsPerPerson: event.minShiftsPerPerson ?? null,
        audience: audienceLabel(event, request.tenant.name),
        allowedDepartments: event.allowedDepartments.map((a) => ({
          id: a.departmentId,
          name: a.department.name,
        })),
        allowedStufen: event.allowedStufen.map((a) => ({
          id: a.stufeId,
          name: a.stufe.name,
          departmentId: a.stufe.departmentId,
        })),
        questions: event.questions.map(toQuestionDto),
        viewer: {
          access,
          missingFields: viewer ? missingProfileFields(viewer, event.requiredFields) : [],
          missingQuestionIds: viewer ? missingQuestionIds : [],
          answers,
        },
        organizers: event.organizers.map((o) => ({
          id: o.id,
          eventId: o.eventId,
          userId: o.userId,
          userFirstName: o.user.firstName,
          userLastName: o.user.lastName,
          userCeviName: o.user.ceviName,
          displayName: o.user.ceviName
            ? `${o.user.firstName} / ${o.user.ceviName}`
            : `${o.user.firstName} ${o.user.lastName}`,
          role: o.role,
          roleTitle: o.roleTitle,
          createdAt: o.createdAt.toISOString(),
        })),
        shifts: event.shifts.map((s) => {
          const signups = s.signups.map((su) => {
            const isOwn = Boolean(viewer && su.userId === viewer.id);
            const showName = access.canSeeNames || isOwn;
            const displayName = showName
              ? su.user?.ceviName ||
                (su.user ? `${su.user.firstName} ${su.user.lastName}`.trim() : null) ||
                su.guestName ||
                'Helfer*in'
              : 'Belegt';
            const userAge =
              access.isManager && su.user?.birthDate ? calculateAge(su.user.birthDate, s.startTime) : null;

            return {
              id: su.id,
              shiftId: su.shiftId,
              taskId: su.taskId || null,
              taskTitle: su.task?.title || null,
              userId: showName ? su.user?.id || null : null,
              guestName: showName ? su.guestName : null,
              guestEmail: access.isManager ? su.guestEmail : null,
              guestPhone: access.isManager ? su.guestPhone : null,
              displayName,
              userFirstName: showName ? su.user?.firstName || null : null,
              userLastName: showName ? su.user?.lastName || null : null,
              userCeviName: showName ? su.user?.ceviName || null : null,
              userBirthDate: access.isManager && su.user?.birthDate ? su.user.birthDate.toISOString() : null,
              userAge,
              createdAt: su.createdAt.toISOString(),
              isConfirmed: su.isConfirmed,
            };
          });

          const tasks = s.tasks.map((t) => {
            const taskSignups = signups.filter((su) => su.taskId === t.id);
            return {
              id: t.id,
              shiftId: t.shiftId,
              taskDefinitionId: t.taskDefinitionId || null,
              title: t.title,
              description: t.description,
              requiredSlots: t.requiredSlots,
              freeSlots: Math.max(0, t.requiredSlots - taskSignups.length),
              minAge: t.minAge,
              ageRequirementType: t.ageRequirementType as 'ALL' | 'AT_LEAST_ONE',
              signups: taskSignups,
            };
          });

          return {
            id: s.id,
            eventId: s.eventId,
            title: s.title,
            category: s.category,
            isSetupTeardown: s.isSetupTeardown,
            description: s.description,
            startTime: s.startTime.toISOString(),
            endTime: s.endTime.toISOString(),
            requiredSlots: s.requiredSlots,
            freeSlots: Math.max(0, s.requiredSlots - signups.length),
            minAge: s.minAge,
            tasks,
            signups,
          };
        }),
      };
    }
  );

  // Neues Event erstellen (Abteilungsleitung / Planer*in)
  fastify.post(
    '/api/events',
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

      if (!request.user.isGlobalAdmin && (!member || (member.role !== 'ADMIN' && member.role !== 'PLANNER'))) {
        return reply.status(403).send({ error: 'Nur die Abteilungsleitung darf Events erstellen' });
      }

      const parse = CreateEventSchema.safeParse(request.body);
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
        allowPublicSignup,
        accessType,
        leadersOnly,
        requiredFields,
        minShiftsPerPerson,
        allowedDepartmentIds,
        allowedStufeIds,
        questions,
        organizers: requestedOrganizers,
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

      // OK-Mitglieder auflösen
      const organizersToCreate: Array<{ userId: string; role: string; roleTitle?: string }> = [];
      const userIdsSeen = new Set<string>();

      if (Array.isArray(requestedOrganizers) && requestedOrganizers.length > 0) {
        for (const item of requestedOrganizers) {
          // Der Ersteller selbst ist schon berechtigt (Abteilungsleitung oder Planung)
          if (item.userId === request.user.id) {
            if (!userIdsSeen.has(request.user.id)) {
              userIdsSeen.add(request.user.id);
              organizersToCreate.push({
                userId: request.user.id,
                role: item.role || 'OK_LEAD',
                roleTitle: item.roleTitle?.trim() || 'Event-Leitung',
              });
            }
            continue;
          }
          const resolved = await resolveOrganizerUser(fastify.prisma, request.tenant.id, item);
          if ('error' in resolved) {
            const who = item.ceviName || item.email || 'Eine Person';
            return reply.status(resolved.status).send({ error: `OK: ${who}: ${resolved.error}` });
          }
          const targetUser = resolved.user;

          if (!userIdsSeen.has(targetUser.id)) {
            userIdsSeen.add(targetUser.id);
            organizersToCreate.push({
              userId: targetUser.id,
              role: item.role || 'OK_MEMBER',
              roleTitle: item.roleTitle?.trim() || (item.role === 'OK_LEAD' ? 'Event-Leitung' : undefined),
            });

            // Sicherstellen, dass die Person Mitglied der Abteilung ist
            await fastify.prisma.departmentMember.upsert({
              where: {
                departmentId_userId: {
                  departmentId: request.tenant.id,
                  userId: targetUser.id,
                },
              },
              update: {},
              create: {
                departmentId: request.tenant.id,
                userId: targetUser.id,
                role: 'HELPER',
              },
            });
          }
        }
      }

      // Falls der Ersteller noch nicht im OK ist, als OK-Leitung hinzufügen
      if (!userIdsSeen.has(request.user.id)) {
        organizersToCreate.unshift({
          userId: request.user.id,
          role: 'OK_LEAD',
          roleTitle: 'Event-Leitung',
        });
      }

      const departmentId = request.tenant.id;
      const event = await fastify.prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            departmentId,
            title,
            slug,
            description: description || null,
            logoUrl: logoUrl || null,
            bannerUrl: bannerUrl || null,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            allowPublicSignup,
            accessType,
            leadersOnly,
            requiredFields,
            minShiftsPerPerson: minShiftsPerPerson ?? null,
            organizers: {
              create: organizersToCreate,
            },
          },
        });
        await replaceAccessLists(tx, created.id, lists.departmentIds, lists.stufeIds);
        await syncQuestions(tx, created.id, questions);
        return created;
      });

      return {
        id: event.id,
        title: event.title,
        slug: event.slug,
        logoUrl: event.logoUrl,
        bannerUrl: event.bannerUrl,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        accessType: event.accessType,
      };
    }
  );

  // Event bearbeiten (Abteilungsleitung ODER Event-OK)
  fastify.patch<{ Params: { slug: string } }>(
    '/api/events/:slug',
    { preHandler: [fastify.authenticate] },
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
        include: {
          organizers: true,
          allowedDepartments: { select: { departmentId: true } },
          allowedStufen: { select: { stufeId: true } },
        },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      const isEventOk = event.organizers.some((o) => o.userId === request.user.id);
      if (!flags.isDeptAdmin && !isEventOk) {
        return reply
          .status(403)
          .send({ error: 'Nur die Abteilungsleitung oder das Event-OK dürfen dieses Event bearbeiten' });
      }

      const parse = UpdateEventSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }
      const body = parse.data;

      // Listen immer zum (evtl. neuen) Typ passend neu bestimmen
      const accessType = body.accessType ?? event.accessType;
      const lists = await resolveAccessLists(
        fastify.prisma,
        event.departmentId,
        accessType,
        body.allowedDepartmentIds ?? event.allowedDepartments.map((a) => a.departmentId),
        body.allowedStufeIds ?? event.allowedStufen.map((a) => a.stufeId)
      );
      if ('error' in lists) {
        return reply.status(400).send({ error: lists.error });
      }

      const updated = await fastify.prisma.$transaction(async (tx) => {
        const saved = await tx.event.update({
          where: { id: event.id },
          data: {
            title: body.title,
            description: body.description,
            logoUrl: body.logoUrl,
            bannerUrl: body.bannerUrl,
            startDate: body.startDate ? new Date(body.startDate) : undefined,
            endDate: body.endDate ? new Date(body.endDate) : undefined,
            allowPublicSignup: body.allowPublicSignup,
            accessType: body.accessType,
            leadersOnly: body.leadersOnly,
            requiredFields: body.requiredFields,
            minShiftsPerPerson: body.minShiftsPerPerson !== undefined ? body.minShiftsPerPerson : undefined,
          },
        });
        await replaceAccessLists(tx, event.id, lists.departmentIds, lists.stufeIds);
        if (body.questions) await syncQuestions(tx, event.id, body.questions);
        return saved;
      });

      return {
        id: updated.id,
        title: updated.title,
        slug: updated.slug,
        logoUrl: updated.logoUrl,
        bannerUrl: updated.bannerUrl,
        accessType: updated.accessType,
      };
    }
  );

  // Mitglied zum Event-OK hinzufügen
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/organizers',
    { preHandler: [fastify.authenticate] },
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
      if (!flags.isDeptAdmin && !flags.isOkLead) {
        return reply.status(403).send({ error: 'Keine Berechtigung zur OK-Verwaltung' });
      }

      const parse = AddEventOrganizerSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const { userId, ceviName, email, role, roleTitle } = parse.data;

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
          roleTitle: roleTitle || undefined,
        },
        create: {
          eventId: event.id,
          userId: targetUser.id,
          role,
          roleTitle: roleTitle || 'OK-Mitglied',
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, ceviName: true },
          },
        },
      });

      return {
        id: organizer.id,
        displayName: organizer.user.ceviName
          ? `${organizer.user.firstName} / ${organizer.user.ceviName}`
          : `${organizer.user.firstName} ${organizer.user.lastName}`,
        role: organizer.role,
        roleTitle: organizer.roleTitle,
      };
    }
  );

  // Mitglied aus dem Event-OK entfernen (Abteilungsleitung oder OK-Leitung)
  fastify.delete<{ Params: { slug: string; organizerId: string } }>(
    '/api/events/:slug/organizers/:organizerId',
    { preHandler: [fastify.authenticate] },
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
      if (!flags.isDeptAdmin && !flags.isOkLead) {
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
    { preHandler: [fastify.authenticate] },
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
        return reply.status(403).send({ error: 'Keine Berechtigung zum Abmelden von Helfern' });
      }

      const parse = UnregisterHelperSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const { userId, guestName } = parse.data;

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

      const deleted = await fastify.prisma.shiftSignup.deleteMany({
        where: whereClause,
      });

      return {
        message: `${deleted.count} Schichteintragung(en) erfolgreich entfernt`,
        deletedCount: deleted.count,
      };
    }
  );

  // Event als Vorlage für künftige Jahre speichern
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/save-as-template',
    { preHandler: [fastify.authenticate] },
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
        include: {
          organizers: true,
          allowedDepartments: { select: { departmentId: true } },
          allowedStufen: { select: { stufeId: true } },
          questions: { orderBy: { sortOrder: 'asc' } },
          shifts: {
            include: {
              tasks: {
                orderBy: { createdAt: 'asc' },
              },
            },
            orderBy: { startTime: 'asc' },
          },
        },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.isManager) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Erstellen von Vorlagen' });
      }

      const parse = SaveAsTemplateSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const templateTitle = parse.data.title || `${event.title} (Vorlage)`;
      const templateDescription = parse.data.description || event.description || null;

      // Berechne relative Tage und Zeiten ausgehend vom Startdatum des Events
      const eventStart = new Date(event.startDate);
      const baseMidnight = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());

      const pad = (n: number) => String(n).padStart(2, '0');
      const formatTimeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

      const shiftTemplates = event.shifts.map((s) => {
        const sStart = new Date(s.startTime);
        const sEnd = new Date(s.endTime);

        const sDayMidnight = new Date(sStart.getFullYear(), sStart.getMonth(), sStart.getDate());
        const diffMs = sDayMidnight.getTime() - baseMidnight.getTime();
        const dayOffset = Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));

        return {
          title: s.title,
          category: s.category,
          isSetupTeardown: s.isSetupTeardown,
          description: s.description,
          minAge: s.minAge,
          dayOffset,
          startTimeStr: formatTimeStr(sStart),
          endTimeStr: formatTimeStr(sEnd),
          tasks: s.tasks.map((t) => ({
            title: t.title,
            description: t.description,
            requiredSlots: t.requiredSlots,
            minAge: t.minAge,
            ageRequirementType: t.ageRequirementType as 'ALL' | 'AT_LEAST_ONE',
          })),
        };
      });

      const template = await fastify.prisma.eventTemplate.create({
        data: {
          departmentId: request.tenant.id,
          title: templateTitle,
          description: templateDescription,
          accessType: event.accessType,
          leadersOnly: event.leadersOnly,
          requiredFields: event.requiredFields,
          minShiftsPerPerson: event.minShiftsPerPerson ?? null,
          data: {
            shifts: shiftTemplates,
            questions: event.questions.map((q) => {
              const { id: _id, ...rest } = toQuestionDto(q);
              return rest;
            }),
            allowedDepartmentIds: event.allowedDepartments.map((a) => a.departmentId),
            allowedStufeIds: event.allowedStufen.map((a) => a.stufeId),
          },
        },
      });

      return {
        id: template.id,
        title: template.title,
        description: template.description,
        shiftCount: shiftTemplates.length,
        createdAt: template.createdAt.toISOString(),
      };
    }
  );
};

export { syncQuestions, replaceAccessLists };
export default eventRoutes;
