import { z } from 'zod';
import {
  ATTENDANCE_MODE_KEYS,
  ATTENDANCE_STATUS_KEYS,
  DEFAULT_QUESTION_RETENTION_DAYS,
  DEPARTMENT_PERMISSION_KEYS,
  EMAIL_REMINDER_MINUTES,
  EVENT_ACCESS_TYPE_KEYS,
  PUSH_REMINDER_MINUTES,
  QUESTION_RETENTION_DAYS,
  REPLACEMENT_CUTOFF_HOURS,
  type DepartmentPermission,
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
    /** Tage nach dem Anlass, bis die Antworten gelöscht werden (null = nie) */
    retentionDays: z
      .number()
      .int()
      .refine((d) => (QUESTION_RETENTION_DAYS as readonly (number | null)[]).includes(d), {
        message: 'Ungültige Aufbewahrungsdauer',
      })
      .nullable()
      .default(DEFAULT_QUESTION_RETENTION_DAYS),
  })
  .refine((q) => q.type !== 'CHOICE' || q.options.length >= 2, {
    message: 'Eine Auswahl-Frage braucht mindestens zwei Antworten',
  });

export type EventQuestionInput = z.infer<typeof EventQuestionInputSchema>;

/** Pflichtangaben; nicht mehr bekannte Schlüssel (z. B. das frühere ADDRESS) fallen still weg */
const RequiredFieldsSchema = z
  .array(z.string().max(40))
  .max(20)
  .transform((values) => REQUIRED_PROFILE_FIELD_KEYS.filter((key) => values.includes(key)));

/** Zugang & Pflichtangaben eines Anlasses (gleich beim Erstellen, Bearbeiten und für Vorlagen) */
const EventAccessFields = {
  accessType: z.enum(EVENT_ACCESS_TYPE_KEYS).default('PUBLIC'),
  leadersOnly: z.boolean().default(false),
  requiredFields: RequiredFieldsSchema.default([]),
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

export const DepartmentSlugSchema = z
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
  /** Gewählte Ebene, wenn die Person mehrere leitet (sonst die unterste ohne Schichtplan) */
  hitobitoGroupId: z.number().int().positive().max(2_147_483_647).optional(),
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
  lastName: z.string().trim().max(80).optional().or(z.literal('')),
  nickname: z.string().trim().max(60).optional(),
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
  nickname: z.string().trim().max(60).optional(),
  ceviName: z.string().trim().max(60).optional(),
  email: z.string().email().max(254).optional(),
  role: z.enum(['OK_LEAD', 'OK_MEMBER']).default('OK_MEMBER'),
  roleTitle: z.string().trim().max(80).optional().nullable(),
});

export type CreateEventOrganizerItemInput = z.infer<typeof CreateEventOrganizerItemSchema>;

/** Erlaubte Fristen für «Ersatz gesucht» (Stunden vor Schichtbeginn) */
const ReplacementCutoffSchema = z
  .number()
  .int()
  .refine((h) => (REPLACEMENT_CUTOFF_HOURS as readonly number[]).includes(h), 'Ungültige Frist');

/** Mindestlänge des Stand-PINs: Ein kurzer PIN ist mit wenigen IP-Adressen schnell durchprobiert */
export const STAFF_PIN_MIN_LENGTH = 4;

