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
  lastName: string;
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

/** Adressfelder im Cevi.DB-Profil (oberste Ebene und OpenID-`_userInfo`) */
const CEVIDB_ADDRESS_KEYS = [
  'address',
  'street',
  'housenumber',
  'postbox',
  'zip_code',
  'postal_code',
  'town',
  'country',
  'additional_addresses',
];

/**
 * Rohes Cevi.DB-Profil ohne Adresse: Der Schichtplan speichert keine Adressen (Datensparsamkeit),
 * auch nicht in `users.ceviDbData`.
 */
export function withoutCeviDbAddress<T>(profile: T): T {
  const strip = (value: unknown): unknown => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !CEVIDB_ADDRESS_KEYS.includes(key)));
  };
  const top = strip(profile);
  if (typeof top !== 'object' || top === null) return profile;
  const record = top as Record<string, unknown>;
  if ('_userInfo' in record) record._userInfo = strip(record._userInfo);
  return record as T;
}

/** «Falk (Max Muster)», ohne Platzhalter-Nachnamen und ohne Wiederholung des Cevi-Namens */
export function personLabel(u: { ceviName: string | null; firstName: string; lastName: string }): string {
  const lastName = u.lastName === PLACEHOLDER_LAST_NAME ? '' : u.lastName;
  const fullName = `${u.firstName} ${lastName}`.trim();
  if (!u.ceviName) return fullName;
  return fullName && fullName !== u.ceviName ? `${u.ceviName} (${fullName})` : u.ceviName;
}
