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

/** Kalendertag in Schweizer Zeit als YYYY-MM-DD */
export function zurichDayKey(date: Date | string): string {
  return toZurichInput(date).slice(0, 10);
}

/** Uhrzeit in Schweizer Zeit als HH:mm (24 h, für Vorlagen) */
export function zurichTimeKey(date: Date | string): string {
  return toZurichInput(date).slice(11, 16);
}

/**
 * Zeitraum eines Anlasses kompakt in Schweizer Zeit, z. B. «24.10.2026», «24.–26.10.2026» oder
 * «30.10.–02.11.2026». Das Ende zählt nach `cutoff` (z. B. Fest bis 02:00 gehört noch zum Vortag).
 */
export function formatZurichDateRange(
  start: Date | string,
  end: Date | string,
  cutoff: string | null | undefined = '04:00'
): string {
  const from = zurichDayKey(start);
  let to = businessDayKey(end, cutoff);
  if (to < from) to = from;
  const [fy, fm, fd] = from.split('-');
  const [ty, tm, td] = to.split('-');
  if (from === to) return `${fd}.${fm}.${fy}`;
  if (fy === ty && fm === tm) return `${fd}.–${td}.${tm}.${ty}`;
  if (fy === ty) return `${fd}.${fm}.–${td}.${tm}.${ty}`;
  return `${fd}.${fm}.${fy}–${td}.${tm}.${ty}`;
}

/** YYYY-MM-DD um ganze Kalendertage verschieben */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Abstand zweier YYYY-MM-DD in ganzen Tagen (to - from) */
export function dayKeyDiff(from: string, to: string): number {
  const ms = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** Tag (YYYY-MM-DD) und Uhrzeit (HH:mm) als Schweizer Wanduhrzeit in einen Zeitpunkt umwandeln */
export function zurichDateTime(dayKey: string, time: string): Date {
  return new Date(zurichInputToIso(`${dayKey}T${time}`)!);
}

/**
 * Alter an einem Zeitpunkt, gerechnet mit dem Kalendertag in Schweizer Zeit (eine Schicht um 00:30
 * am 18. Geburtstag zählt also schon). Das Geburtsdatum ist ein reines Datum (YYYY-MM-DD bzw.
 * UTC-Mitternacht, so speichert es das Backend).
 */
export function ageAt(birthDate: Date | string | null | undefined, at: Date | string): number | null {
  if (!birthDate) return null;
  const birthKey = typeof birthDate === 'string' ? birthDate.slice(0, 10) : birthDate.toISOString().slice(0, 10);
  const [by, bm, bd] = birthKey.split('-').map(Number);
  const [ay, am, ad] = zurichDayKey(at).split('-').map(Number);
  if ([by, bm, bd, ay, am, ad].some((n) => Number.isNaN(n))) return null;
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age--;
  return age;
}

/**
 * Austrage-Sperre: ab diesem Zeitpunkt können sich Helfende nicht mehr selbst austragen.
 * N Kalendertage vor dem Beginn in Schweizer Zeit (gleiche Uhrzeit, auch über die Zeitumstellung).
 */
export function cancelDeadlineAt(eventStart: Date | string, cancelDeadlineDays: number): Date {
  return addZurichDays(eventStart, -cancelDeadlineDays);
}

/** «1 Tag» / «3 Tage» */
export function formatDays(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'Tag' : 'Tage'}`;
}

/** Zeitspanne in Schweizer Zeit, einheitlich «18:00–22:00» */
export function formatZurichTimeRange(start: Date | string, end: Date | string): string {
  return `${formatZurichTime(start)}–${formatZurichTime(end)}`;
}

/**
 * Tageswechsel-Uhrzeit (HH:MM, z. B. 04:00) in Minuten seit Mitternacht. Ungültig oder leer ➜ 04:00.
 */
export function parseDayCutoffMinutes(cutoff: string | null | undefined = '04:00'): number {
  const match = (cutoff ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 4 * 60;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Geschäftstag eines Zeitpunkts (YYYY-MM-DD, Schweizer Zeit): Was vor der Tageswechsel-Uhrzeit
 * beginnt, gehört zum Vortag (die Barschicht bis 03:00 ist noch «Samstag»).
 */
export function businessDayKey(date: Date | string, cutoff: string | null | undefined = '04:00'): string {
  const local = toZurichInput(date);
  const minutes = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  const day = local.slice(0, 10);
  return minutes < parseDayCutoffMinutes(cutoff) ? addDaysToDayKey(day, -1) : day;
}

/** «seit Anlassbeginn» bzw. «seit dem 12.06.2026 um 18:00 Uhr (2 Tage vor Anlassbeginn)» */
export function cancelDeadlineText(deadline: Date, cancelDeadlineDays: number): string {
  return cancelDeadlineDays === 0
    ? 'seit Anlassbeginn'
    : `seit dem ${formatZurichDateTime(deadline)} (${formatDays(cancelDeadlineDays)} vor Anlassbeginn)`;
}

/** Formatiert eine Minutenzahl lesbar, z. B. '4h 30m', '2h', '45m' oder '0h' */
export function formatMinutes(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0 && mins === 0) return '0h';
  if (mins === 0) return `${hours}h`;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}
