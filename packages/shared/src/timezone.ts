/**
 * Zeitzonen- und Zeitformatierungs-Helfer für den Cevi Schichtplan.
 * Anlässe finden in der Schweiz statt: Alle Ein- und Ausgaben beziehen sich
 * verbindlich auf die Zeitzone Europe/Zurich (Schweizer Zeit mit MEZ/MESZ),
 * unabhängig davon, in welcher Zeitzone der Browser oder der Server-Container läuft.
 */

export const SWISS_TIMEZONE = 'Europe/Zurich';
export const SWISS_LOCALE = 'de-CH';

/** Kulanzfenster in Millisekunden für minimale Uhren-Abweichungen zwischen Client und Server */
export const SIGNUP_OPEN_GRACE_MS = 2000;

const zurichDateFmt = new Intl.DateTimeFormat(SWISS_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: SWISS_TIMEZONE,
});

const zurichTimeFmt = new Intl.DateTimeFormat(SWISS_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: SWISS_TIMEZONE,
});

const zurichShortDateFmt = new Intl.DateTimeFormat(SWISS_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: SWISS_TIMEZONE,
});

const zurichInputPartsFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: SWISS_TIMEZONE,
});

/**
 * Formatiert Datum und Uhrzeit in Schweizer Zeit:
 * z. B. "24.10.2026 um 18:00 Uhr"
 */
export function formatZurichDateTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return zurichDateFmt.format(d).replace(',', ' um') + ' Uhr';
}

/**
 * Formatiert die Uhrzeit in Schweizer Zeit:
 * z. B. "18:00"
 */
export function formatZurichTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return zurichTimeFmt.format(d);
}

/**
 * Formatiert das Datum in Schweizer Zeit:
 * z. B. "24.10.2026"
 */
export function formatZurichDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return zurichShortDateFmt.format(d);
}

/**
 * Wandelt einen ISO-String oder ein Date-Objekt in einen Wert für
 * <input type="datetime-local"> um (YYYY-MM-DDTHH:mm in Schweizer Zeit).
 */
export function toZurichInput(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const parts = Object.fromEntries(
    zurichInputPartsFmt.formatToParts(d).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Wandelt den Wert aus einem <input type="datetime-local"> (YYYY-MM-DDTHH:mm),
 * welcher als Schweizer Wanduhrzeit verstanden wird, in einen UTC-ISO-String um.
 * Berücksichtigt Sommer- und Winterzeit (MEZ UTC+1 / MESZ UTC+2) exakt.
 */
export function zurichInputToIso(val: string | null | undefined): string | null {
  if (!val || typeof val !== 'string') return null;
  const match = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, m, d, hr, min] = match.map(Number);

  // Startannahme UTC
  let testUtc = Date.UTC(y, m - 1, d, hr, min);

  // Iterative Offset-Korrektur (konvergiert in 1-2 Schritten)
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      zurichInputPartsFmt.formatToParts(new Date(testUtc)).map((p) => [p.type, p.value])
    );
    const diffMs =
      Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) -
      Date.UTC(y, m - 1, d, hr, min);
    testUtc -= diffMs;
  }

  return new Date(testUtc).toISOString();
}

/**
 * Verschiebt einen Zeitpunkt um ganze Kalendertage in Schweizer Zeit: Die Uhrzeit bleibt gleich,
 * auch über die Zeitumstellung hinweg (18:00 bleibt 18:00, nicht 17:00).
 */
export function addZurichDays(date: Date | string, days: number): Date {
  const local = toZurichInput(date);
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return new Date(date);
  const [, y, m, d, hr, min] = match.map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days, hr, min));
  const pad = (n: number) => String(n).padStart(2, '0');
  const input = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(hr)}:${pad(min)}`;
  return new Date(zurichInputToIso(input)!);
}

/**
 * Prüft, ob ein Freischaltzeitpunkt erreicht oder überschritten ist.
 * Berücksichtigt ein kleines Kulanzfenster (Standard 2 Sekunden) gegen Uhren-Abweichungen.
 */
export function isSignupTimeOpen(
  signupOpensAt: Date | string | null | undefined,
  graceMs: number = SIGNUP_OPEN_GRACE_MS
): boolean {
  if (!signupOpensAt) return true;
  const target = typeof signupOpensAt === 'string' ? new Date(signupOpensAt).getTime() : signupOpensAt.getTime();
  if (isNaN(target)) return true;
  return Date.now() + graceMs >= target;
}
