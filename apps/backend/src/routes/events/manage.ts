import { z } from 'zod';
import { FastifyPluginAsync } from 'fastify';
import {
  CreateEventSchema,
  SaveAsTemplateSchema,
  UpdateEventSchema,
  MoveEventSchema,
  dayKeyDiff,
  zurichDayKey,
  zurichTimeKey,
  ConfirmDeleteSchema,
} from '@schichtplan/shared';
import {
  managerFlags,
} from '../../services/eventAccess.js';
import { resolveOrganizerUser } from '../../services/ceviNameLogin.js';
import { hasDepartmentPermission } from '../../services/permissions.js';
import {
  UNRELATED_PERSON_ERROR,
  allUsersRelatedTo,
  allUsersRelatedToEvent,
} from '../../services/departmentVisibility.js';
import { generateCheckinToken } from '../../services/attendance.js';
import { moveEventByDays } from '../../services/eventRange.js';

import { toQuestionDto, resolveAccessLists, syncQuestions, replaceAccessLists } from './shared.js';

/** Anlässe anlegen, bearbeiten, verschieben, löschen und als Vorlage speichern */
const eventManageRoutes: FastifyPluginAsync = async (fastify) => {
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
        cateringTokensEnabled,
        cateringTokenItems,
        cateringEarlyHours,
        cateringStaffPin,
        cateringRemindersEnabled,
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
            cateringTokensEnabled: cateringTokensEnabled ?? false,
            cateringTokenItems: cateringTokenItems ?? ['1x Helfermenü', '1x Getränk'],
            cateringEarlyHours: cateringEarlyHours ?? 2,
            cateringStaffPin: cateringStaffPin?.trim() || null,
            cateringRemindersEnabled: cateringRemindersEnabled ?? true,
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
            cateringTokensEnabled: body.cateringTokensEnabled !== undefined ? body.cateringTokensEnabled : undefined,
            cateringTokenItems: body.cateringTokenItems !== undefined ? body.cateringTokenItems : undefined,
            cateringEarlyHours: body.cateringEarlyHours !== undefined ? body.cateringEarlyHours : undefined,
            cateringStaffPin:
              body.cateringStaffPin !== undefined ? body.cateringStaffPin?.trim() || null : undefined,
            cateringRemindersEnabled:
              body.cateringRemindersEnabled !== undefined ? body.cateringRemindersEnabled : undefined,
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
        cateringTokensEnabled: updated.cateringTokensEnabled,
        cateringTokenItems: updated.cateringTokenItems,
        cateringEarlyHours: updated.cateringEarlyHours,
        cateringStaffPin: updated.cateringStaffPin,
        cateringRemindersEnabled: updated.cateringRemindersEnabled,
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

export default eventManageRoutes;
