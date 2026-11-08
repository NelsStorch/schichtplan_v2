/**
 * Unbestätigte Passwort-Konten aufräumen (Datensparsamkeit).
 *
 * Wer sich mit E-Mail und Passwort registriert, muss die Adresse innert 24 Stunden bestätigen; vorher
 * geht kein Login. Ist kein gültiger Bestätigungslink mehr offen, wird das Konto gelöscht. Sonst blieben
 * vertippte Konten samt Name und Handynummer liegen, und wem die vertippte Adresse gehört, könnte sie
 * über «Passwort vergessen» übernehmen. Wer einen neuen Link anfordert, verlängert die Frist.
 *
 * Gelöscht wird nur, was sicher nichts trägt: kein Cevi.DB-Konto, kein globaler Admin, keine Schichten,
 * kein OK, keine Verantwortung, keine Rechte. Solche Konten bleiben stehen (Fall fürs Admin-Portal).
 * Läuft stündlich (server.ts).
 */
import { Prisma, type PrismaClient } from '../db.js';

export const UNVERIFIED_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** So lange gilt ein Bestätigungslink (gleich wie beim Registrieren in routes/auth.ts) */
export const UNVERIFIED_ACCOUNT_TTL_MS = 24 * 60 * 60 * 1000;

export async function deleteExpiredUnverifiedAccounts(
  prisma: PrismaClient,
  log?: { warn: (obj: object, msg: string) => void },
  now: Date = new Date()
): Promise<number> {
  const candidates = await prisma.user.findMany({
    where: {
      emailVerified: false,
      passwordHash: { not: null },
      ceviDbId: null,
      isGlobalAdmin: false,
      // Erst nach Ablauf der Frist, auch wenn der Link schon vorher gelöscht wurde
      createdAt: { lte: new Date(now.getTime() - UNVERIFIED_ACCOUNT_TTL_MS) },
      // Kein gültiger Bestätigungs- oder Reset-Link mehr offen (ein Reset bestätigt die Adresse auch)
      emailVerificationTokens: { none: { expiresAt: { gt: now } } },
      passwordResetTokens: { none: { expiresAt: { gt: now } } },
      // Nichts, woran etwas hängt
      signups: { none: {} },
      organizedEvents: { none: {} },
      shiftResponsibles: { none: {} },
      eventDayResponsibles: { none: {} },
      contactForEvents: { none: {} },
      contactForDepartments: { none: {} },
      memberships: { none: { OR: [{ role: 'ADMIN' }, { permissions: { isEmpty: false } }] } },
    },
    select: { id: true },
    take: 500,
  });

  let deleted = 0;
  for (const { id } of candidates) {
    try {
      // Bedingungen beim Löschen nochmals prüfen: Dazwischen könnte die Adresse bestätigt worden sein
      const { count } = await prisma.user.deleteMany({
        where: { id, emailVerified: false, passwordHash: { not: null }, ceviDbId: null, signups: { none: {} } },
      });
      deleted += count;
    } catch (err) {
      // z. B. ein Verweis ohne Kaskade (Zugangslink): stehen lassen statt den ganzen Lauf abzubrechen
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        log?.warn({ userId: id, code: err.code }, 'Unbestätigtes Konto konnte nicht gelöscht werden');
        continue;
      }
      throw err;
    }
  }
  return deleted;
}
