/**
 * Letzter Nutzungstag pro Konto (`users.last_seen_on`, nur Datum). Damit lassen sich aktive Personen
 * pro Tag/Woche/Monat zählen, und das Admin-Portal zeigt «Zuletzt aktiv».
 *
 * Performance: Die Person wird bei jeder angemeldeten Anfrage ohnehin geladen (plugins/jwt.ts), der
 * Vergleich mit dem heutigen Datum kostet nichts. Geschrieben wird nur, wenn der Tag neu ist, und das
 * UPDATE prüft das selbst nochmal: Bei gleichzeitigen Anfragen (oder zwei Containern) zählt nur die
 * erste. Nach einem Neustart steht der Wert in der DB, es geht nichts verloren.
 */
import { zurichDayKey } from '@schichtplan/shared';
import type { PrismaClient } from '../db.js';
import { trackUsage } from './usageStats.js';

/** Personen, die heute schon geschrieben wurden (spart parallele UPDATEs, wird jeden Tag geleert) */
let seenDay = '';
const seenToday = new Set<string>();

const dayOf = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export function markUserSeen(
  prisma: PrismaClient,
  user: { id: string; lastSeenOn: Date | null; homeDepartmentId: string | null },
  onError: (err: unknown) => void,
  now: Date = new Date()
): void {
  const today = zurichDayKey(now);
  if (dayOf(user.lastSeenOn) === today) return;
  if (seenDay !== today) {
    seenDay = today;
    seenToday.clear();
  }
  if (seenToday.has(user.id)) return;
  seenToday.add(user.id);

  prisma.$executeRaw`
    UPDATE users SET last_seen_on = ${today}::date
    WHERE id = ${user.id} AND (last_seen_on IS NULL OR last_seen_on < ${today}::date)`
    .then((updated) => {
      if (updated > 0) trackUsage('ACTIVE_USER', { departmentId: user.homeDepartmentId, at: now });
    })
    .catch((err) => {
      seenToday.delete(user.id);
      onError(err);
    });
}
