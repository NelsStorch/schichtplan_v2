import { z } from 'zod';
import { RESERVED_SUBDOMAINS, SUBDOMAIN_REGEX, ROLES } from './constants.js';

export const RegisterDepartmentSchema = z.object({
  departmentName: z.string().min(2, 'Name muss mindestens 2 Zeichen lang sein'),
  slug: z
    .string()
    .min(3, 'Subdomain muss mindestens 3 Zeichen lang sein')
    .max(30, 'Subdomain darf maximal 30 Zeichen lang sein')
    .regex(SUBDOMAIN_REGEX, 'Nur Kleinbuchstaben, Zahlen und Bindestriche erlaubt')
    .refine((val) => !RESERVED_SUBDOMAINS.includes(val as any), {
      message: 'Diese Subdomain ist reserviert und kann nicht verwendet werden',
    }),
  adminFirstName: z.string().min(2, 'Vorname ist erforderlich'),
  adminLastName: z.string().min(2, 'Nachname ist erforderlich'),
  adminCeviName: z.string().optional(),
  adminEmail: z.string().email('Ungültige E-Mail-Adresse'),
  adminPassword: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
  adminPhone: z.string().optional(),
});

export type RegisterDepartmentInput = z.infer<typeof RegisterDepartmentSchema>;

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

export const CreateEventSchema = z.object({
  title: z.string().min(2, 'Titel ist erforderlich'),
  slug: z
    .string()
    .min(2, 'Slug erforderlich')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten'),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  allowPublicSignup: z.boolean().default(true),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;

export const CreateShiftSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().min(2, 'Titel erforderlich'),
  category: z.string().min(2, 'Kategorie erforderlich'),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  requiredSlots: z.number().int().min(1, 'Mindestens 1 Helfer benötigt'),
  description: z.string().optional(),
  minAge: z.number().int().min(0).optional().nullable(),
});

export type CreateShiftInput = z.infer<typeof CreateShiftSchema>;

export const SignupShiftSchema = z.object({
  shiftId: z.string().uuid(),
});

export type SignupShiftInput = z.infer<typeof SignupShiftSchema>;
