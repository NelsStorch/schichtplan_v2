import { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
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
  });
};

export default healthRoutes;
