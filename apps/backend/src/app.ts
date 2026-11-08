import { createRequire } from 'node:module';
import Fastify, { FastifyError, FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

import prismaPlugin from './plugins/prisma.js';
import jwtPlugin from './plugins/jwt.js';
import tenantPlugin from './plugins/tenant.js';
import statsPlugin from './plugins/stats.js';
import docsPlugin from './plugins/docs.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import passwordResetRoutes from './routes/passwordReset.js';
import departmentRoutes from './routes/departments.js';
import eventRoutes from './routes/events.js';
import eventParticipationRoutes from './routes/eventParticipation.js';
import shiftRoutes from './routes/shifts.js';
import shiftSignupRoutes from './routes/shiftSignup.js';
import shiftsMyRoutes from './routes/shiftsMy.js';
import attendanceRoutes from './routes/attendance.js';
import replacementRoutes from './routes/replacement.js';
import eventMessageRoutes from './routes/eventMessages.js';
import adminRoutes from './routes/admin.js';
import adminManageRoutes from './routes/adminManage.js';
import uploadRoutes from './routes/uploads.js';
import calendarRoutes from './routes/calendar.js';
import statsRoutes from './routes/stats.js';
import { isDatabaseOverloadError, sendServerAlert } from './services/serverAlert.js';
import eventTemplateRoutes from './routes/eventTemplates.js';
import taskDefinitionRoutes from './routes/taskDefinitions.js';
import pushRoutes from './routes/push.js';
import cateringRoutes from './routes/catering.js';

// pino-pretty ist optional: fehlt es (z. B. im Dev-Container), wird normal geloggt statt zu crashen.
function hasPinoPretty(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/** Darf diese Herkunft (Origin-Header) mit Cookies auf die API zugreifen? */
export function isAllowedOrigin(origin: string, rootDomain: string, allowLocalhost: boolean): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const root = rootDomain.toLowerCase();
  if (url.protocol === 'https:' && (host === root || host.endsWith(`.${root}`))) return true;
  return (
    allowLocalhost &&
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost'))
  );
}

/** Deutsche Meldungen für Fehler, die Fastify selbst auslöst (nach Code, sonst nach Status) */
const FASTIFY_ERROR_MESSAGES: Record<string, string> = {
  FST_ERR_CTP_BODY_TOO_LARGE: 'Die Anfrage ist zu gross.',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'Dieses Format wird nicht unterstützt.',
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: 'Ungültige Anfrage.',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'Die Anfrage ist leer.',
  FST_ERR_CTP_INVALID_JSON_BODY: 'Die Anfrage enthält kein gültiges JSON.',
  NOT_FOUND: 'Nicht gefunden.',
};
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Ungültige Anfrage.',
  401: 'Nicht angemeldet.',
  403: 'Kein Zugriff.',
  404: 'Nicht gefunden.',
  405: 'Diese Methode ist hier nicht erlaubt.',
  413: 'Die Anfrage ist zu gross.',
  415: 'Dieses Format wird nicht unterstützt.',
  429: 'Zu viele Anfragen. Bitte warte kurz.',
};

/**
 * Einheitliches Fehlerformat wie in den Routen: `error` ist die Meldung fürs Frontend, `code` maschinenlesbar.
 * Nie die Originalmeldung von Fastify übernehmen (englisch, kann Interna nennen).
 */
