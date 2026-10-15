import crypto from 'crypto';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateAccessLinkSchema,
  EventParticipationSchema,
  RedeemAccessLinkSchema,
  type EventAccessLinkDto,
  type EventParticipantDto,
} from '@schichtplan/shared';
import { managerFlags } from '../services/eventAccess.js';
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

const displayNameOf = (u: { ceviName: string | null; firstName: string; lastName: string }) =>
  u.ceviName || `${u.firstName} ${u.lastName}`.trim();

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
    if (!event) {
      reply.status(404).send({ error: 'Event nicht gefunden' });
      return null;
    }
    return event;
  }

  async function loadManagedEvent(request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) {
    const event = await loadEvent(request, reply);
    if (!event) return null;
    const flags = await managerFlags(fastify.prisma, event, request.user);
    if (!flags.isManager) {
      reply.status(403).send({ error: 'Nur die Abteilungsleitung oder das Event-OK' });
      return null;
    }
    return event;
  }

  // Zugangs-Links eines Anlasses (OK)
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/access-links',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const event = await loadManagedEvent(request, reply);
      if (!event) return;
      reply.header('Cache-Control', 'no-store');

      const links = await fastify.prisma.eventAccessLink.findMany({
        where: { eventId: event.id },
        include: {
          grants: {
            include: { user: { select: { id: true, ceviName: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const now = new Date();
      return links.map(
        (link): EventAccessLinkDto => ({
          id: link.id,
          label: link.label,
          kind: link.kind === 'GROUP' ? 'GROUP' : 'PERSONAL',
          token: link.token,
          expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
          createdAt: link.createdAt.toISOString(),
          isExpired: Boolean(link.expiresAt && link.expiresAt <= now),
          redeemedBy: link.grants.map((g) => ({
            userId: g.user.id,
            displayName: displayNameOf(g.user),
            redeemedAt: g.createdAt.toISOString(),
          })),
        })
      );
    }
  );

  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/access-links',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const event = await loadManagedEvent(request, reply);
      if (!event) return;

      const parse = CreateAccessLinkSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const link = await fastify.prisma.eventAccessLink.create({
        data: {
          eventId: event.id,
          token: crypto.randomBytes(18).toString('base64url'),
          label: parse.data.label,
          kind: parse.data.kind,
          expiresAt: parse.data.expiresAt ? new Date(parse.data.expiresAt) : null,
          createdById: request.user.id,
        },
      });

      return reply.status(201).send({ id: link.id, token: link.token });
    }
  );

  // Link löschen: wer ihn eingelöst hat, verliert den Zugang (bestehende Eintragungen bleiben)
  fastify.delete<{ Params: { slug: string; linkId: string } }>(
    '/api/events/:slug/access-links/:linkId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const event = await loadManagedEvent(request, reply);
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
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const event = await loadEvent(request, reply);
      if (!event) return;

      const parse = RedeemAccessLinkSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Ungültiger Link' });
      }

      const link = await fastify.prisma.eventAccessLink.findUnique({ where: { token: parse.data.token } });
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
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const event = await loadEvent(request, reply);
      if (!event) return;

      const parse = EventParticipationSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      if (parse.data.profile) {
        const result = await applyProfileUpdate(fastify.prisma, request.user.id, parse.data.profile);
        if ('error' in result) return reply.status(result.status).send({ error: result.error });
      }

      const answers = parse.data.answers ?? {};
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
    { preHandler: [fastify.authenticate] },
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
              ceviName: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              address: true,
              birthDate: true,
              homeDepartment: { select: { name: true } },
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
          email: u?.email && !/^cevidb_\d+@/.test(u.email) ? u.email : su.guestEmail,
          phone: u?.phone ?? su.guestPhone,
          address: u?.address ?? null,
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

      return [...byPerson.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'));
    }
  );
};

export default eventParticipationRoutes;

