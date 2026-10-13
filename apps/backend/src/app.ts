import { createRequire } from 'node:module';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';

import prismaPlugin from './plugins/prisma.js';
import jwtPlugin from './plugins/jwt.js';
import tenantPlugin from './plugins/tenant.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import departmentRoutes from './routes/departments.js';
import eventRoutes from './routes/events.js';
import shiftRoutes from './routes/shifts.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes from './routes/uploads.js';

// pino-pretty ist optional: fehlt es (z. B. im Dev-Container), wird normal geloggt statt zu crashen.
function hasPinoPretty(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
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
  await app.register(cors, {
    origin: (origin, cb) => {
      // In production behind Traefik on same domain, CORS isn't strictly needed for same-origin,
      // but we allow subdomains and dev localhost
      cb(null, true);
    },
    credentials: true,
  });

  await app.register(helmet, {
    crossOriginResourcePolicy: false,
  });

  await app.register(compress);

  // Custom core plugins
  await app.register(prismaPlugin);
  await app.register(jwtPlugin);
  await app.register(tenantPlugin);

  // Application routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(departmentRoutes);
  await app.register(eventRoutes);
  await app.register(shiftRoutes);
  await app.register(adminRoutes);
  await app.register(uploadRoutes);

  return app;
}
