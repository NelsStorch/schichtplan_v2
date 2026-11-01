import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  buildIcsFeed,
  getOrCreateCalendarToken,
  getUserCalendarShifts,
  resetCalendarToken,
} from '../services/calendarFeed.js';

const CalendarTokenResponseSchema = z.object({
  token: z.string().describe('Geheimer Kalender-Token'),
  httpsUrl: z.string().url().describe('HTTPS-URL der .ics-Datei'),
  webcalUrl: z.string().describe('Direkter webcal:// Link zum Abonnieren in Kalender-Apps'),
});

function deriveCalendarUrls(request: { headers: Record<string, any>; protocol: string }, token: string) {
  const forwardedHost = (request.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim();
  const rawHost = forwardedHost || request.headers.host || (process.env.COOKIE_DOMAIN || process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
  const host = rawHost.toLowerCase();

  const forwardedProto = (request.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
  const isHttps =
    forwardedProto === 'https' ||
    request.protocol === 'https' ||
    (process.env.NODE_ENV === 'production' && !host.includes('localhost'));

  const httpsUrl = `${isHttps ? 'https' : 'http'}://${host}/api/calendar/${token}.ics`;
  const webcalUrl = `webcal://${host}/api/calendar/${token}.ics`;

  return { token, httpsUrl, webcalUrl };
}

const calendarRoutes: FastifyPluginAsync = async (fastify) => {
  // Öffentlicher iCal / Webcal Feed für Kalender-Abonnements (Apple Kalender, Outlook, Google Kalender)
  const feedHandler = async (request: any, reply: any) => {
    const rawToken = request.params.token as string;
    const token = rawToken.replace(/\.ics$/i, '');

    if (!token || !/^[0-9a-f]{16,64}$/i.test(token)) {
      return reply.status(404).send({ error: 'Ungültiger Kalender-Token' });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { calendarToken: token },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        ceviName: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'Kalender nicht gefunden' });
    }

    const shifts = await getUserCalendarShifts(fastify.prisma, user.id);
    const domain = (process.env.COOKIE_DOMAIN || process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
    const userDisplayName = user.ceviName || user.firstName;

    const ics = buildIcsFeed({
      userDisplayName,
      shifts,
      domain,
    });

    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', 'inline; filename="schichten.ics"')
      .header('Cache-Control', 'private, max-age=1800')
      .send(ics);
  };

  fastify.get(
    '/api/calendar/:token.ics',
    {
      schema: {
        tags: ['Kalender'],
        summary: 'iCal / Webcal Kalender-Feed abrufen',
        description: 'Liefert alle eingetragenen Schichten der Person im standardisierten iCalendar-Format (.ics) für Kalender-Apps (Apple Kalender, Google Kalender, Outlook).',
        params: z.object({ token: z.string().describe('Kalender-Token der Person') }),
      },
    },
    feedHandler
  );
  fastify.get('/api/calendar/:token', { schema: { hide: true } }, feedHandler);
  fastify.get('/api/calendar/feed/:token.ics', { schema: { hide: true } }, feedHandler);
  fastify.get('/api/calendar/feed/:token', { schema: { hide: true } }, feedHandler);

  // Authentifizierte Endpunkte für die Verwaltung des eigenen Kalender-Tokens
  const getTokenHandler = async (request: any) => {
    const token = await getOrCreateCalendarToken(fastify.prisma, request.user.id);
    return deriveCalendarUrls(request, token);
  };

  const tokenRouteOptions = {
    schema: {
      tags: ['Kalender'],
      summary: 'Persönlichen Kalender-Token & URLs abrufen',
      description: 'Gibt den persönlichen Kalender-Token sowie die fertigen webcal://- und https://-Abonnement-URLs zurück.',
      security: [{ bearerAuth: [] }],
      response: {
        200: CalendarTokenResponseSchema,
      },
    },
    preHandler: [fastify.authenticate],
  };

  fastify.get('/api/calendar/token', tokenRouteOptions, getTokenHandler);
  fastify.get('/api/auth/me/calendar-token', { schema: { hide: true }, preHandler: [fastify.authenticate] }, getTokenHandler);

  const resetTokenHandler = async (request: any) => {
    const token = await resetCalendarToken(fastify.prisma, request.user.id);
    return deriveCalendarUrls(request, token);
  };

  const resetTokenRouteOptions = {
    schema: {
      tags: ['Kalender'],
      summary: 'Kalender-Token zurücksetzen',
      description: 'Generiert einen neuen Kalender-Token. Bisherige Kalender-Abonnements auf Geräten werden damit ungültig.',
      security: [{ bearerAuth: [] }],
      response: {
        200: CalendarTokenResponseSchema,
      },
    },
    preHandler: [fastify.authenticate],
  };

  fastify.post('/api/calendar/token/reset', resetTokenRouteOptions, resetTokenHandler);
  fastify.post('/api/auth/me/calendar-token/reset', { schema: { hide: true }, preHandler: [fastify.authenticate] }, resetTokenHandler);
};

export default calendarRoutes;
