import type { PrismaClient } from '../db.js';

/** So lange darf ein einzelner Job höchstens laufen, danach gibt die Transaktion (und damit die Sperre) auf */
const MAX_JOB_MS = 10 * 60 * 1000;

export type ExclusiveResult<T> = { ran: true; value: T } | { ran: false };

/**
 * Führt `fn` nur aus, wenn gerade kein anderer Backend-Prozess denselben Job (`name`) ausführt.
 * Beim Rollout laufen kurz zwei Backends parallel; so erledigt nur eines die Hintergrundarbeit.
 *
 * Die Sperre ist eine Postgres-Advisory-Lock innerhalb einer Transaktion: Sie endet automatisch,
 * auch wenn der Prozess abstürzt. `fn` selbst arbeitet über den normalen Client (andere Verbindung).
 */
export async function runExclusive<T>(
  prisma: PrismaClient,
  name: string,
  fn: () => Promise<T>
): Promise<ExclusiveResult<T>> {
  return prisma.$transaction(
    async (tx): Promise<ExclusiveResult<T>> => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${`schichtplan:job:${name}`})::bigint) AS locked`;
      if (!rows[0]?.locked) return { ran: false };
      return { ran: true, value: await fn() };
    },
    { maxWait: 5_000, timeout: MAX_JOB_MS }
  );
}
