/**
 * Pflichtangaben einer Person (Handynummer, E-Mail, ...) für Anlässe.
 * Cevi.DB-Konten bringen die meisten Angaben aus dem Profil mit (siehe `ceviDbProfileFields`).
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
  address: string | null;
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
    case 'ADDRESS':
      return hasText(user.address);
  }
}

/** Gespeicherte Werte als Pflichtfeld-Liste (unbekannte Schlüssel fallen weg) */
export function cleanRequiredFields(values: string[]): RequiredProfileField[] {
  return REQUIRED_PROFILE_FIELD_KEYS.filter((key) => values.includes(key));
}

export function missingProfileFields(user: ProfileFieldsSource, required: string[]): RequiredProfileField[] {
  return cleanRequiredFields(required).filter((field) => !hasProfileField(user, field));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * Adresse und Handynummer aus dem Cevi.DB-Profil. Telefonnummern liefert Cevi.DB nur,
 * wenn der Scope sie freigibt; dann wird eine Mobilnummer bevorzugt.
 */
export function ceviDbProfileFields(profile: unknown): { address: string | null; phone: string | null } {
  if (!isRecord(profile)) return { address: null, phone: null };

  const street = str(profile.address);
  const place = [str(profile.zip_code), str(profile.town)].filter(Boolean).join(' ');
  const address = street && place ? `${street}, ${place}` : street || null;

  let phone: string | null = null;
  const numbers = Array.isArray(profile.phone_numbers) ? profile.phone_numbers.filter(isRecord) : [];
  const mobile = numbers.find((n) => /mobil|handy|natel/i.test(String(n.label ?? '')));
  const first = mobile ?? numbers[0];
  if (first) phone = str(first.number);

  return { address, phone };
}

/** «Falk (Max Muster)», ohne Platzhalter-Nachnamen und ohne Wiederholung des Cevi-Namens */
export function personLabel(u: { ceviName: string | null; firstName: string; lastName: string }): string {
  const lastName = u.lastName === PLACEHOLDER_LAST_NAME ? '' : u.lastName;
  const fullName = `${u.firstName} ${lastName}`.trim();
  if (!u.ceviName) return fullName;
  return fullName && fullName !== u.ceviName ? `${u.ceviName} (${fullName})` : u.ceviName;
}