/** Stand-PIN für Papier-Bons: leer/null = kein PIN, sonst mindestens STAFF_PIN_MIN_LENGTH Zeichen */
const StaffPinSchema = z
  .string()
  .trim()
  .max(20, 'Der Stand-PIN darf höchstens 20 Zeichen haben')
  .refine((pin) => pin === '' || pin.length >= STAFF_PIN_MIN_LENGTH, `Der Stand-PIN braucht mindestens ${STAFF_PIN_MIN_LENGTH} Zeichen`)
  .nullable()
  .optional();

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
  /** Datum des Anlasses, bis es Schichten gibt; danach gilt erste bis letzte Schicht */
  startDate: z.string().datetime(),
  /** Veraltet, wird ignoriert: Das Ende ergibt sich aus den Schichten */
  endDate: z.string().datetime().optional(),
  ...EventAccessFields,
  allowPublicSignup: z.boolean().default(true),
  minShiftsPerPerson: z.number().int().min(1).max(100).nullable().optional(),
  contactUserId: z.string().uuid().optional().nullable(),
  dayCutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Uhrzeit muss im Format HH:MM angegeben werden (z. B. 04:00)').optional().default('04:00'),
  responsibleMode: z.enum(['BY_SHIFT', 'BY_DAY']).optional().default('BY_SHIFT'),
  contactVisibility: z.enum(['BOTH', 'PHONE', 'EMAIL', 'NONE']).optional().default('BOTH'),
  signupOpensAt: z.string().datetime().nullable().optional(),
  cancelDeadlineDays: z.number().int().min(0).max(365).nullable().optional(),
  attendanceMode: z.enum(ATTENDANCE_MODE_KEYS).optional(),
  checkinEarlyMinutes: z.number().int().min(0, 'Minuten dürfen nicht negativ sein').max(1440, 'Maximal 24 Stunden (1440 Min)').optional().default(30),
  checkinLateMinutes: z.number().int().min(0, 'Minuten dürfen nicht negativ sein').max(1440, 'Maximal 24 Stunden (1440 Min)').optional().default(30),
  cateringTokensEnabled: z.boolean().optional().default(false),
  cateringTokenItems: z
    .array(z.string().trim().min(1, 'Gutschein-Titel darf nicht leer sein').max(60, 'Maximal 60 Zeichen'))
    .min(1, 'Mindestens ein Gutschein-Typ erforderlich')
    .max(10, 'Maximal 10 Gutschein-Typen')
    .optional()
    .default(['1x Helfermenü', '1x Getränk']),
  cateringEarlyHours: z
    .number()
    .int()
    .min(-1, 'Ungültige Vorlaufzeit')
    .max(72, 'Maximal 72 Stunden Vorlaufzeit')
    .optional()
    .default(2),
  cateringStaffPin: StaffPinSchema,
  cateringRemindersEnabled: z.boolean().optional().default(true),
  overlapToleranceMinutes: z.number().int().min(0).max(120).optional().default(15),
  allowReplacement: z.boolean().optional(),
  replacementCutoffHours: ReplacementCutoffSchema.optional(),
  reminderNote: z.string().trim().max(1000, 'Hinweis darf maximal 1000 Zeichen lang sein').optional().nullable(),
  organizers: z.array(CreateEventOrganizerItemSchema).max(50).optional(),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;

/** Anlass bearbeiten: alle Felder optional. Listen (Whitelist, Stufen, Fragen) ersetzen die bisherigen. */
export const UpdateEventSchema = z.object({
  title: z.string().trim().min(2, 'Titel ist erforderlich').max(120).optional(),
  slug: z
    .string()
    .min(2, 'Slug erforderlich')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten')
    .optional(),
  description: z.string().max(5000).optional().nullable(),
  logoUrl: ImageUrlSchema.optional().nullable(),
  bannerUrl: ImageUrlSchema.optional().nullable(),
  allowPublicSignup: z.boolean().optional(),
  minShiftsPerPerson: z.number().int().min(1).max(100).nullable().optional(),
  contactUserId: z.string().uuid().optional().nullable(),
  dayCutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Uhrzeit muss im Format HH:MM angegeben werden (z. B. 04:00)').optional(),
  responsibleMode: z.enum(['BY_SHIFT', 'BY_DAY']).optional(),
  contactVisibility: z.enum(['BOTH', 'PHONE', 'EMAIL', 'NONE']).optional(),
  signupOpensAt: z.string().datetime().nullable().optional(),
  cancelDeadlineDays: z.number().int().min(0).max(365).nullable().optional(),
  attendanceMode: z.enum(ATTENDANCE_MODE_KEYS).optional(),
  checkinEarlyMinutes: z.number().int().min(0, 'Minuten dürfen nicht negativ sein').max(1440, 'Maximal 24 Stunden (1440 Min)').optional(),
  checkinLateMinutes: z.number().int().min(0, 'Minuten dürfen nicht negativ sein').max(1440, 'Maximal 24 Stunden (1440 Min)').optional(),
  cateringTokensEnabled: z.boolean().optional(),
  cateringTokenItems: z
    .array(z.string().trim().min(1, 'Gutschein-Titel darf nicht leer sein').max(60, 'Maximal 60 Zeichen'))
    .min(1, 'Mindestens ein Gutschein-Typ erforderlich')
    .max(10, 'Maximal 10 Gutschein-Typen')
    .optional(),
  cateringEarlyHours: z
    .number()
    .int()
    .min(-1, 'Ungültige Vorlaufzeit')
    .max(72, 'Maximal 72 Stunden Vorlaufzeit')
    .optional(),
  cateringStaffPin: StaffPinSchema,
  cateringRemindersEnabled: z.boolean().optional(),
  overlapToleranceMinutes: z.number().int().min(0).max(120).optional(),
  allowReplacement: z.boolean().optional(),
  replacementCutoffHours: ReplacementCutoffSchema.optional(),
  reminderNote: z.string().trim().max(1000, 'Hinweis darf maximal 1000 Zeichen lang sein').optional().nullable(),
  accessType: z.enum(EVENT_ACCESS_TYPE_KEYS).optional(),
  leadersOnly: z.boolean().optional(),
  requiredFields: RequiredFieldsSchema.optional(),
  allowedDepartmentIds: z.array(z.string().uuid()).max(100).optional(),
  allowedStufeIds: z.array(z.string().uuid()).max(100).optional(),
  questions: z.array(EventQuestionInputSchema).max(30).optional(),
});

