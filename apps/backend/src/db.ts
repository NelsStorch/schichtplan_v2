/**
 * Prisma-Client (Prisma 7): generiert nach src/generated/prisma, Verbindung über den pg-Treiber-Adapter.
 * Alle Importe von PrismaClient/Prisma laufen über diese Datei.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export { Prisma, PrismaClient } from './generated/prisma/client.js';
export type { Department } from './generated/prisma/client.js';

export function createPrismaClient(options: { log?: ('warn' | 'error')[] } = {}) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: options.log });
}
