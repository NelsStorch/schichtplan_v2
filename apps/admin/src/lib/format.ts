import type { AdminUserListItemDto, LoginMethod } from '@schichtplan/shared';

const dateFmt = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('de-CH', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const shiftFmt = new Intl.DateTimeFormat('de-CH', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
export const formatShiftStart = (iso: string) => shiftFmt.format(new Date(iso));

/** "YYYY-MM-DD" als lokales Datum anzeigen, ohne Zeitzonen-Verschiebung. */
export function formatBirthDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

export function ageFromBirthDate(value: string, today = new Date()) {
  const [y, m, d] = value.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
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

export const departmentRoleLabels: Record<string, string> = {
  ADMIN: 'Abteilungsleitung',
  PLANNER: 'Schichtplaner*in',
  HELPER: 'Helfer*in',
};

export const organizerRoleLabels: Record<string, string> = {
  OK_LEAD: 'OK-Leitung',
  OK_MEMBER: 'OK-Mitglied',
};
