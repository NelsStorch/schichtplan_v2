import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PushSubscribeSchema, PushUnsubscribeSchema } from '@schichtplan/shared';
import {
  getVapidPublicKey,
  isAllowedPushEndpoint,
  isValidP256dhKey,
  sendPushNotification,
  sendPushToUser,
} from '../services/webPush.js';
import { createRateLimiter } from '../services/rateLimit.js';

// Max 5 test notifications per user within 5 minutes
const testPushLimiter = createRateLimiter(5 * 60 * 1000, 5);

const PUSH_DEVICE_COOKIE =
  process.env.COOKIE_NAME === 'token_dev' ? 'push_sub_dev' : 'push_sub_id';

function getCookieDomain(): string | undefined {
  if (process.env.COOKIE_DOMAIN) {
    return process.env.COOKIE_DOMAIN;
  }
  if (process.env.NODE_ENV === 'production') {
    const domain = process.env.DOMAIN || 'cevi-schichtplan.ch';
    return `.${domain}`;
  }
  return undefined;
}

function setPushDeviceCookie(reply: FastifyReply, subscriptionId: string) {
  const domain = getCookieDomain();
  reply.setCookie(PUSH_DEVICE_COOKIE, subscriptionId, {
    path: '/',
    domain,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 Jahr
  });
}

function clearPushDeviceCookie(reply: FastifyReply) {
  const domain = getCookieDomain();
  reply.clearCookie(PUSH_DEVICE_COOKIE, {
    path: '/',
    domain,
  });
}

const pushRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Public VAPID key for ServiceWorker pushManager.subscribe()
  fastify.get(
    '/api/push/vapid-public-key',
    {
      schema: {
        tags: ['Push'],
        summary: 'Öffentlichen VAPID-Schlüssel abrufen',
        description: 'Liefert den öffentlichen VAPID-Schlüssel für ServiceWorker pushManager.subscribe().',
        response: {
          200: z.object({
            publicKey: z.string().describe('VAPID Public Key im Base64-URL-Format'),
          }),
        },
      },
    },
    async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return { publicKey: getVapidPublicKey() };
    }
  );

  // 2. Check current user's push subscription count & whether this device (by endpoint or wildcard cookie) is registered
  fastify.get<{ Querystring: { endpoint?: string } }>(
    '/api/push/status',
    {
      schema: {
        tags: ['Push'],
        summary: 'Push-Status des aktuellen Benutzers prüfen',
        description: 'Prüft, ob das anfragende Gerät und die angemeldete Person für Push-Benachrichtigungen registriert sind.',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          endpoint: z.string().optional().describe('Push-Subscription-Endpoint des Browsers'),
        }),
        response: {
          200: z.object({
            publicKey: z.string(),
            subscriptionCount: z.number().int(),
            deviceSubscribed: z.boolean(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const userId = request.user.id;
      const endpoint = request.query.endpoint?.trim();
      const cookieSubId = request.cookies?.[PUSH_DEVICE_COOKIE]?.trim();

      const [count, byEndpoint, byCookie] = await Promise.all([
        fastify.prisma.pushSubscription.count({ where: { userId } }),
        endpoint
          ? fastify.prisma.pushSubscription.findFirst({
              where: { userId, endpoint },
              select: { id: true },
            })
          : Promise.resolve(null),
        cookieSubId
          ? fastify.prisma.pushSubscription.findFirst({
              where: { id: cookieSubId, userId },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);

      const activeSub = byEndpoint || byCookie;
      // Falls lokal über den ServiceWorker gefunden, aber Cookie fehlte (z. B. vor diesem Update), Cookie nachziehen
      if (byEndpoint && cookieSubId !== byEndpoint.id) {
        setPushDeviceCookie(reply, byEndpoint.id);
      } else if (cookieSubId && !byCookie && !byEndpoint) {
        // Verwaistes Cookie aufräumen
        clearPushDeviceCookie(reply);
      }

      return {
        publicKey: getVapidPublicKey(),
        subscriptionCount: count,
        deviceSubscribed: Boolean(activeSub),
      };
    },
  );

  // 3. Register / update a Web Push subscription for the current device
  fastify.post(
    '/api/push/subscribe',
    {
      schema: {
        tags: ['Push'],
        summary: 'Gerät für Web Push Benachrichtigungen registrieren',
        description: 'Speichert oder aktualisiert ein Browser-Push-Abonnement für die angemeldete Person.',
        security: [{ bearerAuth: [] }],
        body: PushSubscribeSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const input = request.body as z.output<typeof PushSubscribeSchema>;
      const { endpoint, keys } = input;
      if (!isAllowedPushEndpoint(endpoint)) {
        return reply.status(400).send({ error: 'Dieser Push-Dienst wird nicht unterstützt.' });
      }
      if (!isValidP256dhKey(keys.p256dh)) {
        return reply.status(400).send({ error: 'Ungültiger Push-Schlüssel (p256dh)' });
      }

      const userId = request.user.id;
      const cookieSubId = request.cookies?.[PUSH_DEVICE_COOKIE]?.trim();

      // Falls derselbe Browser schon unter einer anderen Subdomain ein Abo angelegt hatte,
      // ersetzen wir das alte Abo dieses Geräts, damit dasselbe Gerät nie doppelt benachrichtigt wird.
      if (cookieSubId) {
        await fastify.prisma.pushSubscription
          .deleteMany({
            where: {
              id: cookieSubId,
              userId,
              endpoint: { not: endpoint },
            },
          })
          .catch(() => undefined);
      }

      const upserted = await fastify.prisma.pushSubscription.upsert({
        where: { endpoint },
        update: {
          userId,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        create: {
          userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        select: { id: true },
      });

      setPushDeviceCookie(reply, upserted.id);

      // Keep at most 15 subscriptions per user (prune oldest if exceeded)
      const allSubs = await fastify.prisma.pushSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (allSubs.length > 15) {
        const staleIds = allSubs.slice(15).map((s) => s.id);
        await fastify.prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
      }

      const count = Math.min(allSubs.length, 15);

      // Sofortige Willkommens-Benachrichtigung an das neu aktivierte Gerät senden
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, ceviName: true, homeDepartment: { select: { slug: true } } },
      });
      if (user) {
        const displayName = user.ceviName || user.firstName;
        const domain = (process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
        const slug = request.tenant?.slug || user.homeDepartment?.slug;
        const targetUrl = slug ? `https://${slug}.${domain}/` : `https://${domain}/profil`;
        void sendPushNotification(
          { endpoint, p256dh: keys.p256dh, auth: keys.auth },
          {
            title: `Hallo ${displayName}! Browser-Benachrichtigungen sind aktiv`,
            body: 'Dieses Gerät empfängt jetzt Erinnerungen vor deinen Schichten und Infos vom OK.',
            url: targetUrl,
            tag: `cevi-schichtplan-welcome-${Date.now()}`,
          },
        ).catch((err) => {
          request.log.warn({ err, userId }, 'Willkommens-Push konnte nicht gesendet werden');
        });
      }

      return { ok: true, subscriptionCount: count, deviceSubscribed: true };
    },
  );

  // 4. Unsubscribe the current device (via endpoint and/or wildcard cookie)
  fastify.post(
    '/api/push/unsubscribe',
    {
      schema: {
        tags: ['Push'],
        summary: 'Push-Abonnement beenden',
        description: 'Entfernt das Browser-Push-Abonnement anhand des übergebenen Endpoints oder des Geräte-Cookies.',
        security: [{ bearerAuth: [] }],
        body: PushUnsubscribeSchema.partial().optional(),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const body = request.body as Record<string, unknown> | null | undefined;
      const cookieSubId = request.cookies?.[PUSH_DEVICE_COOKIE]?.trim();
      const hasEndpoint = Boolean(body && typeof body.endpoint === 'string' && body.endpoint.trim());

      if (hasEndpoint) {
        const parse = PushUnsubscribeSchema.safeParse(body);
        if (!parse.success) {
          return reply.status(400).send({ error: parse.error.issues[0].message });
        }
        await fastify.prisma.pushSubscription.deleteMany({
          where: {
            userId,
            OR: [
              { endpoint: parse.data.endpoint },
              ...(cookieSubId ? [{ id: cookieSubId }] : []),
            ],
          },
        });
      } else if (cookieSubId) {
        // Auf einer anderen Subdomain ausgeschaltet, auf der der lokale ServiceWorker das Abo nicht kennt:
        // Wir löschen gezielt das Geräte-Abo aus dem Wildcard-Cookie.
        await fastify.prisma.pushSubscription.deleteMany({
          where: { id: cookieSubId, userId },
        });
      }

      clearPushDeviceCookie(reply);

      const count = await fastify.prisma.pushSubscription.count({ where: { userId } });
      return { ok: true, subscriptionCount: count, deviceSubscribed: false };
    },
  );

  // 5. Send a test notification to all subscribed devices of the current user
  fastify.post(
    '/api/push/test',
    {
      schema: {
        tags: ['Push'],
        summary: 'Test-Benachrichtigung an eigene Geräte senden',
        description: 'Sendet eine Test-Benachrichtigung an alle aktiven Push-Endpunkte der angemeldeten Person (Rate-Limit: max. 5 alle 5 Minuten).',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      if (testPushLimiter.hit(userId)) {
        return reply.status(429).send({
          error: 'Bitte warte kurz, bevor du eine weitere Test-Benachrichtigung sendest.',
        });
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, ceviName: true, homeDepartment: { select: { slug: true } } },
      });
      if (!user) {
        return reply.status(404).send({ error: 'Person nicht gefunden' });
      }

      const displayName = user.ceviName || user.firstName;
      const domain = (process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
      const slug = request.tenant?.slug || user.homeDepartment?.slug;
      const targetUrl = slug ? `https://${slug}.${domain}/` : `https://${domain}/profil`;

      const result = await sendPushToUser(
        fastify.prisma,
        userId,
        {
          title: `Hallo ${displayName}! Browser-Benachrichtigungen sind aktiv`,
          body: 'Du erhältst hier künftig Erinnerungen an deine Schichten und wichtige Infos vom OK.',
          url: targetUrl,
          tag: `cevi-schichtplan-test-${Date.now()}`,
        },
        request.log,
      );

      if (result.sent === 0) {
        return reply.status(400).send({
          error: 'Keine aktiven Geräte erreicht. Bitte aktiviere die Browser-Benachrichtigung auf diesem Gerät erneut.',
          ...result,
        });
      }

      return {
        ok: true,
        ...result,
      };
    },
  );
};

export default pushRoutes;
