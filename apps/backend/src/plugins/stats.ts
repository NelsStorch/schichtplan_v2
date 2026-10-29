import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  STATS_FLUSH_INTERVAL_MS,
  flushUsageStats,
  recordRequest,
  trackUsage,
  trackUsageUnchecked,
} from '../services/usageStats.js';

/** Routen, die nicht in die Anfrage-Statistik gehören (Traefik prüft /health alle paar Sekunden) */
const IGNORED_ROUTES = new Set(['/health', '/api/health']);

const bodyField = (request: FastifyRequest, field: string): string | undefined => {
  const value = (request.body as Record<string, unknown> | undefined)?.[field];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Erfolgreiche Aktionen, die ohne eigenen Code in der Route gezählt werden (Methode + Route-Muster).
 * Abteilung = Subdomain der Anfrage. Was mehr Wissen braucht (selbst oder durch das OK eingetragen),
 * zählt die Route selbst.
 */
const ROUTE_METRICS: Record<string, (request: FastifyRequest, departmentId: string | null) => void> = {
  'POST /api/events': (_r, departmentId) => trackUsage('EVENT_CREATE', { dim: 'BLANK', departmentId }),
  'POST /api/event-templates/:id/instantiate': (_r, departmentId) =>
    trackUsage('EVENT_CREATE', { dim: 'TEMPLATE', departmentId }),
  'DELETE /api/events/:slug': (_r, departmentId) => trackUsage('EVENT_DELETE', { departmentId }),
  'POST /api/events/:slug/move': (_r, departmentId) => trackUsage('EVENT_MOVE', { departmentId }),
  'POST /api/events/:slug/save-as-template': (_r, departmentId) => trackUsage('TEMPLATE_SAVE', { departmentId }),
  'POST /api/shifts': (_r, departmentId) => trackUsage('SHIFT_CREATE', { dim: 'SINGLE', departmentId }),
  'POST /api/shifts/series': (_r, departmentId) => trackUsage('SHIFT_CREATE', { dim: 'SERIES', departmentId }),
  'POST /api/shifts/:id/duplicate': (_r, departmentId) => trackUsage('SHIFT_CREATE', { dim: 'DUPLICATE', departmentId }),
  'POST /api/events/:slug/shifts/bulk': (request, departmentId) => {
    const action = (request.body as { action?: { type?: unknown } } | undefined)?.action?.type;
    if (typeof action === 'string') trackUsageUnchecked('SHIFT_BULK', action, departmentId);
  },
  'POST /api/events/:slug/access-links': (request, departmentId) =>
    trackUsage('ACCESS_LINK_CREATE', { dim: bodyField(request, 'kind') === 'GROUP' ? 'GROUP' : 'PERSONAL', departmentId }),
  'PUT /api/events/:slug/signups/:signupId/attendance': (_r, departmentId) =>
    trackUsage('ATTENDANCE', { dim: 'OK', departmentId }),
  'POST /api/events/:slug/checkin': (_r, departmentId) => trackUsage('ATTENDANCE', { dim: 'QR', departmentId }),
  'GET /api/calendar/:token.ics': () => trackUsage('CALENDAR_FEED'),
  'GET /api/calendar/:token': () => trackUsage('CALENDAR_FEED'),
  'GET /api/calendar/feed/:token.ics': () => trackUsage('CALENDAR_FEED'),
  'GET /api/calendar/feed/:token': () => trackUsage('CALENDAR_FEED'),
};

/**
 * Anfrage-Statistik pro Route-Muster und Stunde, dazu das regelmässige Schreiben aller Zähler.
 * Gespeichert wird `request.routeOptions.url` (z. B. /api/events/:slug), nie die echte URL mit
 * Slugs, Zugangs- oder Check-in-Codes.
 */
const statsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url;
    if (route && IGNORED_ROUTES.has(route)) return;
    recordRequest(route ?? '(unbekannt)', request.method, reply.statusCode, reply.elapsedTime);
    if (route && reply.statusCode >= 200 && reply.statusCode < 300) {
      ROUTE_METRICS[`${request.method} ${route}`]?.(request, request.tenant?.id ?? null);
    }
  });

  const flush = () =>
    flushUsageStats(fastify.prisma).catch((err) => fastify.log.warn(err, 'Statistik konnte nicht geschrieben werden'));
  const timer = setInterval(flush, STATS_FLUSH_INTERVAL_MS);
  timer.unref();

  // Vor der DB schliessen (onClose läuft in umgekehrter Reihenfolge der Registrierung)
  fastify.addHook('onClose', async () => {
    clearInterval(timer);
    await flush();
  });
};

export default fp(statsPlugin);
