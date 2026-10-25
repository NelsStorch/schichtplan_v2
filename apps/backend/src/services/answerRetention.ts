/**
 * Aufbewahrung der Antworten auf eigene Fragen eines Anlasses (Datensparsamkeit).
 *
 * Jede Frage hat `retention_days` (0, 10, 30, 90, 365 oder null = nie). Ab Anlass-Ende (`events.endDate`,
 * also Ende der letzten Schicht, siehe services/eventRange.ts) plus so vielen Tagen löscht dieser Job
 * die Antworten (einmal pro Anlass in `event_answers` und pro Eintragung in `shift_signup_answers`).
 * Die Frage selbst bleibt stehen, damit das OK sieht, was gefragt wurde. Läuft stündlich (server.ts).
 */
import type { PrismaClient } from '../db.js';

export const ANSWER_RETENTION_INTERVAL_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Zeitpunkt, ab dem die Antworten weg sind (null = nie) */
export function answersExpireAt(eventEnd: Date, retentionDays: number | null): Date | null {
  return retentionDays === null ? null : new Date(eventEnd.getTime() + retentionDays * DAY_MS);
}

/** Abgelaufene Antworten löschen. Gibt die Anzahl gelöschter Antworten zurück. */
export async function purgeExpiredAnswers(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  // Grobe Vorauswahl in der DB (Anlass vorbei), die genaue Frist pro Frage hier
  const candidates = await prisma.eventQuestion.findMany({
    where: { retentionDays: { not: null }, event: { endDate: { lte: now } } },
    select: { id: true, retentionDays: true, event: { select: { endDate: true } } },
  });
  const expiredIds = candidates
    .filter((q) => {
      const expiresAt = answersExpireAt(q.event.endDate, q.retentionDays);
      return expiresAt !== null && expiresAt <= now;
    })
    .map((q) => q.id);
  if (expiredIds.length === 0) return 0;

  const [once, perSignup] = await prisma.$transaction([
    prisma.eventAnswer.deleteMany({ where: { questionId: { in: expiredIds } } }),
    prisma.shiftSignupAnswer.deleteMany({ where: { questionId: { in: expiredIds } } }),
  ]);
  return once.count + perSignup.count;
}
