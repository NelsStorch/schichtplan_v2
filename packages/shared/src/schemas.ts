import { z } from 'zod';
import { RESERVED_SUBDOMAINS, SUBDOMAIN_REGEX, SIGNUP_MODES } from './constants.js';

const DepartmentSlugSchema = z
  .string()
  .min(3, 'Subdomain muss mindestens 3 Zeichen lang sein')
  .max(30, 'Subdomain darf maximal 30 Zeichen lang sein')
  .regex(SUBDOMAIN_REGEX, 'Nur Kleinbuchstaben, Zahlen und Bindestriche erlaubt')
  .refine((val: string) => !RESERVED_SUBDOMAINS.includes(val as any), {
    message: 'Diese Subdomain ist reserviert und kann nicht verwendet werden',
  });

export const RegisterDepartmentSchema = z.object({
  departmentName: z.string().min(2, 'Name muss mindestens 2 Zeichen lang sein'),
  slug: DepartmentSlugSchema,
  adminFirstName: z.string().min(2, 'Vorname ist erforderlich'),
  adminLastName: z.string().min(2, 'Nachname ist erforderlich'),
  adminCeviName: z.string().optional(),
  adminEmail: z.string().email('Ungültige E-Mail-Adresse'),
  adminPassword: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
  adminPhone: z.string().optional(),
});

export type RegisterDepartmentInput = z.infer<typeof RegisterDepartmentSchema>;

/** Abteilung anlegen als angemeldete Abteilungsleitung (Cevi.DB): ohne Passwort, Admin ist die angemeldete Person. */
export const CreateDepartmentFromCeviDbSchema = z.object({
  departmentName: z.string().trim().min(2, 'Name muss mindestens 2 Zeichen lang sein').max(80),
  slug: DepartmentSlugSchema,
});

export type CreateDepartmentFromCeviDbInput = z.infer<typeof CreateDepartmentFromCeviDbSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(1, 'Passwort ist erforderlich'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterHelperSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
  firstName: z.string().min(2, 'Vorname erforderlich'),
  lastName: z.string().min(2, 'Nachname erforderlich'),
  ceviName: z.string().optional(),
  phone: z.string().optional(),
});

export type RegisterHelperInput = z.infer<typeof RegisterHelperSchema>;

export const CeviNameQuickLoginSchema = z.object({
  ceviName: z.string().min(2, 'Cevi-Name muss mindestens 2 Zeichen lang sein'),
  firstName: z.string().min(2, 'Vorname ist erforderlich').optional(),
  lastName: z.string().min(2, 'Nachname ist erforderlich').optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geburtsdatum im Format JJJJ-MM-TT (z.B. 2005-08-14)').optional(),
  phone: z.string().optional(),
  departmentSlug: z.string().optional(),
  returnTo: z.string().optional(),
});

export type CeviNameQuickLoginInput = z.infer<typeof CeviNameQuickLoginSchema>;

export const CreateEventOrganizerItemSchema = z.object({
  userId: z.string().uuid().optional(),
  ceviName: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(['OK_LEAD', 'OK_MEMBER']).default('OK_MEMBER'),
  roleTitle: z.string().optional().nullable(),
});

export type CreateEventOrganizerItemInput = z.infer<typeof CreateEventOrganizerItemSchema>;

export const CreateEventSchema = z.object({
  title: z.string().min(2, 'Titel ist erforderlich'),
  slug: z
    .string()
    .min(2, 'Slug erforderlich')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten'),
  description: z.string().optional(),
  logoUrl: z.string().optional().nullable(),
  bannerUrl: z.string().optional().nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  signupMode: z.enum(['NAME_ONLY', 'OPEN', 'LOGIN_REQUIRED', 'CEVIDB_ONLY']).default('OPEN'),
  requireEmailForGuests: z.boolean().default(false),
  requirePhoneForGuests: z.boolean().default(false),
  allowPublicSignup: z.boolean().default(true),
  organizers: z.array(CreateEventOrganizerItemSchema).optional(),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;

export const UpdateDepartmentSchema = z.object({
  name: z.string().min(2).optional(),
  logoUrl: z.string().optional().nullable(),
  primaryColor: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
});

export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;

export const AddEventOrganizerSchema = z.object({
  userId: z.string().uuid().optional(),
  ceviName: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(['OK_LEAD', 'OK_MEMBER']).default('OK_MEMBER'),
  roleTitle: z.string().optional(),
});

export type AddEventOrganizerInput = z.infer<typeof AddEventOrganizerSchema>;

export const CreateShiftTaskSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2, 'Titel der Arbeit erforderlich'),
  description: z.string().optional().nullable(),
  requiredSlots: z.number().int().min(1, 'Mindestens 1 Helfer benötigt').default(1),
  minAge: z.number().int().min(0).optional().nullable(),
  ageRequirementType: z.enum(['ALL', 'AT_LEAST_ONE']).default('ALL'),
});

export type CreateShiftTaskInput = z.infer<typeof CreateShiftTaskSchema>;

export const CreateShiftSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().min(2, 'Titel erforderlich'),
  category: z.string().min(2, 'Kategorie erforderlich'),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  requiredSlots: z.number().int().min(1).optional(),
  description: z.string().optional().nullable(),
  minAge: z.number().int().min(0).optional().nullable(),
  tasks: z.array(CreateShiftTaskSchema).optional(),
});

export type CreateShiftInput = z.infer<typeof CreateShiftSchema>;

export const UpdateShiftSchema = z.object({
  title: z.string().min(2).optional(),
  category: z.string().min(2).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  requiredSlots: z.number().int().min(1).optional(),
  description: z.string().optional().nullable(),
  minAge: z.number().int().min(0).optional().nullable(),
  tasks: z.array(CreateShiftTaskSchema).optional(),
});

export type UpdateShiftInput = z.infer<typeof UpdateShiftSchema>;

export const SignupShiftSchema = z.object({
  shiftId: z.string().uuid(),
  taskId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(), // Ermöglicht dem OK, ein Abteilungsmitglied einzuteilen
  guestName: z.string().min(2, 'Bitte Cevi-Name oder Vorname angeben').optional().nullable(),
  guestEmail: z.string().email('Ungültige E-Mail').optional().or(z.literal('')).nullable(),
  guestPhone: z.string().optional().nullable(),
});

export type SignupShiftInput = z.infer<typeof SignupShiftSchema>;

export const SaveAsTemplateSchema = z.object({
  title: z.string().min(2, 'Name der Vorlage erforderlich'),
  description: z.string().optional().nullable(),
});

export type SaveAsTemplateInput = z.infer<typeof SaveAsTemplateSchema>;

export const InstantiateTemplateSchema = z.object({
  title: z.string().min(2, 'Titel ist erforderlich'),
  slug: z
    .string()
    .min(2, 'Slug erforderlich')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten'),
  description: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  bannerUrl: z.string().optional().nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  signupMode: z.enum(['NAME_ONLY', 'OPEN', 'LOGIN_REQUIRED', 'CEVIDB_ONLY']).default('OPEN'),
  requireEmailForGuests: z.boolean().default(false),
  requirePhoneForGuests: z.boolean().default(false),
  allowPublicSignup: z.boolean().default(true),
});

export type InstantiateTemplateInput = z.infer<typeof InstantiateTemplateSchema>;

export const UnregisterHelperSchema = z.object({
  userId: z.string().uuid().optional(),
  guestName: z.string().optional(),
});

export type UnregisterHelperInput = z.infer<typeof UnregisterHelperSchema>;