export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

/** Anlass um ganze Tage verschieben: alle Schichten wandern mit (Zeitraum ergibt sich aus den Schichten) */
export const MoveEventSchema = z.object({
  days: z
    .number()
    .int()
    .min(-3650)
    .max(3650)
    .refine((d) => d !== 0, { message: 'Bitte ein anderes Datum wählen' }),
});

export type MoveEventInput = z.infer<typeof MoveEventSchema>;

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
  /** Erinnerungs-Mail vor eigenen Schichten */
  shiftReminders: z.boolean().optional(),
  /** Gewählte Vorlaufzeiten (Minuten) für E-Mail-Erinnerungen */
  emailReminderMinutes: z
    .array(
      z
        .number()
        .int()
        .refine((m) => (EMAIL_REMINDER_MINUTES as readonly number[]).includes(m), 'Ungültiger Zeitpunkt')
    )
    .max(15)
    .optional(),
  /** Browser-Push-Erinnerung vor eigenen Schichten */
  pushReminders: z.boolean().optional(),
  /** Gewählte Vorlaufzeiten (Minuten) für Browser-Push-Erinnerungen */
  pushReminderMinutes: z
    .array(
      z
        .number()
        .int()
        .refine((m) => (PUSH_REMINDER_MINUTES as readonly number[]).includes(m), 'Ungültiger Zeitpunkt')
    )
    .max(15)
    .optional(),
  /** Browser-Push bei «Ersatz gefunden» */
  pushNotifyReplacement: z.boolean().optional(),
  /** Browser-Push bei neuen Nachrichten vom OK */
  pushNotifyMessages: z.boolean().optional(),
  emailNotifyCateringTokens: z.boolean().optional(),
  pushNotifyCateringTokens: z.boolean().optional(),
  emailNotifyReplacement: z.boolean().optional(),
  emailNotifyMessages: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/** Web-Push-Subscription eines Geräts (Service Worker PushManager.subscribe) */
export const PushSubscribeSchema = z.object({
  endpoint: z.string().trim().url('Ungültige Push-Endpoint-URL').max(2000),
  keys: z.object({
    p256dh: z.string().trim().min(10).max(300),
    auth: z.string().trim().min(6).max(200),
  }),
});

export type PushSubscribeInput = z.infer<typeof PushSubscribeSchema>;

export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().url('Ungültige Push-Endpoint-URL').max(2000),
});

export type PushUnsubscribeInput = z.infer<typeof PushUnsubscribeSchema>;

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
  hitobitoGroupId: z.number().int().positive().max(2_147_483_647).optional().nullable(),
  ceviDbGroupId: z.number().int().positive().max(2_147_483_647).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export type StufeInput = z.infer<typeof StufeInputSchema>;

