/**
 * Pflichtangaben einer Person (Handynummer, E-Mail, ...) für Anlässe.
 * Cevi.DB-Konten bringen Name, E-Mail und Geburtsdatum aus dem Profil mit (siehe Cevi.DB-Login in routes/auth.ts).
 */
import {
  PLACEHOLDER_EMAIL_REGEX,
  PLACEHOLDER_LAST_NAME,
  REQUIRED_PROFILE_FIELD_KEYS,
  type RequiredProfileField,
} from '@schichtplan/shared';

export interface ProfileFieldsSource {
  email: string | null;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  birthDate: Date | null;
}

const hasText = (value: string | null | undefined) => Boolean(value && value.trim());

export function hasProfileField(user: ProfileFieldsSource, field: RequiredProfileField): boolean {
  switch (field) {
    case 'PHONE':
      return hasText(user.phone);
    case 'EMAIL':
      return hasText(user.email) && !PLACEHOLDER_EMAIL_REGEX.test(user.email!);
    case 'BIRTH_DATE':
      return user.birthDate !== null;
    case 'FULL_NAME':
      return hasText(user.firstName) && hasText(user.lastName) && user.lastName !== PLACEHOLDER_LAST_NAME;
  }
}

/** Gespeicherte Werte als Pflichtfeld-Liste (unbekannte Schlüssel fallen weg) */
export function cleanRequiredFields(values: string[]): RequiredProfileField[] {
  return REQUIRED_PROFILE_FIELD_KEYS.filter((key) => values.includes(key));
}

export function missingProfileFields(user: ProfileFieldsSource, required: string[]): RequiredProfileField[] {
  return cleanRequiredFields(required).filter((field) => !hasProfileField(user, field));
}

/** «Falk (Max Muster)», ohne Platzhalter-Nachnamen und ohne Wiederholung des Cevi-Namens */
export function personLabel(u: { ceviName: string | null; firstName: string; lastName: string | null }): string {
  const lastName = u.lastName && u.lastName !== PLACEHOLDER_LAST_NAME ? u.lastName : '';
  const fullName = `${u.firstName} ${lastName}`.trim();
  if (!u.ceviName) return fullName;
  return fullName && fullName !== u.ceviName ? `${u.ceviName} (${fullName})` : u.ceviName;
}
