import crypto from 'crypto';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CreateAccessLinkSchema,
  EventDeregistrationSchema,
  EventParticipationSchema,
  RedeemAccessLinkSchema,
  accessTypeConfig,
  ageAt,
  isPlaceholderEmail,
  type EventAccessLinkDto,
  type EventParticipantDto,
  type EventRosterItemDto,
  type EventRosterResponseDto,
} from '@schichtplan/shared';
import {
  audienceLabel,
  checkRules,
  managerFlags,
  type AccessUser,
} from '../services/eventAccess.js';
import { UNRELATED_PERSON_ERROR, allUsersRelatedToEvent, eventRelatedPeopleWhere } from '../services/departmentVisibility.js';
import { personLabel } from '../services/profile.js';
import {
  disambiguatePersonNames,
  extractPrimaryStufe,
  type DisambiguationCandidate,
} from '../services/disambiguation.js';
import { applyProfileUpdate } from '../services/profileUpdate.js';

/** Fehlermeldung bei ungültiger Antwort (Auswahl nicht in den Optionen, Ja/Nein falsch), sonst null */
export function validateAnswers(
  questions: { id: string; label: string; type: string; options: string[] }[],
  answers: Record<string, string>
): string | null {
  for (const question of questions) {
    const value = (answers[question.id] ?? '').trim();
    if (question.type === 'CHOICE' && value && !question.options.includes(value)) {
      return `Ungültige Antwort bei «${question.label}»`;
    }
    if (question.type === 'YES_NO' && value && value !== 'JA' && value !== 'NEIN') {
      return `Bitte Ja oder Nein bei «${question.label}»`;
    }
  }
  return null;
}

const displayNameOf = (u: { nickname?: string | null; ceviName?: string | null; firstName: string; lastName: string | null }) =>
  u.nickname || u.ceviName || `${u.firstName} ${u.lastName ?? ''}`.trim();