export const UpdateDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  logoUrl: ImageUrlSchema.optional().nullable(),
  primaryColor: HexColorSchema.optional().nullable(),
  secondaryColor: HexColorSchema.optional().nullable(),
  qrStyle: z.enum(['CORNERS', 'GRADIENT', 'SOLID']).optional().nullable(),
  qrCustomColors: z.boolean().optional(),
  qrColorPrimary: HexColorSchema.optional().nullable(),
  qrColorSecondary: HexColorSchema.optional().nullable(),
  contactUserId: z.string().uuid().optional().nullable(),
  membersOnly: z.boolean().optional(),
});

export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;

export const AddEventOrganizerSchema = z.object({
  userId: z.string().uuid().optional(),
  nickname: z.string().trim().max(60).optional(),
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
  requiredSlots: z.number().int().min(1, 'Mindestens 1 Platz nötig').max(500).default(1),
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  ageRequirementType: z.enum(['ALL', 'AT_LEAST_ONE']).default('ALL'),
});

export type CreateShiftTaskInput = z.infer<typeof CreateShiftTaskSchema>;

/** Schicht duplizieren: neuer Titel und neue Zeiten (alles optional, sonst wie das Original) */
export const DuplicateShiftSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
  })
  .default({});

export const CreateShiftSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().trim().max(120).nullish().transform((v) => v?.trim() || null).default(null),
  category: z.string().max(80).optional().nullable(),
  isSetupTeardown: z.boolean().optional().default(false),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  requiredSlots: z.number().int().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  tasks: z.array(CreateShiftTaskSchema).max(50).optional(),
  responsibleUserIds: z.array(z.string().uuid()).max(20).optional(),
});

export type CreateShiftInput = z.infer<typeof CreateShiftSchema>;

export const CreateShiftSeriesSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().trim().max(120).nullish().transform((v) => v?.trim() || null).default(null),
  category: z.string().max(80).optional().nullable(),
  isSetupTeardown: z.boolean().optional().default(false),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  durationMinutes: z.number().int().min(15, 'Dauer muss mindestens 15 Minuten sein').max(1440),
  overlapMinutes: z.number().int().min(0).max(120).optional().default(0),
  firstShiftIncludesOverlap: z.boolean().optional().default(false),
  description: z.string().max(2000).optional().nullable(),
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  tasks: z.array(CreateShiftTaskSchema).max(50).optional(),
  responsibleUserIds: z.array(z.string().uuid()).max(20).optional(),
});

export type CreateShiftSeriesInput = z.infer<typeof CreateShiftSeriesSchema>;

export const UpdateShiftSchema = z.object({
  title: z.string().trim().max(120).nullish().transform((v) => v?.trim() || null).optional(),
  category: z.string().max(80).optional().nullable(),
  isSetupTeardown: z.boolean().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  requiredSlots: z.number().int().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  tasks: z.array(CreateShiftTaskSchema).max(50).optional(),
  responsibleUserIds: z.array(z.string().uuid()).max(20).optional(),
});

export type UpdateShiftInput = z.infer<typeof UpdateShiftSchema>;

export const SetDayResponsiblesSchema = z.object({
  userIds: z.array(z.string().uuid()).max(20),
});

export type SetDayResponsiblesInput = z.infer<typeof SetDayResponsiblesSchema>;

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
  /** OK/Admin kann Zeitkollision nach Bestätigung der Warnung ignorieren */
  confirmCollision: z.boolean().optional(),
  /** Schicht übernehmen: diese Eintragung («Ersatz gesucht») wird durch die eigene ersetzt */
  replacesSignupId: z.string().uuid().optional(),
});

export type SignupShiftInput = z.infer<typeof SignupShiftSchema>;

