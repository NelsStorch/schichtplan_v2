import { z } from 'zod';
import { FastifyPluginAsync } from 'fastify';
import {
  accessTypeConfig,
  isPlaceholderEmail,
  toEventAccessType,
  ageAt,
  type ResponsiblePersonDto,
  type EventContactVisibility,
  type EventPendingLinkDto,
} from '@schichtplan/shared';
import {
  accessEventInclude,
  accessUserSelect,
  audienceLabel,
  checkRules,
  evaluateEventAccess,
  hasValidGrant,
  managerFlags,
} from '../../services/eventAccess.js';
import { departmentAccess, } from '../../services/permissions.js';
import {
  isDepartmentInsider,
} from '../../services/departmentVisibility.js';
import { cleanRequiredFields, missingProfileFields } from '../../services/profile.js';
import {
  disambiguatePersonNames,
  extractPrimaryStufe,
  type DisambiguationCandidate,
} from '../../services/disambiguation.js';
import { canTakeOver } from '../../services/replacement.js';
import { toEventPreview } from '../../services/eventPreview.js';

import { toQuestionDto, toResponsiblePersonDto, } from './shared.js';

/** Anlässe lesen: Liste und Details (Namen und Kontaktangaben je nach Berechtigung) */
const eventReadRoutes: FastifyPluginAsync = async (fastify) => {
  /** Ungelöster Einladungs-Link (?zugang=) erlaubt das Ansehen, damit man ihn danach einlösen kann */
  async function isValidLinkToken(eventId: string, token: string | undefined, viewerId?: string) {
    if (!token || token.length > 100) return false;
    const link = await fastify.prisma.eventAccessLink.findUnique({
      where: { token },
      select: { eventId: true, expiresAt: true, kind: true, boundUserId: true },
    });
    if (!link || link.eventId !== eventId) return false;
    if (link.expiresAt && link.expiresAt <= new Date()) return false;
    // Persönlicher Link: nur gültig, wenn noch frei oder bereits an diese Person gebunden.
    // Schon gebunden und niemand angemeldet: nicht mehr gültig (sonst öffnete er den Anlass für alle).
    if (link.kind === 'PERSONAL' && link.boundUserId && link.boundUserId !== viewerId) {
      return false;
    }
    return true;
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

  // Eckdaten für Link-Vorschauen (WhatsApp & Co.): nur öffentliche, veröffentlichte Anlässe, ohne Personendaten
  fastify.get<{ Params: { slug: string }; Querystring: { schicht?: string } }>(
    '/api/events/:slug/preview',
    {
      schema: {
        tags: ['Events'],
        summary: 'Link-Vorschau eines Anlasses',
        description:
          'Liefert Titel, Zeitraum und freie Plätze eines öffentlichen Anlasses für Link-Vorschauen. Interne Anlässe und Entwürfe ergeben 404.',
        params: z.object({ slug: z.string().max(200).describe('Slug des Anlasses') }),
        querystring: z.object({
          schicht: z.string().uuid().optional().describe('Optional: Schicht für eine Schicht-Vorschau'),
        }),
      },
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(404).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await fastify.prisma.event.findUnique({
        where: { departmentId_slug: { departmentId: request.tenant.id, slug: request.params.slug } },
        select: {
          id: true,
          title: true,
          slug: true,
          logoUrl: true,
          bannerUrl: true,
          startDate: true,
          endDate: true,
          dayCutoffTime: true,
          isPublished: true,
          accessType: true,
          leadersOnly: true,
          allowPublicSignup: true,
          updatedAt: true,
          shifts: { select: { requiredSlots: true, _count: { select: { signups: true } } } },
        },
      });
      const shift =
        event && request.query.schicht
          ? await fastify.prisma.shift.findFirst({
              where: { id: request.query.schicht, eventId: event.id },
              select: {
                id: true,
                title: true,
                category: true,
                startTime: true,
                endTime: true,
                requiredSlots: true,
                _count: { select: { signups: true } },
                tasks: { select: { title: true }, take: 2 },
              },
            })
          : null;
      const preview = event ? toEventPreview(event, new Date(), shift) : null;
      // Gleiche Antwort für «gibt es nicht» und «nicht öffentlich»: verrät nicht, ob ein interner Anlass existiert
      if (!preview) {
        reply.header('Cache-Control', 'no-store');
        return reply.status(404).send({ error: 'Keine Vorschau verfügbar' });
      }
      reply.header('Cache-Control', 'public, max-age=60');
      return preview;
    }
  );

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
            select: { id: true, firstName: true, lastName: true, nickname: true, phone: true, email: true },
          },
          dayResponsibles: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, nickname: true, phone: true, email: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          organizers: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, nickname: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          questions: { orderBy: { sortOrder: 'asc' } },
          shifts: {
            include: {
              responsibles: {
                include: {
                  user: {
                    select: { id: true, firstName: true, lastName: true, nickname: true, phone: true, email: true },
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
                      nickname: true,
                      birthDate: true,
                      phone: true,
                      email: true,
                      homeDepartment: { select: { id: true, name: true } },
                      stufen: {
                        select: { stufe: { select: { id: true, name: true, sortOrder: true } } },
                        orderBy: { stufe: { sortOrder: 'asc' } },
                      },
                      hitobitoStufen: {
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
        !(await isValidLinkToken(event.id, request.query.zugang, viewer?.id)) &&
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

      let pendingLink: EventPendingLinkDto | null = null;
      if (request.query.zugang) {
        const pl = await fastify.prisma.eventAccessLink.findUnique({
          where: { token: request.query.zugang },
          select: { id: true, eventId: true, label: true, kind: true, expiresAt: true, boundUserId: true },
        });
        if (pl && pl.eventId === event.id) {
          const isExpired = Boolean(pl.expiresAt && pl.expiresAt <= new Date());
          const isBoundToOther = Boolean(pl.kind === 'PERSONAL' && pl.boundUserId && viewer && pl.boundUserId !== viewer.id);
          const isBoundToMe = Boolean(pl.kind === 'PERSONAL' && pl.boundUserId && viewer && pl.boundUserId === viewer.id);
          const alreadyHasAccess =
            flags.isManager || (viewer ? checkRules(event, viewer, request.tenant.name).ok : false);
          const alreadyRedeemed = pl.kind === 'PERSONAL' ? isBoundToMe : hasGrant;
          pendingLink = {
            token: request.query.zugang,
            label: pl.label,
            kind: pl.kind === 'GROUP' ? 'GROUP' : 'PERSONAL',
            isExpired,
            isBoundToOther,
            isBoundToMe,
            alreadyRedeemed,
            alreadyHasAccess,
            expiresAt: pl.expiresAt ? pl.expiresAt.toISOString() : null,
          };
        }
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
        cateringTokensEnabled: event.cateringTokensEnabled,
        cateringTokenItems: event.cateringTokenItems,
        cateringEarlyHours: event.cateringEarlyHours ?? 2,
        // Der Stand-PIN öffnet das Entwerten von Papier-Bons: nur für das OK
        cateringStaffPin: access.isManager ? event.cateringStaffPin : null,
        cateringRemindersEnabled: event.cateringRemindersEnabled,
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
          pendingLink,
        },
        organizers: event.organizers.map((o) => ({
          id: o.id,
          eventId: o.eventId,
          userId: o.userId,
          userFirstName: o.user.firstName,
          userLastName: o.user.lastName,
          userNickname: o.user.nickname,
          userCeviName: o.user.nickname,
          displayName: o.user.nickname
            ? `${o.user.firstName} / ${o.user.nickname}`
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
                  nickname: su.user?.nickname ?? null,
                  ceviName: su.user?.nickname ?? null,
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
                  su.user?.nickname ||
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
              userEmail: access.isManager && su.user?.email && !isPlaceholderEmail(su.user.email) ? su.user.email : null,
              userPhone: access.isManager ? su.user?.phone || null : null,
              displayName,
              userFirstName: showName ? su.user?.firstName || null : null,
              userLastName: showName ? su.user?.lastName || null : null,
              userNickname: showName ? su.user?.nickname || null : null,
              userCeviName: showName ? su.user?.nickname || null : null,
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
};

export default eventReadRoutes;
