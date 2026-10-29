import { FastifyPluginAsync } from 'fastify';

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

  fastify.get('/health', handler);
  fastify.get('/api/health', handler);
};

export default healthRoutes;
