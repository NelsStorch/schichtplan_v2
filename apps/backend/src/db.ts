/**
 * Prisma-Client (Prisma 7): generiert nach src/generated/prisma, Verbindung über den pg-Treiber-Adapter.
 * Alle Importe von PrismaClient/Prisma laufen über diese Datei.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export { Prisma, PrismaClient } from './generated/prisma/client.js';
export type { Department } from './generated/prisma/client.js';

/** Ohne diese Grenzen warten Anfragen bei einer hängenden Datenbank unbegrenzt (Vorgabe des pg-Treibers: 0) */
const DB_CONNECTION_TIMEOUT_MS = 5_000;
const DB_STATEMENT_TIMEOUT_MS = 30_000;

export function createPrismaClient(options: { log?: ('warn' | 'error')[] } = {}) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt');
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    statement_timeout: DB_STATEMENT_TIMEOUT_MS,
  });
  return new PrismaClient({ adapter, log: options.log });
}
