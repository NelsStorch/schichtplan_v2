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

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 15 * 1024 * 1024, // 15 MB für Bild-Uploads (Base64)
    logger: process.env.NODE_ENV === 'development' && hasPinoPretty() ? {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    } : true,
    trustProxy: true, // Crucial behind Traefik reverse proxy!
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
      return reply.status(statusCode).send({
        statusCode,
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Ein interner Serverfehler ist aufgetreten' : error.message,
      });
    }

    return reply.status(statusCode).send(error);
  });

  // Application routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(passwordResetRoutes);
  await app.register(departmentRoutes);
  await app.register(eventRoutes);
  await app.register(eventParticipationRoutes);
  await app.register(shiftRoutes);
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


  return app;
}