export function clientErrorBody(statusCode: number, code?: string) {
  const message = (code && FASTIFY_ERROR_MESSAGES[code]) || STATUS_MESSAGES[statusCode] || 'Die Anfrage konnte nicht verarbeitet werden.';
  return { statusCode, code: code || `HTTP_${statusCode}`, error: message, message };
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 2 * 1024 * 1024, // Normale JSON-Anfragen sind klein; nur /api/uploads erlaubt mehr (siehe routes/uploads.ts)
    logger: process.env.NODE_ENV === 'development' && hasPinoPretty() ? {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    } : true,
    // Traefik Reverse-Proxy & interne Docker-Netze (schichtplan_prod_proxy, app, data):
    // Nur private/lokale Netze als Proxies vertrauen (verhindert IP-Spoofing via X-Forwarded-For von extern).
    trustProxy: ['loopback', 'linklocal', 'uniquelocal'],
  });

  // Base plugins
  // Mit Cookies nur für die eigene Domain (alle Subdomains) und lokal für localhost
  const rootDomain = (process.env.COOKIE_DOMAIN || process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
  const allowLocalhost = process.env.NODE_ENV !== 'production';
  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, !origin || isAllowedOrigin(origin, rootDomain, allowLocalhost));
    },
    credentials: true,
  });

  await app.register(helmet, {
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  });

  await app.register(compress);

  // Custom core plugins
  await app.register(prismaPlugin);
  await app.register(statsPlugin);
  await app.register(jwtPlugin);
  await app.register(tenantPlugin);
  await app.register(docsPlugin);

  // Zentraler Fehler-Handler für Server-Fehler & Admin-Webhook-Alarme.
  // Muss VOR den Routen stehen: Fastify gibt ihn nur an Plugins weiter, die danach registriert werden.
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const statusCode = error.statusCode || 500;

    // Ungültige Eingaben aus den Routenschemata: wie bisher als {error: "Meldung"} melden,
    // denn das Frontend zeigt `error` direkt an (sonst stünde dort nur «Bad Request»).
    if (hasZodFastifySchemaValidationErrors(error)) {
      const message = error.validation[0]?.message || 'Ungültige Eingabe';
      return reply.status(400).send({ statusCode: 400, code: 'FST_ERR_VALIDATION', error: message, message });
    }

    if (isDatabaseOverloadError(error)) {
      void sendServerAlert({
        category: 'DB_OVERLOAD',
        level: 'CRITICAL',
        title: 'Datenbank kurzzeitig überlastet / nicht erreichbar',
        message: `Die Datenbank antwortet nicht oder der Connection-Pool ist erschöpft bei ${request.method} ${request.url}.`,
        error,
        context: {
          method: request.method,
          url: request.url,
          host: request.headers.host,
        },
      }).catch(() => {});
    } else if (statusCode >= 500) {
      void sendServerAlert({
        category: 'SERVER_ERROR',
        level: 'CRITICAL',
        title: `Serverfehler 500 bei ${request.method} ${request.url}`,
        message: error.message || 'Unerwarteter interner Serverfehler',
        error,
        context: {
          method: request.method,
          url: request.url,
          host: request.headers.host,
        },
      }).catch(() => {});
    }

    if (statusCode >= 500) {
      request.log.error(error);
      const message = 'Ein interner Serverfehler ist aufgetreten. Bitte versuche es nochmals.';
      return reply.status(statusCode).send({
        statusCode,
        code: 'INTERNAL',
        error: message,
        // Details nur ausserhalb von Produktion (nie Stacktraces oder SQL nach aussen)
        message: process.env.NODE_ENV === 'production' ? message : error.message,
      });
    }

    // Übrige Fehler von Fastify selbst (ungültiges JSON, zu grosser Body, falscher Content-Type ...):
    // gleiches Format wie alle anderen Fehler, mit deutscher Meldung statt «Bad Request»
    return reply.status(statusCode).send(clientErrorBody(statusCode, error.code));
  });

  // Unbekannte Routen: gleiches Format (sonst «Route GET:/api/x not found» auf Englisch)
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(clientErrorBody(404, 'NOT_FOUND'));
  });

  // Application routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(passwordResetRoutes);
  await app.register(departmentRoutes);
  await app.register(eventRoutes);
  await app.register(eventParticipationRoutes);
  await app.register(shiftRoutes);
  await app.register(shiftSignupRoutes);
  await app.register(shiftsMyRoutes);
  await app.register(attendanceRoutes);
  await app.register(replacementRoutes);
  await app.register(eventMessageRoutes);
  await app.register(eventTemplateRoutes);
  await app.register(taskDefinitionRoutes);
  await app.register(adminRoutes);
  await app.register(adminManageRoutes);
  await app.register(uploadRoutes);
  await app.register(calendarRoutes);
  await app.register(statsRoutes);
  await app.register(pushRoutes);
  await app.register(cateringRoutes);


  return app;
}