/** «Ersatz gesucht» setzen: Grund freiwillig, sichtbar für alle, die Namen sehen */
/** Ersatz gesucht: Grund optional, auch ganz ohne Body */
export const ReplacementOfferSchema = z
  .object({
    note: z.string().trim().max(300).optional().nullable(),
  })
  .default({});

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
  /** Datum des Anlasses, bis es Schichten gibt; danach gilt erste bis letzte Schicht */
  startDate: z.string().datetime(),
  /** Veraltet, wird ignoriert: Das Ende ergibt sich aus den Schichten */
  endDate: z.string().datetime().optional(),
  ...EventAccessFields,
  allowPublicSignup: z.boolean().default(true),
  minShiftsPerPerson: z.number().int().min(1).max(100).nullable().optional(),
  contactUserId: z.string().uuid().optional().nullable(),
  dayCutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Uhrzeit muss im Format HH:MM angegeben werden (z. B. 04:00)').optional().default('04:00'),
  responsibleMode: z.enum(['BY_SHIFT', 'BY_DAY']).optional().default('BY_SHIFT'),
  contactVisibility: z.enum(['BOTH', 'PHONE', 'EMAIL', 'NONE']).optional().default('BOTH'),
  signupOpensAt: z.string().datetime().nullable().optional(),
  cancelDeadlineDays: z.number().int().min(0).max(365).nullable().optional(),
  attendanceMode: z.enum(ATTENDANCE_MODE_KEYS).optional(),
  checkinEarlyMinutes: z.number().int().min(0, 'Minuten dürfen nicht negativ sein').max(1440, 'Maximal 24 Stunden (1440 Min)').optional().default(30),
  checkinLateMinutes: z.number().int().min(0, 'Minuten dürfen nicht negativ sein').max(1440, 'Maximal 24 Stunden (1440 Min)').optional().default(30),
  cateringTokensEnabled: z.boolean().optional().default(false),
  cateringTokenItems: z
    .array(z.string().trim().min(1, 'Gutschein-Titel darf nicht leer sein').max(60, 'Maximal 60 Zeichen'))
    .min(1, 'Mindestens ein Gutschein-Typ erforderlich')
    .max(10, 'Maximal 10 Gutschein-Typen')
    .optional()
    .default(['1x Helfermenü', '1x Getränk']),
  cateringEarlyHours: z
    .number()
    .int()
    .min(-1, 'Ungültige Vorlaufzeit')
    .max(72, 'Maximal 72 Stunden Vorlaufzeit')
    .optional()
    .default(2),
  overlapToleranceMinutes: z.number().int().min(0).max(120).optional().default(15),
  allowReplacement: z.boolean().optional(),
  replacementCutoffHours: ReplacementCutoffSchema.optional(),
  reminderNote: z.string().trim().max(1000, 'Hinweis darf maximal 1000 Zeichen lang sein').optional().nullable(),
});

export type InstantiateTemplateInput = z.infer<typeof InstantiateTemplateSchema>;

export const UnregisterHelperSchema = z.object({
  userId: z.string().uuid().optional(),
  guestName: z.string().trim().max(80).optional(),
});

export const SetAttendanceSchema = z.object({
  /** null = zurück auf offen */
  status: z.enum(ATTENDANCE_STATUS_KEYS).nullable(),
});

export type SetAttendanceInput = z.infer<typeof SetAttendanceSchema>;

export const CheckinSchema = z.object({
  code: z.string().trim().min(10, 'Ungültiger oder fehlender Check-in-Code').max(100, 'Ungültiger Check-in-Code'),
});

export type CheckinInput = z.infer<typeof CheckinSchema>;

/** Token entwerten (durch Helfer via Swipe oder OK manuell) */
export const RedeemCateringTokenSchema = z.object({
  /** true = erzwungene Entwertung durch das OK auch ausserhalb des Kulanzfensters */
  force: z.boolean().optional(),
});

export type RedeemCateringTokenInput = z.infer<typeof RedeemCateringTokenSchema>;

