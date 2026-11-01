import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const HealthOkResponseSchema = z.object({
  status: z.string().describe('Status der API (ok)'),
  timestamp: z.string().describe('ISO-Zeitstempel des Abfragezeitpunkts'),
  version: z.string().describe('Aktuelle Versionsnummer der API'),
  database: z.boolean().describe('Gibt an, ob die Datenbankabfrage erfolgreich war'),
});

const HealthErrorResponseSchema = z.object({
  status: z.string().describe('Status der API (error)'),
  timestamp: z.string().describe('ISO-Zeitstempel des Fehlerzeitpunkts'),
  version: z.string().describe('Aktuelle Versionsnummer der API'),
  database: z.boolean().describe('Gibt an, ob die Datenbank erreichbar war (false)'),
});

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const handler = async (_request: unknown, reply: any) => {
    try {
      // Test DB connection
      await fastify.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        database: true,
      };
    } catch (err) {
      fastify.log.error(err, 'Health check failed: DB error');
      return reply.status(503).send({
        status: 'error',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        database: false,
      });
    }
  };

  const createHealthRouteOptions = () => ({
    schema: {
      tags: ['Health'],
      summary: 'System-Gesundheitsprüfung',
      description: 'Prüft die Verfügbarkeit der Fastify API und der PostgreSQL-Datenbank.',
      response: {
        200: HealthOkResponseSchema,
        503: HealthErrorResponseSchema,
      },
    },
  });

  fastify.get('/health', createHealthRouteOptions(), handler);
  fastify.get('/api/health', createHealthRouteOptions(), handler);
};

export default healthRoutes;
