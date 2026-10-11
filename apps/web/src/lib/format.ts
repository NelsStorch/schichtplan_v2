// Anlässe finden in der Schweiz statt: Zeiten immer in Schweizer Zeit anzeigen,
// auch wenn jemand aus dem Ausland schaut.
const TZ = 'Europe/Zurich';
const LOCALE = 'de-CH';

const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: TZ });
const shortWeekdayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', timeZone: TZ });
const dayMonthFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', timeZone: TZ });
const shortDateFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', timeZone: TZ });
const fullDateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const partsFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  timeZone: TZ,
});

export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtWeekday = (iso: string) => weekdayFmt.format(new Date(iso));
export const fmtShortWeekday = (iso: string) => shortWeekdayFmt.format(new Date(iso)).replace('.', '');
export const fmtDayMonth = (iso: string) => dayMonthFmt.format(new Date(iso));
export const fmtShortDate = (iso: string) => shortDateFmt.format(new Date(iso));
export const fmtFullDate = (iso: string) => fullDateFmt.format(new Date(iso));

/** "16.10. bis 18. Oktober 2026" bzw. "16. Oktober 2026" */
export function fmtDateRange(startIso: string, endIso: string) {
  // Über Geschäftstage, damit ein Ende um 00:30 nicht als Folgetag erscheint
  const start = dayKeyToIso(businessDayKey(startIso));
  const end = dayKeyToIso(businessDayKey(endIso));
  if (start === end) return fmtFullDate(start);
  return `${fmtShortDate(start)} bis ${fmtFullDate(end)}`;
}

/** Dauer als "4 h" bzw. "4 h 30" */
export function fmtDuration(startIso: string, endIso: string) {
  const minutes = Math.max(0, Math.round((+new Date(endIso) - +new Date(startIso)) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

export const hoursBetween = (startIso: string, endIso: string) =>
  Math.max(0, (+new Date(endIso) - +new Date(startIso)) / 3_600_000);

/**
 * Geschäftstag einer Schicht (YYYY-MM-DD, Schweizer Zeit).
 * Regel aus der Legacy-App: Schichten, die vor 03:00 beginnen, gehören zum Vortag
 * (die Barschicht bis 02:00 ist noch "Samstag").
 */
export function businessDayKey(iso: string) {
  const parts = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const date = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day));
  if (+parts.hour < 3) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** ISO-Zeitpunkt mittags am Geschäftstag – für Wochentag-/Datumslabels. */
export const dayKeyToIso = (key: string) => `${key}T12:00:00Z`;

export function groupByBusinessDay<T extends { startTime: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))) {
    const key = businessDayKey(item.startTime);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, items: list }));
}

/** "heute", "morgen", "in 5 Tagen", "vor 2 Tagen" */
export function fmtRelativeDay(iso: string, now = new Date()) {
  const diff = Math.round(
    (Date.parse(businessDayKey(iso)) - Date.parse(businessDayKey(now.toISOString()))) / 86_400_000
  );
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'gestern';
  return diff > 0 ? `in ${diff} Tagen` : `vor ${-diff} Tagen`;
}

export const isPast = (iso: string) => new Date(iso).getTime() < Date.now();