/** Nachricht des OK an Helfende eines Anlasses (E-Mail an jede Person einzeln) */
export const SendEventMessageSchema = z
  .object({
    subject: z.string().trim().min(3, 'Betreff ist zu kurz').max(150, 'Betreff ist zu lang'),
    body: z.string().trim().min(1, 'Nachricht fehlt').max(5000, 'Nachricht ist zu lang (max. 5000 Zeichen)'),
    /** ALL = alle Eingetragenen, SHIFTS = Eingetragene bestimmter Schichten, PEOPLE = ausgewählte Personen, OK = das OK, OPEN = ohne Schicht / unter dem Soll */
    target: z.enum(['ALL', 'SHIFTS', 'PEOPLE', 'OK', 'OPEN']),
    shiftIds: z.array(z.string().uuid()).max(500).optional(),
    userIds: z.array(z.string().uuid()).max(1000).optional(),
    /** true = nur Empfänger zählen, nichts verschicken */
    dryRun: z.boolean().optional(),
  })
  .refine((m) => m.target !== 'SHIFTS' || (m.shiftIds?.length ?? 0) > 0, {
    message: 'Mindestens eine Schicht auswählen',
    path: ['shiftIds'],
  })
  .refine((m) => m.target !== 'PEOPLE' || (m.userIds?.length ?? 0) > 0, {
    message: 'Mindestens eine Person auswählen',
    path: ['userIds'],
  });

export type SendEventMessageInput = z.infer<typeof SendEventMessageSchema>;

/** Mehrere Schichten eines Anlasses auf einmal ändern */
export const BulkShiftsSchema = z.object({
  shiftIds: z.array(z.string().uuid()).min(1, 'Keine Schicht ausgewählt').max(500),
  action: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('DELETE'),
      notify: z.boolean().optional(),
    }),
    /**
     * Beginn und Ende verschieben (negativ = früher). Ganze Tage behalten die Uhrzeit in Schweizer Zeit,
     * die Minuten kommen danach dazu.
     */
    z
      .object({
        type: z.literal('MOVE'),
        days: z.number().int().min(-365).max(365).default(0),
        minutes: z.number().int().min(-1439).max(1439).default(0),
      })
      .refine((a) => a.days !== 0 || a.minutes !== 0, { message: 'Bitte eine Zeitspanne angeben' }),
    /** Plätze setzen, nur bei Schichten mit genau einer Arbeit */
    z.object({ type: z.literal('SET_SLOTS'), requiredSlots: z.number().int().min(1).max(500) }),
    z.object({ type: z.literal('SET_SETUP'), isSetupTeardown: z.boolean() }),
    z.object({ type: z.literal('SET_CATEGORY'), category: z.string().trim().max(80).nullable() }),
  ]),
});

export type BulkShiftsInput = z.infer<typeof BulkShiftsSchema>;

export type UnregisterHelperInput = z.infer<typeof UnregisterHelperSchema>;

export const EventDeregistrationSchema = z.object({
  userId: z.string().uuid('Ungültige Personen-ID'),
  reason: z.string().trim().max(200, 'Grund darf maximal 200 Zeichen lang sein').optional(),
});

export type EventDeregistrationInput = z.infer<typeof EventDeregistrationSchema>;


/** Einzelne Rechte in einer Abteilung; unbekannte Werte sind ein Fehler, Vorausgesetzte ergänzt das Backend */
export const DepartmentPermissionsSchema = z
  .array(z.enum(DEPARTMENT_PERMISSION_KEYS as [DepartmentPermission, ...DepartmentPermission[]]))
  .max(DEPARTMENT_PERMISSION_KEYS.length * 2);

/** Person bearbeiten (Abteilungsleitung oder «Personen und Rechte verwalten»): Stufen und Rechte */
export const UpdateDepartmentPersonSchema = z.object({
  role: z.enum(['ADMIN', 'HELPER']).optional(),
  stufen: z
    .array(z.object({ stufeId: z.string().uuid(), role: z.enum(['LEITUNG', 'TEILNEHMER']) }))
    .max(20)
    .optional(),
  permissions: DepartmentPermissionsSchema.optional(),
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

/** «Passwort vergessen»: Link an diese E-Mail schicken */
export const RequestPasswordResetSchema = z.object({
  email: z.string().trim().email('Ungültige E-Mail-Adresse').max(254),
});

export type RequestPasswordResetInput = z.infer<typeof RequestPasswordResetSchema>;

/** Neues Passwort mit dem Token aus der E-Mail setzen */
export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z
    .string()
    .min(8, 'Passwort muss mindestens 8 Zeichen lang sein')
    .max(200, 'Passwort darf höchstens 200 Zeichen lang sein'),
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

/** Eigenes Passwort im Profil setzen oder ändern */
export const SetProfilePasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z
    .string()
    .min(8, 'Passwort muss mindestens 8 Zeichen lang sein')
    .max(200, 'Passwort darf höchstens 200 Zeichen lang sein'),
});

