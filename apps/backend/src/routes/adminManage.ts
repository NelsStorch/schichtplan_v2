/**
 * Admin-Portal: Abteilungen und Anlässe über alle Abteilungen verwalten, Rollen vergeben.
 * Nur globale Admins (`requireGlobalAdmin` prüft die Rolle in der DB).
 */
import type { FastifyPluginAsync } from 'fastify';
import adminOverviewRoutes from './adminManage/overview.js';
import adminDepartmentRoutes from './adminManage/departments.js';
import adminEventRoutes from './adminManage/events.js';
import adminPeopleRoutes from './adminManage/people.js';

const adminManageRoutes: FastifyPluginAsync = async (fastify) => {
  // Gilt für alle Teile unten (Hooks erben die registrierten Kind-Plugins)
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  await fastify.register(adminOverviewRoutes);
  await fastify.register(adminDepartmentRoutes);
  await fastify.register(adminEventRoutes);
  await fastify.register(adminPeopleRoutes);
};

export default adminManageRoutes;