/** Zugangs-Links, Pflichtangaben/Fragen und die Teilnehmerliste fürs OK */
const eventParticipationRoutes: FastifyPluginAsync = async (fastify) => {
  async function loadEvent(request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) {
    if (!request.tenant) {
      reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      return null;
    }
    const event = await fastify.prisma.event.findUnique({
      where: { departmentId_slug: { departmentId: request.tenant.id, slug: request.params.slug } },
      include: { organizers: { select: { userId: true, role: true } } },
    });
    // Entwürfe gibt es nur für die Abteilungsleitung und das OK
    if (!event || (!event.isPublished && !(await managerFlags(fastify.prisma, event, request.user ?? null)).isManager)) {
      reply.status(404).send({ error: 'Event nicht gefunden' });
      return null;
    }
    return event;
  }

  /** Anlass laden und Fähigkeit prüfen: VIEW zum Ansehen, HELPERS zum Ändern */
  async function loadManagedEvent(
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
    capability: 'VIEW' | 'HELPERS' = 'VIEW'
  ) {
    const event = await loadEvent(request, reply);
    if (!event) return null;
    const flags = await managerFlags(fastify.prisma, event, request.user);
    if (!flags.can[capability]) {
      reply.status(403).send({ error: 'Nur die Abteilungsleitung oder das Event-OK' });
      return null;
    }
    return event;
  }

  // Zugangs-Links eines Anlasses (OK)
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/access-links',
    {
      schema: {
        tags: ['Events'],
        summary: 'Zugangs-Links eines Anlasses auflisten (OK)',
        description: 'Liefert alle erstellten persönlichen und Gruppen-Zugangslinks für diesen Anlass.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await loadManagedEvent(request, reply);
      if (!event) return;
      reply.header('Cache-Control', 'no-store');

      const links = await fastify.prisma.eventAccessLink.findMany({
        where: { eventId: event.id },
        include: {
          grants: {
            include: { user: { select: { id: true, nickname: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Gebundene Personen fuer persoenliche Links nachladen, falls Grants anderweitig umgehaengt wurden
      const boundUserIds = [
        ...new Set(
          links
            .filter((l) => l.kind === 'PERSONAL' && l.boundUserId && l.grants.length === 0)
            .map((l) => l.boundUserId!)
        ),
      ];
      const boundUsers = boundUserIds.length
        ? await fastify.prisma.user.findMany({
            where: { id: { in: boundUserIds } },
            select: { id: true, nickname: true, firstName: true, lastName: true },
          })
        : [];
      const boundUserMap = new Map(boundUsers.map((u) => [u.id, u]));

      const now = new Date();
      return links.map((link): EventAccessLinkDto => {
        let redeemedBy = link.grants.map((g) => ({
          userId: g.user.id,
          displayName: displayNameOf(g.user),
          redeemedAt: g.createdAt.toISOString(),
        }));
        if (redeemedBy.length === 0 && link.kind === 'PERSONAL' && link.boundUserId) {
          const boundUser = boundUserMap.get(link.boundUserId);
          if (boundUser) {
            redeemedBy = [
              {
                userId: boundUser.id,
                displayName: displayNameOf(boundUser),
                redeemedAt: link.createdAt.toISOString(),
              },
            ];
          }
        }
        return {
          id: link.id,
          label: link.label,
          kind: link.kind === 'GROUP' ? 'GROUP' : 'PERSONAL',
          token: link.token,
          expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
          createdAt: link.createdAt.toISOString(),
          isExpired: Boolean(link.expiresAt && link.expiresAt <= now),
          redeemedBy,
        };
      });
    }
  );

  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/access-links',
    {
      schema: {
        tags: ['Events'],
        summary: 'Neuen Zugangs-Link erstellen (OK)',
        description: 'Erstellt einen persönlichen oder Gruppen-Link für Personen ausserhalb der normalen Zielgruppe.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: CreateAccessLinkSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await loadManagedEvent(request, reply, 'HELPERS');
      if (!event) return;

      const input = request.body as z.output<typeof CreateAccessLinkSchema>;

      const link = await fastify.prisma.eventAccessLink.create({
        data: {
          eventId: event.id,
          token: crypto.randomBytes(18).toString('base64url'),
          label: input.label,
          kind: input.kind,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdById: request.user.id,
        },
      });

      return reply.status(201).send({ id: link.id, token: link.token });
    }
  );

  // Link löschen: wer ihn eingelöst hat, verliert den Zugang (bestehende Eintragungen bleiben)
  fastify.delete<{ Params: { slug: string; linkId: string } }>(
    '/api/events/:slug/access-links/:linkId',
    {
      schema: {
        tags: ['Events'],
        summary: 'Zugangs-Link widerrufen (OK)',
        description: 'Löscht einen Zugangs-Link. Bereits eingelöste Zugänge verfallen.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
          linkId: z.string().uuid().describe('ID des Zugangslinks'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await loadManagedEvent(request, reply, 'HELPERS');
      if (!event) return;

      const deleted = await fastify.prisma.eventAccessLink.deleteMany({
        where: { id: request.params.linkId, eventId: event.id },
      });
      if (deleted.count === 0) {
        return reply.status(404).send({ error: 'Link nicht gefunden' });
      }
      return { message: 'Link gelöscht' };
    }
  );

  // Link einlösen (angemeldet): persönliche Links gelten nur für das erste Konto, Gruppen-Links für alle
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/access-links/redeem',
    {
      schema: {
        tags: ['Events'],
        summary: 'Zugangs-Link einlösen',
        description: 'Löst einen persönlichen oder Gruppen-Link für das angemeldete Benutzerkonto ein.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: RedeemAccessLinkSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await loadEvent(request, reply);
      if (!event) return;

      const input = request.body as z.output<typeof RedeemAccessLinkSchema>;

      const link = await fastify.prisma.eventAccessLink.findUnique({ where: { token: input.token } });
      if (!link || link.eventId !== event.id) {
        return reply.status(404).send({ error: 'Dieser Link ist ungültig oder wurde gelöscht.' });
      }
      if (link.expiresAt && link.expiresAt <= new Date()) {
        return reply.status(410).send({ error: 'Dieser Link ist abgelaufen. Melde dich beim OK.' });
      }

      const userId = request.user.id;
      if (link.kind === 'PERSONAL') {
        // Atomar binden: nur wenn noch niemand (oder diese Person) den Link hat
        const bound = await fastify.prisma.eventAccessLink.updateMany({
          where: { id: link.id, OR: [{ boundUserId: null }, { boundUserId: userId }] },
          data: { boundUserId: userId },
        });
        if (bound.count === 0) {
          return reply.status(409).send({
            error: 'Dieser persönliche Link wurde bereits von einer anderen Person verwendet.',
          });
        }
      }

      await fastify.prisma.eventAccessGrant.upsert({
        where: { eventId_userId: { eventId: event.id, userId } },
        update: { linkId: link.id },
        create: { eventId: event.id, userId, linkId: link.id },
      });

      return { message: `Zugang zu «${event.title}» freigeschaltet`, label: link.label };
    }
  );

  // Pflichtangaben und Antworten der angemeldeten Person für diesen Anlass speichern
  fastify.put<{ Params: { slug: string } }>(
    '/api/events/:slug/participation',
    {
      schema: {
        tags: ['Events'],
        summary: 'Pflichtangaben und Fragen zur Teilnahme speichern',
        description: 'Aktualisiert Profilangaben und beantwortet anlassspezifische Pflichtfragen.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: EventParticipationSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await loadEvent(request, reply);
      if (!event) return;

      const input = request.body as z.output<typeof EventParticipationSchema>;

      if (input.profile) {
        const result = await applyProfileUpdate(fastify.prisma, request.user.id, input.profile);
        if ('error' in result) return reply.status(result.status).send({ error: result.error });
      }

      const answers = input.answers ?? {};
      // Hier nur Fragen, die einmal pro Anlass gelten; PER_SIGNUP-Antworten kommen mit der Eintragung
      const questions = await fastify.prisma.eventQuestion.findMany({
        where: { eventId: event.id, id: { in: Object.keys(answers) }, scope: 'ONCE' },
      });
      const invalid = validateAnswers(questions, answers);
      if (invalid) return reply.status(400).send({ error: invalid });

      await fastify.prisma.$transaction(
        questions.map((question) => {
          const value = answers[question.id].trim();
          const where = { questionId_userId: { questionId: question.id, userId: request.user.id } };
          return value
            ? fastify.prisma.eventAnswer.upsert({
                where,
                update: { value },
                create: { eventId: event.id, questionId: question.id, userId: request.user.id, value },
              })
            : fastify.prisma.eventAnswer.deleteMany({
                where: { questionId: question.id, userId: request.user.id },
              });
        })
      );

      return { message: 'Angaben gespeichert' };
    }
  );

  // Angaben aller eingetragenen Personen (nur OK / Abteilungsleitung)
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/participants',
    {
      schema: {
        tags: ['Events'],
        summary: 'Liste aller Teilnehmenden und Antworten (OK)',
        description: 'Liefert alle eingetragenen Personen inklusive Kontaktdaten, Alterskriterien und Antworten auf Anlassfragen.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await loadManagedEvent(request, reply);
      if (!event) return;
      reply.header('Cache-Control', 'no-store');

      const signups = await fastify.prisma.shiftSignup.findMany({
        where: { shift: { eventId: event.id } },
        include: {
          shift: { select: { title: true, startTime: true } },
          answers: { select: { questionId: true, value: true } },
          user: {
            select: {
              id: true,
              nickname: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              birthDate: true,
              homeDepartment: { select: { name: true } },
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
      });

      const [answers, grants] = await Promise.all([
        fastify.prisma.eventAnswer.findMany({ where: { eventId: event.id } }),
        fastify.prisma.eventAccessGrant.findMany({ where: { eventId: event.id }, select: { userId: true } }),
      ]);
      const grantUserIds = new Set(grants.map((g) => g.userId));

      const byPerson = new Map<string, EventParticipantDto>();
      for (const su of signups) {
        const key = su.user ? `u:${su.user.id}` : `g:${(su.guestName || '').toLowerCase()}`;
        const signupAnswers = su.answers.length
          ? [
              {
                shiftTitle: su.shift.title,
                startTime: su.shift.startTime.toISOString(),
                answers: Object.fromEntries(su.answers.map((a) => [a.questionId, a.value])),
              },
            ]
          : [];
        const existing = byPerson.get(key);
        if (existing) {
          existing.shiftCount++;
          existing.signupAnswers.push(...signupAnswers);
          continue;
        }
        const u = su.user;
        byPerson.set(key, {
          userId: u?.id ?? null,
          displayName: u ? displayNameOf(u) : su.guestName || 'Helfer*in',
          firstName: u?.firstName ?? null,
          lastName: u?.lastName ?? null,
          email: u?.email && !isPlaceholderEmail(u.email) ? u.email : su.guestEmail,
          phone: u?.phone ?? su.guestPhone,
          birthDate: u?.birthDate ? u.birthDate.toISOString().slice(0, 10) : null,
          homeDepartmentName: u?.homeDepartment?.name ?? null,
          viaLink: Boolean(u && grantUserIds.has(u.id)),
          shiftCount: 1,
          signupAnswers,
          answers: u
            ? Object.fromEntries(answers.filter((a) => a.userId === u.id).map((a) => [a.questionId, a.value]))
            : {},
        });
      }

      // Eindeutige Namen für alle Personen im Roster berechnen (A1)
      const rosterCandidates: DisambiguationCandidate[] = [];
      for (const [key, p] of byPerson.entries()) {
        const su = signups.find((s) => (s.user ? `u:${s.user.id}` === key : `g:${(s.guestName || '').toLowerCase()}` === key));
        rosterCandidates.push({
          personKey: key,
          nickname: su?.user?.nickname ?? null,
          ceviName: su?.user?.nickname ?? null,
          firstName: p.firstName,
          lastName: p.lastName,
          guestName: su?.guestName ?? null,
          stufe: extractPrimaryStufe(su?.user),
          departmentName: p.homeDepartmentName,
        });
      }
      const rosterDisambiguated = disambiguatePersonNames(rosterCandidates);
      for (const [key, p] of byPerson.entries()) {
        p.displayName = rosterDisambiguated.get(key) || p.displayName;
      }

      return [...byPerson.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'));
    }
  );

  // Helfer-Pool & Soll-Übersicht für das OK:
  // Alle Personen, die Zugriff auf den Event haben (inkl. Cevi-Name, Abteilung, Stufe, Alter, Schichten, Abmelde-Status).
  // `?alle=1`: zusätzlich Personen ohne Zugang (`hasAccess: false`), fürs Einteilen durch das OK. Nur aus der
  // Abteilung des Anlasses (Heimabteilung oder Mitgliedschaft), wie die Mitgliederliste: nie Personen fremder
  // Abteilungen (Whitelist) und nie Personen ohne Bezug zur Abteilung.
  fastify.get<{ Params: { slug: string }; Querystring: { alle?: string } }>(
    '/api/events/:slug/roster',
    {
      schema: {
        tags: ['Events'],
        summary: 'Helfer-Pool und Soll-Übersicht (OK)',
        description: 'Liefert den Helferpool der Abteilung mit Soll-Erfüllung (Schichtanzahl), Abmeldungen und Einteilungsstatus.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        querystring: z.object({
          alle: z.string().optional().describe('1 = auch Personen ohne regulären Zugang anzeigen'),
        }),
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
          department: { select: { id: true, name: true } },
          allowedDepartments: { include: { department: { select: { id: true, name: true } } } },
          allowedStufen: { include: { stufe: { select: { id: true, name: true, departmentId: true } } } },
          organizers: { select: { userId: true, role: true } },
        },
      });
      if (!event) return reply.status(404).send({ error: 'Event nicht gefunden' });

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.isManager) {
        return reply.status(403).send({ error: 'Nur die Abteilungsleitung oder das Event-OK' });
      }
      reply.header('Cache-Control', 'no-store');

      const cfg = accessTypeConfig(event.accessType);
      const hostDept = event.department;
      const isWhitelist = cfg.whitelist;
      const targetDepartments = [
        hostDept,
        ...(isWhitelist ? event.allowedDepartments.map((a) => a.department) : []),
      ];
      const targetDeptIds = targetDepartments.map((d) => d.id);
      const isRestricted = cfg.scope === 'DEPARTMENT' || event.allowedStufen.length > 0;

      // Kandidaten laden
      // Kandidaten: eigene Abteilung und wer selbst Bezug zum Anlass hat. Freigegebene Abteilungen nicht
      // pauschal (siehe eventRelatedPeopleWhere): ihre Personen erscheinen, sobald sie sich eintragen.
      const candidateUsers = await fastify.prisma.user.findMany({
        where: { OR: eventRelatedPeopleWhere(event) },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          nickname: true,
          birthDate: true,
          isGlobalAdmin: true,
          providerId: true,
          provider: true,
          departmentLeader: true,
          homeDepartmentId: true,
          homeDepartmentSource: true,
          homeDepartment: { select: { id: true, name: true } },
          memberships: {
            where: { departmentId: { in: targetDeptIds } },
            select: { departmentId: true, role: true, permissions: true },
          },
          stufen: {
            where: { stufe: { departmentId: { in: targetDeptIds } } },
            select: {
              stufeId: true,
              role: true,
              source: true,
              stufe: { select: { id: true, name: true, departmentId: true, sortOrder: true } },
            },
          },
          hitobitoStufen: { select: { kind: true } },
          signups: {
            where: { shift: { eventId: event.id } },
            select: {
              id: true,
              shift: { select: { id: true, title: true, startTime: true, endTime: true } },
              task: { select: { title: true } },
            },
          },
          deregistrations: {
            where: { eventId: event.id },
            select: { id: true, reason: true, createdAt: true },
          },
          eventAccessGrants: {
            where: { eventId: event.id },
            select: { id: true, link: { select: { expiresAt: true } } },
          },
        },
      });

      const items: EventRosterItemDto[] = [];

      for (const u of candidateUsers) {
        const hasGrant = u.eventAccessGrants.length > 0;
        // Globale Admins zählen hier nicht automatisch: Sie haben oft eine Mitgliedschaft in vielen
        // Abteilungen, sind aber nicht Helfende jedes Anlasses (sonst bekämen sie z. B. jede
        // «Noch ohne Schicht»-Nachricht). Für sie gelten die normalen Regeln.
        const isDeptAdmin = u.memberships.some((m) => m.departmentId === event.departmentId && m.role === 'ADMIN');
        const isPlanner = u.memberships.some(
          (m) => m.departmentId === event.departmentId && m.permissions.includes('EVENTS_VIEW_ALL')
        );
        const isOrganizer = event.organizers.some((o) => o.userId === u.id);
        const isMgr = isDeptAdmin || isPlanner || isOrganizer;
        const hasSignups = u.signups.length > 0;

        let hasAccess = isMgr || hasGrant || hasSignups;
        if (!hasAccess) {
          const accessUser: AccessUser = {
            id: u.id,
            isGlobalAdmin: u.isGlobalAdmin,
            providerId: u.providerId,
            departmentLeader: u.departmentLeader,
            hitobitoStufen: u.hitobitoStufen,
            homeDepartmentId: u.homeDepartmentId,
            homeDepartmentSource: u.homeDepartmentSource,
            stufen: u.stufen.map((s) => ({ stufeId: s.stufeId, role: s.role, source: s.source })),
          };
          const check = checkRules(event, accessUser, event.department.name);
          hasAccess = check.ok;
        }

        if (!hasAccess) {
          const inHostDepartment =
            u.homeDepartmentId === event.departmentId ||
            u.memberships.some((m) => m.departmentId === event.departmentId);
          if (request.query.alle !== '1' || !inHostDepartment) continue;
        }

        // Abteilung der Person ermitteln
        let deptId = u.homeDepartmentId;
        let deptName = u.homeDepartment?.name ?? null;

        if (!deptId || !targetDeptIds.includes(deptId)) {
          const stufeMatch = u.stufen.find((s) => targetDeptIds.includes(s.stufe.departmentId));
          if (stufeMatch) {
            deptId = stufeMatch.stufe.departmentId;
            deptName = targetDepartments.find((d) => d.id === deptId)?.name ?? null;
          } else {
            const memberMatch = u.memberships.find((m) => targetDeptIds.includes(m.departmentId));
            if (memberMatch) {
              deptId = memberMatch.departmentId;
              deptName = targetDepartments.find((d) => d.id === deptId)?.name ?? null;
            } else {
              deptId = hostDept.id;
              deptName = hostDept.name;
            }
          }
        }

        const personStufen = u.stufen
          .filter((s) => s.stufe.departmentId === deptId)
          .sort((a, b) => a.stufe.sortOrder - b.stufe.sortOrder || a.stufe.name.localeCompare(b.stufe.name, 'de'))
          .map((s) => ({
            id: s.stufe.id,
            name: s.stufe.name,
            role: s.role,
          }));

        const dereg = u.deregistrations[0] ?? null;

        items.push({
          userId: u.id,
          nickname: u.nickname,
          ceviName: u.nickname,
          firstName: u.firstName,
          lastName: u.lastName,
          displayName: personLabel(u),
          birthDate: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : null,
          // Alter am Anlass (erste Schicht), nicht heute: so passt es zu den Altersgrenzen der Schichten
          age: ageAt(u.birthDate, event.startDate),
          departmentId: deptId,
          departmentName: deptName,
          stufen: personStufen,
          shiftCount: u.signups.length,
          shifts: u.signups.map((s) => ({
            id: s.shift.id,
            title: s.shift.title,
            startTime: s.shift.startTime.toISOString(),
            endTime: s.shift.endTime.toISOString(),
            taskTitle: s.task?.title ?? null,
          })),
          hasAccess,
          isDeregistered: Boolean(dereg),
          deregistrationReason: dereg?.reason ?? null,
          deregisteredAt: dereg?.createdAt ? dereg.createdAt.toISOString() : null,
        });
      }

      // Eindeutige Namen für alle Personen im Helfer-Pool berechnen (A1 für Druck-Sachen & Abteilungs-Pool)
      const poolCandidates: DisambiguationCandidate[] = items.map((i) => ({
        personKey: i.userId,
        nickname: i.nickname,
        ceviName: i.nickname ?? i.ceviName ?? null,
        firstName: i.firstName,
        lastName: i.lastName,
        stufe: i.stufen[0]?.name ?? null,
        departmentName: i.departmentName,
      }));
      const poolDisambiguated = disambiguatePersonNames(poolCandidates);
      for (const item of items) {
        item.displayName = poolDisambiguated.get(item.userId) || item.displayName;
      }

      // Sortierung: Name aufsteigend
      items.sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'));

      const distinctDeptIds = new Set(items.map((i) => i.departmentId).filter(Boolean));
      const multipleDepartments = distinctDeptIds.size > 1;

      return {
        minShiftsPerPerson: event.minShiftsPerPerson ?? null,
        isRestricted,
        multipleDepartments,
        scopeDescription: audienceLabel(event, event.department.name),
        items,
      } satisfies EventRosterResponseDto;
    }
  );

  // Person als abgemeldet eintragen (heisst: muss an diesem Event keine Schichten übernehmen)
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/deregistrations',
    {
      schema: {
        tags: ['Events'],
        summary: 'Person für den Anlass abmelden (OK)',
        description: 'Trägt eine Person als entschuldigt / abgemeldet ein, sodass sie für das Schichtsoll nicht berücksichtigt wird.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: EventDeregistrationSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await loadManagedEvent(request, reply, 'HELPERS');
      if (!event) return;

      const input = request.body as z.output<typeof EventDeregistrationSchema>;

      // Nur Personen der Abteilung oder des Anlasses (sonst verriete die Antwort beliebige Namen)
      if (!(await allUsersRelatedToEvent(fastify.prisma, event.id, [input.userId]))) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, firstName: true, lastName: true, nickname: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'Person nicht gefunden' });
      }

      const dereg = await fastify.prisma.eventDeregistration.upsert({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        update: {
          reason: input.reason?.trim() || null,
          createdById: request.user.id,
        },
        create: {
          eventId: event.id,
          userId: user.id,
          reason: input.reason?.trim() || null,
          createdById: request.user.id,
        },
      });

      return {
        message: `${personLabel(user)} als abgemeldet eingetragen`,
        isDeregistered: true,
        reason: dereg.reason,
        deregisteredAt: dereg.createdAt.toISOString(),
      };
    }
  );

  // Abmeldung aufheben (Person nimmt wieder regulär teil)
  fastify.delete<{ Params: { slug: string; userId: string } }>(
    '/api/events/:slug/deregistrations/:userId',
    {
      schema: {
        tags: ['Events'],
        summary: 'Abmeldung aufheben (OK)',
        description: 'Hebt die Abmeldung einer Person auf. Sie zählt wieder regulär zum Teilnehmer- und Helferpool.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
          userId: z.string().uuid().describe('ID der Person'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = await loadManagedEvent(request, reply, 'HELPERS');
      if (!event) return;

      const deleted = await fastify.prisma.eventDeregistration.deleteMany({
        where: { eventId: event.id, userId: request.params.userId },
      });
      if (deleted.count === 0) {
        return reply.status(404).send({ error: 'Keine Abmeldung für diese Person gefunden' });
      }

      return { message: 'Abmeldung aufgehoben', isDeregistered: false };
    }
  );
};

export default eventParticipationRoutes;
