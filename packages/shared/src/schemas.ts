import { z } from 'zod';
import {
  EVENT_ACCESS_TYPE_KEYS,
  REQUIRED_PROFILE_FIELD_KEYS,
  RESERVED_SUBDOMAINS,
  SUBDOMAIN_REGEX,
} from './constants.js';

const EventQuestionInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(2, 'Frage braucht einen Text').max(200),
    type: z.enum(['TEXT', 'YES_NO', 'CHOICE']).default('TEXT'),
    options: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
    required: z.boolean().default(false),
    scope: z.enum(['ONCE', 'PER_SIGNUP']).default('ONCE'),
  })
  .refine((q) => q.type !== 'CHOICE' || q.options.length >= 2, {
    message: 'Eine Auswahl-Frage braucht mindestens zwei Antworten',
  });

export type EventQuestionInput = z.infer<typeof EventQuestionInputSchema>;

/** Zugang & Pflichtangaben eines Anlasses (gleich beim Erstellen, Bearbeiten und für Vorlagen) */
const EventAccessFields = {
  accessType: z.enum(EVENT_ACCESS_TYPE_KEYS).default('PUBLIC'),
  leadersOnly: z.boolean().default(false),
  requiredFields: z.array(z.enum(REQUIRED_PROFILE_FIELD_KEYS)).default([]),
  allowedDepartmentIds: z.array(z.string().uuid()).max(100).default([]),
  allowedStufeIds: z.array(z.string().uuid()).max(100).default([]),
  questions: z.array(EventQuestionInputSchema).max(30).default([]),
};

/**
 * Bild-Adresse (Logo, Banner): Pfad auf der eigenen Seite (z. B. /api/uploads/…) oder http(s)-URL.
 * Leer = kein Bild. Andere Schemata (javascript:, data: …) und protokoll-relative Pfade sind nicht erlaubt.
 */
export const ImageUrlSchema = z
  .string()
  .trim()
  .max(500, 'Die Bild-Adresse ist zu lang')
  .refine((value) => value === '' || /^\/(?![/\\])[^\\\s]*$/.test(value) || /^https?:\/\/[^\s\\]+$/i.test(value), {
    message: 'Ungültige Bild-Adresse',
  });

/** Akzentfarbe als #rrggbb */
export const HexColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe im Format #rrggbb');

const DepartmentSlugSchema = z
  .string()
  .min(3, 'Subdomain muss mindestens 3 Zeichen lang sein')
  .max(30, 'Subdomain darf maximal 30 Zeichen lang sein')
  .regex(SUBDOMAIN_REGEX, 'Nur Kleinbuchstaben, Zahlen und Bindestriche erlaubt')
  .refine((val: string) => !RESERVED_SUBDOMAINS.includes(val as any), {
    message: 'Diese Subdomain ist reserviert und kann nicht verwendet werden',
  });


/** Abteilung anlegen als angemeldete Abteilungsleitung (Cevi.DB): ohne Passwort, Admin ist die angemeldete Person. */
export const CreateDepartmentFromCeviDbSchema = z.object({
  departmentName: z.string().trim().min(2, 'Name muss mindestens 2 Zeichen lang sein').max(80),
  slug: DepartmentSlugSchema,
});

export type CreateDepartmentFromCeviDbInput = z.infer<typeof CreateDepartmentFromCeviDbSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(1, 'Passwort ist erforderlich').max(200),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterHelperSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse').max(254),
  password: z
    .string()
    .min(8, 'Passwort muss mindestens 8 Zeichen lang sein')
    .max(200, 'Passwort darf höchstens 200 Zeichen lang sein'),
  firstName: z.string().trim().min(2, 'Vorname erforderlich').max(80),
  lastName: z.string().trim().min(2, 'Nachname erforderlich').max(80),
  ceviName: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(30).optional(),
});

export type RegisterHelperInput = z.infer<typeof RegisterHelperSchema>;

