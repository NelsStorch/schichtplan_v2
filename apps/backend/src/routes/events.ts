import { z } from 'zod';
import { shiftDisplayTitle } from '../services/shiftDto.js';
import { FastifyPluginAsync } from 'fastify';
import type { Prisma, PrismaClient } from '../db.js';
import {
  accessTypeConfig,
  toEventAccessType,
  toRetentionDays,
  AddEventOrganizerSchema,
  CreateEventSchema,
  SaveAsTemplateSchema,
  SetDayResponsiblesSchema,
  UnregisterHelperSchema,
  UpdateEventSchema,
  MoveEventSchema,
  ageAt,
  dayKeyDiff,
  zurichDayKey,
  zurichTimeKey,
  ConfirmDeleteSchema,
  type EventQuestionInput,
  type EventQuestionDto,
  type EventQuestionType,
  type ResponsiblePersonDto,
  type EventContactVisibility,
  type AttendanceStatus,
  type ShiftSignupLogAction,
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
import { departmentAccess, hasDepartmentPermission } from '../services/permissions.js';
import {
  UNRELATED_PERSON_ERROR,
  allUsersRelatedTo,
  allUsersRelatedToEvent,
  isDepartmentInsider,
} from '../services/departmentVisibility.js';
import { cleanRequiredFields, missingProfileFields } from '../services/profile.js';
import { generateCheckinToken } from '../services/attendance.js';
import { moveEventByDays } from '../services/eventRange.js';
import {
  disambiguatePersonNames,
  extractPrimaryStufe,
  type DisambiguationCandidate,
} from '../services/disambiguation.js';
import { canTakeOver } from '../services/replacement.js';

type Tx = Prisma.TransactionClient;

export function toQuestionDto(q: {
  id: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  scope: string;
  retentionDays: number | null;
}): EventQuestionDto {
  return {
    id: q.id,
    label: q.label,
    type: (['TEXT', 'YES_NO', 'CHOICE'].includes(q.type) ? q.type : 'TEXT') as EventQuestionType,
    options: q.options,
    required: q.required,
    scope: q.scope === 'PER_SIGNUP' ? 'PER_SIGNUP' : 'ONCE',
    retentionDays: toRetentionDays(q.retentionDays),
  };
}

function toResponsiblePersonDto(
  u: {
    id: string;
    firstName: string;
    lastName: string | null;
    ceviName?: string | null;
    phone?: string | null;
    email?: string | null;
  },
  contactVisibility: string = 'BOTH'
): ResponsiblePersonDto {
  const allowPhone = contactVisibility === 'BOTH' || contactVisibility === 'PHONE';
  const allowEmail = contactVisibility === 'BOTH' || contactVisibility === 'EMAIL';
  return {
    id: u.id,
    displayName: u.ceviName
      ? `${u.firstName} / ${u.ceviName}`
      : `${u.firstName} ${u.lastName ?? ''}`.trim(),
    firstName: u.firstName,
    lastName: u.lastName,
    ceviName: u.ceviName,
    phone: allowPhone ? u.phone : null,
    email: allowEmail ? u.email : null,
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
      retentionDays: q.retentionDays,
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
  fastify.get(
    '/api/events',
    {
      schema: {
        tags: ['Events'],
        summary: 'Anlässe der Abteilung auflisten',
        description: 'Liefert alle veröffentlichten Anlässe der Abteilung (oder alle Entwürfe für Planer*innen).',
      },
      preHandler: [fastify.optionalAuthenticate],
    },
    async (request, reply) => {
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

    // Entwürfe nur für «Alle Anlässe sehen» (inkl. Abteilungsleitung) und das OK des jeweiligen Anlasses
    const viewerId = request.user?.id;
    const seesAllDrafts = (await departmentAccess(fastify.prisma, request.tenant.id, viewerId)).permissions.has(
      'EVENTS_VIEW_ALL'
    );
    const events = await fastify.prisma.event.findMany({
      where: {
        departmentId: request.tenant.id,
        ...(seesAllDrafts
          ? {}
          : {
              OR: [
                { isPublished: true },
                ...(viewerId ? [{ organizers: { some: { userId: viewerId } } }] : []),
              ],
            }),
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
    {
      schema: {
        tags: ['Events'],
        summary: 'Anlass-Details mit Schichten abrufen',
        description: 'Liefert alle Stammdaten, Schichten, Aufgaben, OK-Mitglieder und Anmeldezahlen für einen Anlass.',
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        querystring: z.object({
          zugang: z.string().optional().describe('Optionaler Zugangscode / Token'),
        }),
      },
      preHandler: [fastify.optionalAuthenticate],
    },
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
          contactUser: {
            select: { id: true, firstName: true, lastName: true, ceviName: true, phone: true, email: true },
          },
          dayResponsibles: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, ceviName: true, phone: true, email: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          organizers: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, ceviName: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          questions: { orderBy: { sortOrder: 'asc' } },
          shifts: {
            include: {
              responsibles: {
                include: {
                  user: {
                    select: { id: true, firstName: true, lastName: true, ceviName: true, phone: true, email: true },
                  },
                },
                orderBy: { createdAt: 'asc' },
              },
              tasks: { orderBy: { createdAt: 'asc' } },
              signups: {
                include: {
                  task: true,
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      ceviName: true,
                      birthDate: true,
                      homeDepartment: { select: { id: true, name: true } },
                      stufen: {
                        select: { stufe: { select: { id: true, name: true, sortOrder: true } } },
                        orderBy: { stufe: { sortOrder: 'asc' } },
                      },
                      ceviDbStufen: {
                        select: { groupName: true, isPrimary: true },
                        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
                      },
                    },
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
              birthDate: true,
              eventAnswers: { where: { eventId: event.id }, select: { questionId: true, value: true } },
            },
          })
        : null;

      const flags = await managerFlags(fastify.prisma, event, viewer);
      // Entwürfe (nicht veröffentlicht) sehen nur Abteilungsleitung, Planung und OK, auch nicht über den Link
      if (!event.isPublished && !flags.isManager) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }
      const hasGrant = viewer ? await hasValidGrant(fastify.prisma, event.id, viewer.id) : false;
      const access = evaluateEventAccess(event, request.tenant.name, viewer, flags, hasGrant);

      // «Nur für Mitglieder»: interne Anlässe zeigen Aussenstehenden keine Details (403, ohne Anlass-Daten),
      // ausser mit Zugangs-Link. Kein 404, sonst meinen Leute, der Link sei kaputt, statt sich anzumelden.
      // Öffentliche Anlässe (scope ANY) bleiben über ihren direkten Link für alle erreichbar.
      if (
        request.tenant.membersOnly &&
        accessTypeConfig(event.accessType).scope !== 'ANY' &&
        !flags.isManager &&
        !hasGrant &&
        !(await isValidLinkToken(event.id, request.query.zugang)) &&
        !(await isDepartmentInsider(fastify.prisma, request.tenant.id, viewer?.id))
      ) {
        reply.header('Cache-Control', 'no-store');
        return reply.status(403).send({
          error: viewer
            ? 'Dieser Anlass ist nur für Mitglieder der Abteilung.'
            : 'Dieser Anlass ist nur für Mitglieder der Abteilung. Bitte melde dich an.',
          code: 'MEMBERS_ONLY',
        });
      }

      const answers = Object.fromEntries((viewer?.eventAnswers ?? []).map((a) => [a.questionId, a.value]));
      const missingQuestionIds = event.questions
        .filter((q) => q.scope !== 'PER_SIGNUP' && q.required && !answers[q.id]?.trim())
        .map((q) => q.id);

      const contactVisibility = (event.contactVisibility as EventContactVisibility) || 'BOTH';

      const contactUser: ResponsiblePersonDto | null = event.contactUser
        ? toResponsiblePersonDto(event.contactUser, contactVisibility)
        : null;

      const dayResponsibles: Record<string, ResponsiblePersonDto[]> = {};
      for (const dr of event.dayResponsibles ?? []) {
        if (!dayResponsibles[dr.dayDate]) dayResponsibles[dr.dayDate] = [];
        dayResponsibles[dr.dayDate].push(toResponsiblePersonDto(dr.user, contactVisibility));
      }

      return {
        id: event.id,
        title: event.title,
        slug: event.slug,
        description: event.description,
        reminderNote: event.reminderNote || null,
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
        contactUserId: event.contactUserId || null,
        contactUser,
        dayCutoffTime: event.dayCutoffTime || '04:00',
        responsibleMode: (event.responsibleMode as 'BY_SHIFT' | 'BY_DAY') || 'BY_SHIFT',
        dayResponsibles,
        contactVisibility,
        signupOpensAt: event.signupOpensAt ? event.signupOpensAt.toISOString() : null,
        cancelDeadlineDays: event.cancelDeadlineDays ?? null,
        overlapToleranceMinutes: event.overlapToleranceMinutes ?? 15,
        attendanceMode: event.attendanceMode,
        checkinEarlyMinutes: event.checkinEarlyMinutes ?? 30,
        checkinLateMinutes: event.checkinLateMinutes ?? 30,
        allowReplacement: event.allowReplacement,
        replacementCutoffHours: event.replacementCutoffHours,
        checkinToken: access.isManager ? event.checkinToken : null,
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
          canTakeOver: canTakeOver(event, request.tenant.name, viewer, flags, hasGrant),
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
        shifts: (() => {
          // Eindeutige Namen für alle Personen berechnen, die eine Schicht im Anlass haben (A1)
          const disambiguationCandidates = new Map<string, DisambiguationCandidate>();
          for (const s of event.shifts) {
            for (const su of s.signups) {
              const isOwn = Boolean(viewer && su.userId === viewer.id);
              const showName = access.canSeeNames || isOwn;
              if (!showName) continue;

              const personKey = su.user?.id || `guest:${su.id}`;
              if (!disambiguationCandidates.has(personKey)) {
                disambiguationCandidates.set(personKey, {
                  personKey,
                  ceviName: su.user?.ceviName ?? null,
                  firstName: su.user?.firstName ?? null,
                  lastName: su.user?.lastName ?? null,
                  guestName: su.guestName ?? null,
                  stufe: extractPrimaryStufe(su.user),
                  departmentName: su.user?.homeDepartment?.name ?? null,
                });
              }
            }
          }
          const disambiguatedNames = disambiguatePersonNames([...disambiguationCandidates.values()]);

          return event.shifts.map((s) => {
            const signups = s.signups.map((su) => {
              const isOwn = Boolean(viewer && su.userId === viewer.id);
              const showName = access.canSeeNames || isOwn;
              const personKey = su.user?.id || `guest:${su.id}`;
              const displayName = showName
                ? disambiguatedNames.get(personKey) ||
                  su.user?.ceviName ||
                  (su.user ? `${su.user.firstName} ${su.user.lastName}`.trim() : null) ||
                  su.guestName ||
                  'Helfer*in'
                : 'Belegt';
            const userAge =
              access.isManager && su.user?.birthDate ? ageAt(su.user.birthDate, s.startTime) : null;

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
              ...(access.isManager
                ? {
                    attendance: su.attendance,
                    attendanceAt: su.attendanceAt?.toISOString() ?? null,
                    attendanceSource: su.attendanceSource,
                    attendanceByName: su.attendanceByName,
                  }
                : {}),
              // «Ersatz gesucht» sehen alle (sonst übernimmt niemand), Grund und Name nur mit Namen
              replacementWantedAt: su.replacementWantedAt?.toISOString() ?? null,
              replacementNote: showName ? su.replacementNote : null,
              replacementByName: showName ? su.replacementByName : null,
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

          const responsibles: ResponsiblePersonDto[] = s.responsibles.map((r) =>
            toResponsiblePersonDto(r.user, contactVisibility)
          );

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
            responsibles,
            tasks,
            signups,
          };
        });
      })(),
      };
    }
  );

  // Neues Event erstellen (Abteilungsleitung / Planer*in)
  fastify.post(
    '/api/events',
    {
      schema: {
        tags: ['Events'],
        summary: 'Neuen Anlass erstellen',
        description: 'Erstellt einen neuen Anlass mit Zielgruppe, Zugangsregeln und Einstellungen (Recht «Anlässe erstellen» erforderlich).',
        security: [{ bearerAuth: [] }],
        body: CreateEventSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      if (!(await hasDepartmentPermission(fastify.prisma, request.tenant.id, request.user.id, 'EVENTS_CREATE'))) {
        return reply.status(403).send({
          error:
            'Anlässe erstellen kann die Abteilungsleitung oder wer das Recht «Anlässe erstellen» hat. Bitte wende dich an deine Abteilungsleitung: Sie kann dir das Recht geben oder den Anlass für dich erstellen.',
        });
      }

      const parse = CreateEventSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const {
        title,
        slug,
        description,
        reminderNote,
        logoUrl,
        bannerUrl,
        startDate,
        allowPublicSignup,
        accessType,
        leadersOnly,
        requiredFields,
        minShiftsPerPerson,
        contactUserId,
        dayCutoffTime,
        responsibleMode,
        contactVisibility,
        signupOpensAt,
        cancelDeadlineDays,
        overlapToleranceMinutes,
        attendanceMode,
        checkinEarlyMinutes,
        checkinLateMinutes,
        allowReplacement,
        replacementCutoffHours,
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

      // Kontaktperson nur aus der eigenen Abteilung (der Anlass gibt es noch nicht)
      if (!(await allUsersRelatedTo(fastify.prisma, { departmentIds: [request.tenant.id] }, [contactUserId]))) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
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

      // Wer erstellt, kommt nicht automatisch ins OK (Entscheid 2026-10-25): Das OK wählt man im Formular.
      // Mit «Anlässe erstellen» allein sieht man den Anlass danach, ändert ihn aber nur über das OK.

      const departmentId = request.tenant.id;
      const event = await fastify.prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            departmentId,
            title,
            slug,
            description: description || null,
            reminderNote: reminderNote?.trim() || null,
            logoUrl: logoUrl || null,
            bannerUrl: bannerUrl || null,
            // Bis es Schichten gibt, ist der Anlass ein Zeitpunkt; danach führt syncEventRange nach
            startDate: new Date(startDate),
            endDate: new Date(startDate),
            allowPublicSignup,
            accessType,
            leadersOnly,
            requiredFields,
            minShiftsPerPerson: minShiftsPerPerson ?? null,
            contactUserId: contactUserId || null,
            dayCutoffTime: dayCutoffTime || '04:00',
            responsibleMode: responsibleMode || 'BY_SHIFT',
            contactVisibility: contactVisibility || 'BOTH',
            signupOpensAt: signupOpensAt ? new Date(signupOpensAt) : null,
            cancelDeadlineDays: cancelDeadlineDays ?? null,
            overlapToleranceMinutes: overlapToleranceMinutes ?? 15,
            attendanceMode: attendanceMode ?? 'OFF',
            checkinEarlyMinutes: checkinEarlyMinutes ?? 30,
            checkinLateMinutes: checkinLateMinutes ?? 30,
            checkinToken: attendanceMode === 'OK_AND_QR' ? generateCheckinToken() : null,
            allowReplacement: allowReplacement ?? true,
            replacementCutoffHours: replacementCutoffHours ?? 0,
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
    {
      schema: {
        tags: ['Events'],
        summary: 'Anlass bearbeiten',
        description: 'Aktualisiert Titel, Beschreibung, Banner, Zugangsbeschränkungen oder Fristen eines Anlasses.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: UpdateEventSchema,
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
        include: {
          organizers: true,
          allowedDepartments: { select: { departmentId: true } },
          allowedStufen: { select: { stufeId: true } },
        },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      // Einstellungen (Zugang, Design, Fragen) nur Abteilungsleitung und OK-Leitung, wie im Frontend.
      // OK-Mitglieder planen Schichten, ändern aber nicht, wer sich eintragen darf.
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.SETTINGS) {
        return reply
          .status(403)
          .send({ error: 'Nur die Abteilungsleitung oder die OK-Leitung dürfen diesen Anlass bearbeiten' });
      }

      const parse = UpdateEventSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }
      const body = parse.data;
      if (body.contactUserId && !(await allUsersRelatedToEvent(fastify.prisma, event.id, [body.contactUserId]))) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
      }

      // Prüfen, ob der neue Slug bereits von einem anderen Event der Abteilung genutzt wird
      let newSlug: string | undefined = undefined;
      if (body.slug && body.slug !== event.slug) {
        const slugConflict = await fastify.prisma.event.findUnique({
          where: {
            departmentId_slug: {
              departmentId: request.tenant.id,
              slug: body.slug,
            },
          },
        });
        if (slugConflict && slugConflict.id !== event.id) {
          return reply.status(409).send({ error: 'Ein Event mit dieser Adresse (Slug) existiert bereits in dieser Abteilung' });
        }
        newSlug = body.slug;
      }

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
            slug: newSlug,
            description: body.description,
            reminderNote: body.reminderNote !== undefined ? (body.reminderNote?.trim() || null) : undefined,
            logoUrl: body.logoUrl,
            bannerUrl: body.bannerUrl,
            allowPublicSignup: body.allowPublicSignup,
            accessType: body.accessType,
            leadersOnly: body.leadersOnly,
            requiredFields: body.requiredFields,
            minShiftsPerPerson: body.minShiftsPerPerson !== undefined ? body.minShiftsPerPerson : undefined,
            contactUserId: body.contactUserId !== undefined ? (body.contactUserId || null) : undefined,
            dayCutoffTime: body.dayCutoffTime !== undefined ? body.dayCutoffTime : undefined,
            responsibleMode: body.responsibleMode !== undefined ? body.responsibleMode : undefined,
            contactVisibility: body.contactVisibility !== undefined ? body.contactVisibility : undefined,
            signupOpensAt: body.signupOpensAt !== undefined ? (body.signupOpensAt ? new Date(body.signupOpensAt) : null) : undefined,
            cancelDeadlineDays: body.cancelDeadlineDays !== undefined ? body.cancelDeadlineDays : undefined,
            overlapToleranceMinutes: body.overlapToleranceMinutes !== undefined ? body.overlapToleranceMinutes : undefined,
            attendanceMode: body.attendanceMode,
            checkinEarlyMinutes: body.checkinEarlyMinutes !== undefined ? body.checkinEarlyMinutes : undefined,
            checkinLateMinutes: body.checkinLateMinutes !== undefined ? body.checkinLateMinutes : undefined,
            allowReplacement: body.allowReplacement,
            replacementCutoffHours: body.replacementCutoffHours,
            // Beim ersten Einschalten des Selbst-Check-ins einen Code erzeugen; der bestehende bleibt sonst gültig
            checkinToken:
              body.attendanceMode === 'OK_AND_QR' && !event.checkinToken ? generateCheckinToken() : undefined,
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
        startDate: updated.startDate.toISOString(),
        endDate: updated.endDate.toISOString(),
        accessType: updated.accessType,
        contactVisibility: updated.contactVisibility,
        signupOpensAt: updated.signupOpensAt ? updated.signupOpensAt.toISOString() : null,
        cancelDeadlineDays: updated.cancelDeadlineDays,
        overlapToleranceMinutes: updated.overlapToleranceMinutes,
        attendanceMode: updated.attendanceMode,
        checkinEarlyMinutes: updated.checkinEarlyMinutes,
        checkinLateMinutes: updated.checkinLateMinutes,
        allowReplacement: updated.allowReplacement,
        replacementCutoffHours: updated.replacementCutoffHours,
      };
    }
  );

  // Anlass verschieben: alle Schichten wandern um dieselbe Anzahl Tage mit (Rechte wie Einstellungen)
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/move',
    {
      schema: {
        tags: ['Events'],
        summary: 'Anlass verschieben',
        description: 'Verschiebt den gesamten Anlass und alle zugehörigen Schichten um eine bestimmte Anzahl Tage.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: MoveEventSchema,
      },
      preHandler: [fastify.authenticate],
    },
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
      if (!flags.can.SETTINGS) {
        return reply
          .status(403)
          .send({ error: 'Nur die Abteilungsleitung oder die OK-Leitung dürfen diesen Anlass verschieben' });
      }
      const parse = MoveEventSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const movedShifts = await fastify.prisma.$transaction((tx) => moveEventByDays(tx, event, parse.data.days));
      const updated = await fastify.prisma.event.findUniqueOrThrow({ where: { id: event.id } });
      request.log.info({ eventId: event.id, days: parse.data.days, movedShifts }, 'Anlass verschoben');

      return {
        movedShifts,
        startDate: updated.startDate.toISOString(),
        endDate: updated.endDate.toISOString(),
      };
    }
  );

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

      const parse = SetDayResponsiblesSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      if (!(await allUsersRelatedToEvent(fastify.prisma, event.id, parse.data.userIds))) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
      }

      await fastify.prisma.$transaction(async (tx) => {
        await tx.eventDayResponsible.deleteMany({
          where: {
            eventId: event.id,
            dayDate,
          },
        });
        if (parse.data.userIds.length > 0) {
          await tx.eventDayResponsible.createMany({
            data: parse.data.userIds.map((userId) => ({
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
            select: { id: true, firstName: true, lastName: true, ceviName: true, phone: true, email: true },
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
            select: { id: true, firstName: true, lastName: true, ceviName: true },
          },
        },
      });

      return {
        id: organizer.id,
        userId: organizer.userId,
        displayName: organizer.user.ceviName
          ? `${organizer.user.firstName} / ${organizer.user.ceviName}`
          : `${organizer.user.firstName} ${organizer.user.lastName}`,
        role: organizer.role,
        roleTitle: organizer.roleTitle,
      };
    }
  );

  // Anlass endgültig löschen: nur Abteilungsleitung (inkl. globale Admins), nicht die OK-Leitung.
  // Zur Bestätigung muss das Kürzel mitkommen (Schutz vor einem versehentlichen Klick).
  fastify.delete<{ Params: { slug: string } }>(
    '/api/events/:slug',
    {
      schema: {
        tags: ['Events'],
        summary: 'Anlass endgültig löschen',
        description: 'Löscht den Anlass samt aller Schichten, Eintragungen und Dokumente unwiderruflich (Bestätigung des Slugs erforderlich).',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: ConfirmDeleteSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await fastify.prisma.event.findUnique({
        where: { departmentId_slug: { departmentId: request.tenant.id, slug: request.params.slug } },
        select: { id: true, slug: true, title: true, departmentId: true, organizers: true },
      });
      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.DELETE) {
        return reply.status(403).send({ error: 'Anlässe löschen darf nur die Abteilungsleitung oder wer das Recht «Anlässe löschen» hat' });
      }

      const parse = ConfirmDeleteSchema.safeParse(request.body ?? {});
      if (!parse.success || parse.data.confirm !== event.slug) {
        return reply.status(400).send({ error: 'Zur Bestätigung das Kürzel des Anlasses genau eintippen.' });
      }

      // Kaskadiert zu Schichten, Eintragungen, OK, Fragen, Zugangs-Links, Protokoll und Nachrichten
      await fastify.prisma.event.delete({ where: { id: event.id } });

      request.log.warn(
        { userId: request.user.id, eventId: event.id, slug: event.slug, departmentId: event.departmentId },
        'Anlass von der Abteilungsleitung gelöscht'
      );
      return { message: `«${event.title}» wurde gelöscht` };
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

      const signupsToCancel = await fastify.prisma.shiftSignup.findMany({
        where: whereClause,
        include: {
          shift: true,
          task: true,
          user: {
            select: { id: true, firstName: true, lastName: true, ceviName: true },
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
                select: { firstName: true, lastName: true, ceviName: true },
              })
            : null;
          const performerName = performerUser
            ? (performerUser.ceviName ? `${performerUser.firstName} / ${performerUser.ceviName}` : `${performerUser.firstName} ${performerUser.lastName}`.trim())
            : null;
          const pLabel = performerName ? `${performerName} (OK)` : 'OK';

          await fastify.prisma.shiftSignupLog.createMany({
            data: signupsToCancel.map((su) => {
              const hName = su.user
                ? (su.user.ceviName ? `${su.user.firstName} / ${su.user.ceviName}` : `${su.user.firstName} ${su.user.lastName}`.trim())
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

  // Event als Vorlage für künftige Jahre speichern
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/save-as-template',
    {
      schema: {
        tags: ['Events'],
        summary: 'Anlass als Vorlage speichern',
        description: 'Speichert Struktur, Schichten und Aufgaben dieses Anlasses als wiederverwendbare Vorlage für zukünftige Jahre.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: SaveAsTemplateSchema,
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
      if (!flags.can.TEMPLATES) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Erstellen von Vorlagen' });
      }

      const parse = SaveAsTemplateSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const templateTitle = parse.data.title || `${event.title} (Vorlage)`;
      const templateDescription = parse.data.description || event.description || null;

      // Tag und Uhrzeit relativ zum ersten Tag, alles in Schweizer Zeit (der Server läuft in UTC)
      const baseDay = zurichDayKey(event.startDate);

      const shiftTemplates = event.shifts.map((s) => {
        const dayOffset = Math.max(0, dayKeyDiff(baseDay, zurichDayKey(s.startTime)));

        return {
          title: s.title,
          category: s.category,
          isSetupTeardown: s.isSetupTeardown,
          description: s.description,
          minAge: s.minAge,
          dayOffset,
          startTimeStr: zurichTimeKey(s.startTime),
          endTimeStr: zurichTimeKey(s.endTime),
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
          cancelDeadlineDays: event.cancelDeadlineDays ?? null,
          overlapToleranceMinutes: event.overlapToleranceMinutes ?? 15,
          data: {
            shifts: shiftTemplates,
            dayCutoffTime: event.dayCutoffTime,
            responsibleMode: event.responsibleMode,
            contactVisibility: event.contactVisibility,
            attendanceMode: event.attendanceMode,
            allowReplacement: event.allowReplacement,
            replacementCutoffHours: event.replacementCutoffHours,
            reminderNote: event.reminderNote || null,
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
