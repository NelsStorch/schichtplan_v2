import { addDaysToDayKey, ageAt, zurichDayKey, type AdminUserListItemDto, type LoginMethod } from '@schichtplan/shared';

// Immer Schweizer Zeit, auch wenn jemand aus dem Ausland schaut
const TZ = 'Europe/Zurich';
const dateFmt = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('de-CH', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
});
const shiftFmt = new Intl.DateTimeFormat('de-CH', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
});

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
export const formatShiftStart = (iso: string) => shiftFmt.format(new Date(iso));

/** "YYYY-MM-DD" als Datum anzeigen, ohne Zeitzonen-Verschiebung */
export function formatBirthDate(value: string) {
  const [y, m, d] = value.split('-');
  return `${d}.${m}.${y}`;
}

/** «Zuletzt aktiv» (YYYY-MM-DD): heute, gestern oder Datum */
export function formatLastSeen(value: string | null | undefined, today = new Date()) {
  if (!value) return 'noch nie';
  const todayKey = zurichDayKey(today);
  if (value === todayKey) return 'heute';
  if (value === addDaysToDayKey(todayKey, -1)) return 'gestern';
  return formatBirthDate(value);
}

/** Heutiges Alter (Schweizer Kalendertag) */
export function ageFromBirthDate(value: string, today = new Date()) {
  return ageAt(value, today) ?? 0;
}

/** Name ohne den Platzhalter "(Helfer)", den der Cevi-Name-Schnelllogin als Nachnamen setzt. */
export function fullName(user: Pick<AdminUserListItemDto, 'firstName' | 'lastName' | 'ceviName'>) {
  const last = user.lastName === '(Helfer)' ? '' : user.lastName;
  return `${user.firstName} ${last}`.trim() || user.ceviName || 'Unbekannt';
}

export const methodLabels: Record<LoginMethod, string> = {
  CEVIDB: 'Cevi.DB',
  PASSWORD: 'Passwort',
  CEVINAME: 'Nur Cevi-Name',
};

/** Rolle in einer Abteilung (Protokoll-Einträge von vor den einzelnen Rechten können noch PLANNER enthalten) */
export const departmentRoleLabels: Record<string, string> = {
  ADMIN: 'Abteilungsleitung',
  PLANNER: 'Planung (alt)',
  HELPER: 'Mitglied',
};

export const organizerRoleLabels: Record<string, string> = {
  OK_LEAD: 'OK-Leitung',
  OK_MEMBER: 'OK-Mitglied',
};

const eventDayFmt = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' });

/** Zeitraum eines Anlasses: «14.06.2026» oder «14.06.2026 – 16.06.2026» (Schweizer Zeit) */
export function formatEventRange(start: string, end: string) {
  const a = eventDayFmt.format(new Date(start));
  const b = eventDayFmt.format(new Date(end));
  return a === b ? a : `${a} – ${b}`;
}

/** Name für Listen ohne den Platzhalter "(Helfer)" */
export function personName(user: { firstName: string; lastName: string; ceviName: string | null }) {
  const name = fullName(user);
  return user.ceviName && user.ceviName !== name && user.ceviName !== user.firstName ? `${user.ceviName} (${name})` : name;
}
