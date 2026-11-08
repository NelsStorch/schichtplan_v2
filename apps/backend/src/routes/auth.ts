import type { FastifyPluginAsync } from 'fastify';
import ceviDbAuthRoutes from './auth/cevidb.js';
import ceviNameAuthRoutes from './auth/ceviName.js';
import passwordAuthRoutes from './auth/password.js';
import accountRoutes from './auth/account.js';

export { hashVerificationToken } from './auth/password.js';

/**
 * Alle Routen unter /api/auth, aufgeteilt nach Anmeldeart (siehe routes/auth/).
 * Die Teile sind eigene Plugins: Sie teilen keinen Zustand, nur Services aus services/.
 */
const authRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(ceviDbAuthRoutes);
  await fastify.register(ceviNameAuthRoutes);
  await fastify.register(passwordAuthRoutes);
  await fastify.register(accountRoutes);
};

export default authRoutes;