/** Geburtsdatum JJJJ-MM-TT, das es gibt, nicht in der Zukunft und nicht vor 1900 */
const BirthDateSchema = z
  .string({ error: 'Geburtsdatum fehlt' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Geburtsdatum im Format JJJJ-MM-TT (z.B. 2005-08-14)')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().startsWith(value) &&
      date.getUTCFullYear() >= 1900 &&
      date.getTime() <= Date.now()
    );
  }, 'Bitte ein gültiges Geburtsdatum angeben');

/**
 * Login mit Cevi-Name: nur an einer Abteilung. Cevi-Name + Geburtsdatum + Abteilung bestimmen
 * das Profil (gleiche Namen in einer Abteilung sind erlaubt, solange das Geburtsdatum anders ist).
 */
export const CeviNameQuickLoginSchema = z.object({
  departmentSlug: z.string().trim().min(1, 'Abteilung fehlt').max(30),
  ceviName: z.string().trim().min(2, 'Cevi-Name muss mindestens 2 Zeichen lang sein').max(60),
  birthDate: BirthDateSchema,
  returnTo: z.string().max(2000).optional(),
});

export type CeviNameQuickLoginInput = z.infer<typeof CeviNameQuickLoginSchema>;

/** Neues Cevi-Name-Profil an einer Abteilung, wenn der Login niemanden gefunden hat */
export const CeviNameRegisterSchema = CeviNameQuickLoginSchema.extend({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()\/-]{7,25}$/, 'Bitte eine gültige Handynummer angeben')
    .optional()
    .or(z.literal('')),
  stufen: z
    .array(z.object({ stufeId: z.string().uuid(), role: z.enum(['LEITUNG', 'TEILNEHMER']) }))
    .max(20)
    .default([]),
});

export type CeviNameRegisterInput = z.infer<typeof CeviNameRegisterSchema>;

export const CreateEventOrganizerItemSchema = z.object({
  userId: z.string().uuid().optional(),
  ceviName: z.string().trim().max(60).optional(),
  email: z.string().email().max(254).optional(),
  role: z.enum(['OK_LEAD', 'OK_MEMBER']).default('OK_MEMBER'),
  roleTitle: z.string().trim().max(80).optional().nullable(),
});

export type CreateEventOrganizerItemInput = z.infer<typeof CreateEventOrganizerItemSchema>;