export type SetProfilePasswordInput = z.infer<typeof SetProfilePasswordSchema>;

// ---------------------------------------------------------------------------
// Admin-Portal (nur globale Admins)
// ---------------------------------------------------------------------------

const CeviDbGroupIdSchema = z.number().int().positive().max(2_147_483_647);

/** Abteilung durch globale Admins anlegen (ohne Cevi.DB-Prüfung), optional mit erster Abteilungsleitung */
export const AdminCreateDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Name muss mindestens 2 Zeichen lang sein').max(80),
  slug: DepartmentSlugSchema,
  organization: z.enum(['CEVI', 'PFADI', 'JUBLA', 'OTHER']).default('CEVI').optional(),
  hitobitoGroupId: CeviDbGroupIdSchema.optional().nullable(),
  ceviDbGroupId: CeviDbGroupIdSchema.optional().nullable(),
  membersOnly: z.boolean().default(true),
  leaderUserId: z.string().uuid().optional().nullable(),
});

export type AdminCreateDepartmentInput = z.infer<typeof AdminCreateDepartmentSchema>;

export const AdminUpdateDepartmentSchema = UpdateDepartmentSchema.extend({
  slug: DepartmentSlugSchema.optional(),
  organization: z.enum(['CEVI', 'PFADI', 'JUBLA', 'OTHER']).optional(),
  hitobitoGroupId: CeviDbGroupIdSchema.optional().nullable(),
  ceviDbGroupId: CeviDbGroupIdSchema.optional().nullable(),
});

export type AdminUpdateDepartmentInput = z.infer<typeof AdminUpdateDepartmentSchema>;

/** Löschen nur mit der Subdomain bzw. dem Anlass-Kürzel als Bestätigung (Admin-Portal und Abteilungsleitung) */
export const ConfirmDeleteSchema = z.object({
  confirm: z.string().trim().min(1, 'Bestätigung fehlt').max(100),
});

/** Admin-Portal: Abteilungsleitung (ADMIN) oder Rechte setzen (HELPER) */
export const AdminSetMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'HELPER']),
  permissions: DepartmentPermissionsSchema.optional(),
});

export const AdminUpdateUserSchema = z.object({
  isGlobalAdmin: z.boolean().optional(),
  homeDepartmentId: z.string().uuid().nullable().optional(),
});

export const AdminBatchDeleteUsersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1, 'Mindestens eine Person muss ausgewählt sein').max(200),
});
export type AdminBatchDeleteUsersInput = z.infer<typeof AdminBatchDeleteUsersSchema>;

export const AdminMergeUserSchema = z.object({
  targetUserId: z.string().uuid('Ungültige Ziel-Personen-ID'),
});

export const AdminUpdateEventSchema = z.object({
  isPublished: z.boolean().optional(),
  allowPublicSignup: z.boolean().optional(),
});

export const CreateCateringBatchSchema = z.object({
  title: z.string().trim().max(100).optional(),
  mode: z.enum(['COMBI', 'SINGLE']).default('COMBI'),
  cardCount: z.number().int().min(1, 'Mindestens 1 Karte erforderlich').max(1000, 'Maximal 1000 Karten pro Tranche'),
});
export type CreateCateringBatchInput = z.infer<typeof CreateCateringBatchSchema>;

export const RedeemPhysicalTokenSchema = z.object({
  code: z.string().trim().min(1, 'Code erforderlich'),
  tokenId: z.string().uuid().optional(),
  redeemAll: z.boolean().optional(),
  staffPin: z.string().trim().optional(),
});
export type RedeemPhysicalTokenInput = z.infer<typeof RedeemPhysicalTokenSchema>;
