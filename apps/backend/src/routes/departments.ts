import type { FastifyPluginAsync } from 'fastify';
import departmentInfoRoutes from './departments/info.js';
import departmentStufenRoutes from './departments/stufen.js';
import departmentPeopleRoutes from './departments/people.js';

export { contactCandidateWhere } from './departments/shared.js';

/** Alle Abteilungs-Routen (/api/departments), aufgeteilt in routes/departments/ */
const departmentRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(departmentInfoRoutes);
  await fastify.register(departmentStufenRoutes);
  await fastify.register(departmentPeopleRoutes);
};

export default departmentRoutes;