export const CreateEventSchema = z.object({
  title: z.string().trim().min(2, 'Titel ist erforderlich').max(120),
  slug: z
    .string()
    .min(2, 'Slug erforderlich')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten'),
  description: z.string().max(5000).optional(),
  logoUrl: ImageUrlSchema.optional().nullable(),
  bannerUrl: ImageUrlSchema.optional().nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  ...EventAccessFields,
  allowPublicSignup: z.boolean().default(true),
  minShiftsPerPerson: z.number().int().min(1).max(100).nullable().optional(),
  organizers: z.array(CreateEventOrganizerItemSchema).max(50).optional(),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;

/** Anlass bearbeiten: alle Felder optional. Listen (Whitelist, Stufen, Fragen) ersetzen die bisherigen. */
export const UpdateEventSchema = z.object({
  title: z.string().trim().min(2, 'Titel ist erforderlich').max(120).optional(),
  description: z.string().max(5000).optional().nullable(),
  logoUrl: ImageUrlSchema.optional().nullable(),
  bannerUrl: ImageUrlSchema.optional().nullable(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  allowPublicSignup: z.boolean().optional(),
  minShiftsPerPerson: z.number().int().min(1).max(100).nullable().optional(),
  accessType: z.enum(EVENT_ACCESS_TYPE_KEYS).optional(),
  leadersOnly: z.boolean().optional(),
  requiredFields: z.array(z.enum(REQUIRED_PROFILE_FIELD_KEYS)).optional(),
  allowedDepartmentIds: z.array(z.string().uuid()).max(100).optional(),
  allowedStufeIds: z.array(z.string().uuid()).max(100).optional(),
  questions: z.array(EventQuestionInputSchema).max(30).optional(),
});

export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

/** Profilangaben, die eine Person für einen Anlass nachträgt (nur gesetzte Felder werden geändert) */
export const UpdateProfileSchema = z.object({
  firstName: z.string().trim().min(2, 'Vorname ist zu kurz').max(80).optional(),
  lastName: z.string().trim().min(2, 'Nachname ist zu kurz').max(80).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()\/-]{7,25}$/, 'Bitte eine gültige Handynummer angeben')
    .optional(),
  email: z.string().trim().email('Ungültige E-Mail-Adresse').max(254).optional(),
  birthDate: BirthDateSchema.optional(),
  address: z.string().trim().min(5, 'Bitte Strasse, PLZ und Ort angeben').max(200).optional(),
  /** Erinnerungs-Mail vor eigenen Schichten */
  shiftReminders: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const EventParticipationSchema = z.object({
  profile: UpdateProfileSchema.optional(),
  answers: z.record(z.string().uuid(), z.string().trim().max(1000)).optional(),
});

export type EventParticipationInput = z.infer<typeof EventParticipationSchema>;

export const CreateAccessLinkSchema = z.object({
  label: z.string().trim().min(2, 'Bitte angeben, für wen der Link ist').max(100),
  kind: z.enum(['PERSONAL', 'GROUP']).default('PERSONAL'),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type CreateAccessLinkInput = z.infer<typeof CreateAccessLinkSchema>;

export const RedeemAccessLinkSchema = z.object({
  token: z.string().min(10).max(100),
});

/** Heimabteilung und Stufen beim Login angeben. departmentId null = keine Abteilung. */
export const SetHomeDepartmentSchema = z.object({
  departmentId: z.string().uuid().nullable(),
  stufen: z
    .array(z.object({ stufeId: z.string().uuid(), role: z.enum(['LEITUNG', 'TEILNEHMER']) }))
    .max(20)
    .default([]),
});

export type SetHomeDepartmentInput = z.infer<typeof SetHomeDepartmentSchema>;

export const StufeInputSchema = z.object({
  name: z.string().trim().min(2, 'Name der Stufe ist zu kurz').max(60),
  ceviDbGroupId: z.number().int().positive().max(2_147_483_647).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export type StufeInput = z.infer<typeof StufeInputSchema>;

export const UpdateDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  logoUrl: ImageUrlSchema.optional().nullable(),
  primaryColor: HexColorSchema.optional().nullable(),
  contactEmail: z.string().email().max(254).optional().nullable(),
  membersOnly: z.boolean().optional(),
});

export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;

export const AddEventOrganizerSchema = z.object({
  userId: z.string().uuid().optional(),
  ceviName: z.string().trim().max(60).optional(),
  email: z.string().email().max(254).optional(),
  role: z.enum(['OK_LEAD', 'OK_MEMBER']).default('OK_MEMBER'),
  roleTitle: z.string().trim().max(80).optional(),
});

export type AddEventOrganizerInput = z.infer<typeof AddEventOrganizerSchema>;

export const CreateTaskDefinitionSchema = z.object({
  title: z.string().trim().min(2, 'Titel der Arbeit erforderlich').max(120),
  description: z.string().max(2000).optional().nullable(),
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  ageRequirementType: z.enum(['ALL', 'AT_LEAST_ONE']).default('ALL'),
});

export type CreateTaskDefinitionInput = z.infer<typeof CreateTaskDefinitionSchema>;

export const UpdateTaskDefinitionSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  ageRequirementType: z.enum(['ALL', 'AT_LEAST_ONE']).optional(),
});

export type UpdateTaskDefinitionInput = z.infer<typeof UpdateTaskDefinitionSchema>;

export const CreateShiftTaskSchema = z.object({
  id: z.string().uuid().optional(),
  taskDefinitionId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2, 'Titel der Arbeit erforderlich').max(120),
  description: z.string().max(2000).optional().nullable(),
  requiredSlots: z.number().int().min(1, 'Mindestens 1 Helfer benötigt').max(500).default(1),
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  ageRequirementType: z.enum(['ALL', 'AT_LEAST_ONE']).default('ALL'),
});

export type CreateShiftTaskInput = z.infer<typeof CreateShiftTaskSchema>;

export const CreateShiftSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().trim().min(2, 'Titel erforderlich').max(120),
  category: z.string().max(80).optional().nullable(),
  isSetupTeardown: z.boolean().optional().default(false),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  requiredSlots: z.number().int().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  tasks: z.array(CreateShiftTaskSchema).max(50).optional(),
});

