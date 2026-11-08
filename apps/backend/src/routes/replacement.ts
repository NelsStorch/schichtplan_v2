import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ReplacementOfferSchema } from '@schichtplan/shared';
import { managerFlags } from '../services/eventAccess.js';
import { personLabel } from '../services/attendance.js';
import { replacementOpen } from '../services/replacement.js';
import { trackUsage } from '../services/usageStats.js';

/**
 * «Ersatz gesucht»: Eingetragene bieten ihre Schicht zur Übernahme an. Sie bleiben eingetragen,
 * bis jemand übernimmt (POST /api/shifts/:id/signup mit replacesSignupId).
 * Ohne Abteilung im Pfad (wie Austragen), damit es auch aus «Meine Schichten» über alle Abteilungen geht.
 */
const replacementRoutes: FastifyPluginAsync = async (fastify) => {
  /** Eintragung laden und prüfen, ob die Person sie ändern darf (selbst oder «Helfende einteilen») */
  async function loadSignup(signupId: string, user: { id: string; isGlobalAdmin: boolean }) {
    const signup = await fastify.prisma.shiftSignup.findUnique({
      where: { id: signupId },
      include: { shift: { include: { event: { include: { organizers: true } } } } },
    });
    if (!signup) return { ok: false, status: 404, error: 'Eintragung nicht gefunden' } as const;
    const event = signup.shift.event;
    const isSelf = signup.userId === user.id;
    if (!isSelf) {
      const flags = await managerFlags(fastify.prisma, event, user);
      if (!flags.can.HELPERS) {
        return { ok: false, status: 403, error: 'Das ist nicht deine Eintragung' } as const;
      }
    }
    return { ok: true, event, signup, isSelf } as const;
  }

  // «Ersatz gesucht» setzen oder den Grund ändern
  fastify.put<{ Params: { signupId: string }; Body: z.infer<typeof ReplacementOfferSchema> }>(
    '/api/signups/:signupId/replacement',
    {
      schema: {
        tags: ['Ersatz'],
        summary: 'Ersatz gesucht markieren oder Grund ändern',
        description: 'Markiert eine Schicht-Eintragung als «Ersatz gesucht» oder aktualisiert die Begründung. Die Person bleibt eingetragen, bis jemand die Schicht übernimmt.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          signupId: z.string().describe('ID der Schicht-Eintragung'),
        }),
        body: ReplacementOfferSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const input = request.body as z.output<typeof ReplacementOfferSchema>;
      const found = await loadSignup(request.params.signupId, request.user);
      if (!found.ok) return reply.status(found.status).send({ error: found.error });
      const { event, signup, isSelf } = found;

      if (!event.allowReplacement) {
        return reply.status(400).send({ error: 'Bei diesem Anlass kann kein Ersatz gesucht werden. Melde dich beim OK.' });
      }
      if (!replacementOpen(event, signup.shift.startTime)) {
        return reply.status(400).send({ error: 'Für diese Schicht kann kein Ersatz mehr gesucht werden. Melde dich beim OK.' });
      }

      let byName: string | null = null;
      if (!isSelf) {
        const performer = await fastify.prisma.user.findUnique({
          where: { id: request.user.id },
          select: { firstName: true, lastName: true, ceviName: true },
        });
        byName = performer ? `${personLabel(performer)} (OK)` : 'OK';
      }

      const updated = await fastify.prisma.shiftSignup.update({
        where: { id: signup.id },
        data: {
          // Beim Ändern des Grunds bleibt der Zeitpunkt
          replacementWantedAt: signup.replacementWantedAt ?? new Date(),
          replacementNote: input.note?.trim() || null,
          replacementByName: byName,
        },
      });
      if (!signup.replacementWantedAt) {
        trackUsage('REPLACEMENT_OFFERED', { dim: isSelf ? 'SELF' : 'OK', departmentId: event.departmentId });
      }

      return {
        id: updated.id,
        replacementWantedAt: updated.replacementWantedAt?.toISOString() ?? null,
        replacementNote: updated.replacementNote,
        replacementByName: updated.replacementByName,
      };
    }
  );

  // «Ersatz gesucht» zurückziehen: Die Person bleibt eingetragen
  fastify.delete<{ Params: { signupId: string } }>(
    '/api/signups/:signupId/replacement',
    {
      schema: {
        tags: ['Ersatz'],
        summary: 'Ersatz-Gesuch zurückziehen',
        description: 'Zieht den Status «Ersatz gesucht» für eine Schicht zurück. Die Person bleibt weiterhin regulär eingetragen.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          signupId: z.string().describe('ID der Schicht-Eintragung'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const found = await loadSignup(request.params.signupId, request.user);
      if (!found.ok) return reply.status(found.status).send({ error: found.error });

      await fastify.prisma.shiftSignup.update({
        where: { id: found.signup.id },
        data: { replacementWantedAt: null, replacementNote: null, replacementByName: null },
      });
      return { id: found.signup.id, replacementWantedAt: null, replacementNote: null, replacementByName: null };
    }
  );
};

export default replacementRoutes;