export type CreateShiftInput = z.infer<typeof CreateShiftSchema>;

export const UpdateShiftSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  category: z.string().max(80).optional().nullable(),
  isSetupTeardown: z.boolean().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  requiredSlots: z.number().int().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  tasks: z.array(CreateShiftTaskSchema).max(50).optional(),
});

export type UpdateShiftInput = z.infer<typeof UpdateShiftSchema>;

export const SignupShiftSchema = z.object({
  shiftId: z.string().uuid(),
  taskId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(), // Ermöglicht dem OK, ein Abteilungsmitglied einzuteilen
  // Nur für das OK: Person ohne Konto von Hand eintragen (Selbsteintragung braucht immer ein Konto)
  guestName: z.string().trim().min(2, 'Bitte Cevi-Name oder Vorname angeben').max(80).optional().nullable(),
  guestEmail: z.string().email('Ungültige E-Mail').max(254).optional().or(z.literal('')).nullable(),
  guestPhone: z.string().trim().max(30).optional().nullable(),
  /** Antworten auf Fragen mit scope PER_SIGNUP (questionId -> Antwort) */
  answers: z.record(z.string().uuid(), z.string().trim().max(1000)).optional(),
});

export type SignupShiftInput = z.infer<typeof SignupShiftSchema>;

export const SaveAsTemplateSchema = z.object({
  title: z.string().trim().min(2, 'Name der Vorlage erforderlich').max(120),
  description: z.string().max(5000).optional().nullable(),
});

export type SaveAsTemplateInput = z.infer<typeof SaveAsTemplateSchema>;

export const InstantiateTemplateSchema = z.object({
  title: z.string().trim().min(2, 'Titel ist erforderlich').max(120),
  slug: z
    .string()
    .min(2, 'Slug erforderlich')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten'),
  description: z.string().max(5000).optional().nullable(),
  logoUrl: ImageUrlSchema.optional().nullable(),
  bannerUrl: ImageUrlSchema.optional().nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  ...EventAccessFields,
  allowPublicSignup: z.boolean().default(true),
  minShiftsPerPerson: z.number().int().min(1).max(100).nullable().optional(),
});

export type InstantiateTemplateInput = z.infer<typeof InstantiateTemplateSchema>;

export const UnregisterHelperSchema = z.object({
  userId: z.string().uuid().optional(),
  guestName: z.string().trim().max(80).optional(),
});

export type UnregisterHelperInput = z.infer<typeof UnregisterHelperSchema>;

export const EventDeregistrationSchema = z.object({
  userId: z.string().uuid('Ungültige Benutzer-ID'),
  reason: z.string().trim().max(200, 'Grund darf maximal 200 Zeichen lang sein').optional(),
});

export type EventDeregistrationInput = z.infer<typeof EventDeregistrationSchema>;


/** Abteilungsleitung bearbeitet eine Person: Stufen (selbst angegebene) und Rolle im Schichtplan */
export const UpdateDepartmentPersonSchema = z.object({
  stufen: z
    .array(z.object({ stufeId: z.string().uuid(), role: z.enum(['LEITUNG', 'TEILNEHMER']) }))
    .max(20)
    .optional(),
  departmentRole: z.enum(['ADMIN', 'PLANNER', 'HELPER']).optional(),
});

export type UpdateDepartmentPersonInput = z.infer<typeof UpdateDepartmentPersonSchema>;

export const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Token ist erforderlich').max(200),
});

export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

export const ResendVerificationSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
});

export type ResendVerificationInput = z.infer<typeof ResendVerificationSchema>;
