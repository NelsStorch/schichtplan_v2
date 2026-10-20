import type {
  AttendanceMode,
  AttendanceStatus,
  EventAccessType,
  EventQuestionScope,
  EventQuestionType,
  RequiredProfileField,
  StufeRole,
  UserRole,
} from './constants.js';

export interface DepartmentDto {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  contactEmail?: string | null;
  /** Cevi.DB-Ortsgruppe; ohne sie funktionieren die Cevi.DB-Zugangstypen nicht */
  ceviDbGroupId?: number | null;
  /** Startseite nur für Mitglieder (öffentliche Anlässe bleiben per Link erreichbar) */
  membersOnly?: boolean;
  /** Angemeldete Person gehört dazu (Heimabteilung, Rolle, OK) und sieht die Startseite */
  viewerIsMember?: boolean;
  createdAt: string;
}

export interface EventOrganizerDto {
  id: string;
  eventId: string;
  userId: string;
  userFirstName: string;
  userLastName: string;
  userCeviName?: string | null;
  displayName: string;
  role: string;
  roleTitle?: string | null;
  createdAt: string;
}

export type EventResponsibleMode = 'BY_SHIFT' | 'BY_DAY';
export type EventContactVisibility = 'BOTH' | 'PHONE' | 'EMAIL' | 'NONE';

export interface ResponsiblePersonDto {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  ceviName?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface EventDto {
  id: string;
  departmentId: string;
  title: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  startDate: string;
  endDate: string;
  isPublished: boolean;
  accessType: EventAccessType;
  leadersOnly: boolean;
  requiredFields: RequiredProfileField[];
  allowPublicSignup: boolean;
  minShiftsPerPerson?: number | null;
  contactUserId?: string | null;
  contactUser?: ResponsiblePersonDto | null;
  dayCutoffTime?: string;
  responsibleMode?: EventResponsibleMode;
  contactVisibility?: EventContactVisibility;
  signupOpensAt?: string | null;
  attendanceMode?: AttendanceMode;
  /** Nur für das OK: geheimer Code im QR-Link für den Selbst-Check-in */
  checkinToken?: string | null;
  dayResponsibles?: Record<string, ResponsiblePersonDto[]>;
  cancelDeadlineDays?: number | null;
  createdAt: string;
  shiftCount?: number;
  /** Summe der benötigten bzw. besetzten Plätze über alle Schichten */
  totalSlots?: number;
  filledSlots?: number;
  organizers?: EventOrganizerDto[];
}

export type AgeRequirementType = 'ALL' | 'AT_LEAST_ONE';

export interface TaskDefinitionDto {
  id: string;
  departmentId: string;
  title: string;
  description?: string | null;
  minAge?: number | null;
  ageRequirementType: AgeRequirementType;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShiftTaskDto {
  id: string;
  shiftId: string;
  taskDefinitionId?: string | null;
  title: string;
  description?: string | null;
  requiredSlots: number;
  freeSlots?: number;
  minAge?: number | null;
  ageRequirementType: AgeRequirementType;
  signups?: ShiftSignupDto[];
}

export interface ShiftDto {
  id: string;
  eventId: string;
  title: string;
  category?: string | null;
  isSetupTeardown?: boolean;
  startTime: string;
  endTime: string;
  requiredSlots: number;
  description?: string | null;
  minAge?: number | null;
  tasks?: ShiftTaskDto[];
  signups?: ShiftSignupDto[];
  responsibles?: ResponsiblePersonDto[];
  freeSlots?: number;
}

export interface ShiftTimeCollision {
  signupId: string;
  shiftId: string;
  shiftTitle: string;
  taskTitle?: string | null;
  startTime: string;
  endTime: string;
  sameShift: boolean;
}

export interface ShiftCollisionCheckResult {
  hasCollision: boolean;
  conflicts: ShiftTimeCollision[];
  message?: string;
}

export interface ShiftSignupDto {
  id: string;
  shiftId: string;
  taskId?: string | null;
  taskTitle?: string | null;
  userId?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  displayName: string;
  userFirstName?: string | null;
  userLastName?: string | null;
  userCeviName?: string | null;
  userBirthDate?: string | null;
  userAge?: number | null;
  createdAt: string;
  isConfirmed: boolean;
  /** Nur für das OK: Anwesenheit (null = offen) */
  attendance?: AttendanceStatus | null;
  attendanceAt?: string | null;
  attendanceSource?: 'OK' | 'QR' | null;
  attendanceByName?: string | null;
}

export interface ShiftTaskTemplateItem {
  title: string;
  description?: string | null;
  requiredSlots: number;
  minAge?: number | null;
  ageRequirementType: AgeRequirementType;
}

export interface ShiftTemplateItem {
  title: string;
  category?: string | null;
  isSetupTeardown?: boolean;
  description?: string | null;
  minAge?: number | null;
  dayOffset: number;
  startTimeStr: string;
  endTimeStr: string;
  tasks: ShiftTaskTemplateItem[];
}

export interface EventTemplateData {
  shifts: ShiftTemplateItem[];
  questions?: Omit<EventQuestionDto, 'id'>[];
  allowedDepartmentIds?: string[];
  allowedStufeIds?: string[];
  attendanceMode?: AttendanceMode;
}

export interface EventTemplateDto {
  id: string;
  departmentId: string;
  title: string;
  description?: string | null;
  accessType: EventAccessType;
  leadersOnly: boolean;
  requiredFields: RequiredProfileField[];
  minShiftsPerPerson?: number | null;
  cancelDeadlineDays?: number | null;
  shiftCount: number;
  data: EventTemplateData;
  createdAt: string;
  updatedAt: string;
}

export interface UserDto {
  id: string;
  email?: string | null;
  firstName: string;
  lastName: string;
  ceviName?: string | null;
  phone?: string | null;
  address?: string | null;
  birthDate?: string | null;
  isGlobalAdmin: boolean;
  departmentRole?: UserRole | null;
  ceviDbId?: number | null;
  ceviDbSyncedAt?: string | null;
  hasCeviDb?: boolean;
  /** Konto hat ein Passwort (E-Mail/Passwort-Login) */
  hasPassword?: boolean;
  /** E-Mail-Adresse wurde bestätigt */
  emailVerified?: boolean;
  /** Darf das Konto selbst löschen (Cevi.DB- oder Passwort-Account) */
  canSelfDelete?: boolean;
  homeDepartment?: HomeDepartmentDto | null;
  /** Abteilung kommt aus Cevi.DB und ist dort festgelegt */
  homeDepartmentFromCeviDb?: boolean;
  stufen?: UserStufeDto[];
  /** Hat die Abteilung noch nicht angegeben (auch nicht «keine») */
  needsDepartmentSetup?: boolean;
  /** Nur Cevi-Name-Profil (ohne Cevi.DB und Passwort) */
  isCeviNameProfile?: boolean;
  /** Möchte eine Erinnerungs-Mail vor den eigenen Schichten */
  shiftReminders?: boolean;
}

// ---------------------------------------------------------------------------
// Abteilung & Stufen einer Person
// ---------------------------------------------------------------------------

export interface HomeDepartmentDto {
  id: string;
  name: string;
  slug: string;
}

export interface DepartmentStufeDto {
  id: string;
  departmentId: string;
  name: string;
  ceviDbGroupId: number | null;
  sortOrder: number;
}

export interface UserStufeDto {
  stufeId: string;
  name: string;
  departmentId: string;
  role: StufeRole;
  /** CEVIDB = aus Cevi.DB abgeglichen (nicht selbst änderbar) */
  source: 'SELF' | 'CEVIDB';
}

/** Abteilungsverzeichnis für die Auswahl im Login (öffentlich) */
export interface DepartmentDirectoryItemDto {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  stufen: { id: string; name: string }[];
}

/** Vorschlag für eine Stufe: Cevi.DB-Gruppe, die bei Mitgliedern der Abteilung vorkommt */
export interface StufeSuggestionDto {
  ceviDbGroupId: number;
  name: string;
  personCount: number;
}

/** Person, die eine Abteilung als Heimabteilung angegeben hat (Sicht der Abteilungsleitung) */
export interface DepartmentPersonDto {
  userId: string;
  displayName: string;
  ceviName: string | null;
  firstName: string;
  lastName: string;
  /** Heimabteilung ist diese Abteilung (sonst nur wegen einer Rolle in der Liste) */
  isHomeDepartment: boolean;
  source: 'SELF' | 'CEVIDB' | null;
  /** Rolle im Schichtplan dieser Abteilung */
  departmentRole: 'ADMIN' | 'PLANNER' | 'HELPER' | null;
  /** Hat in Cevi.DB eine Abteilungsleitungs-Rolle (CEVIDB_DEPARTMENT_LEADER_ROLES) */
  isCeviDbDepartmentLeader: boolean;
  /** Nur Cevi-Name-Profil (ohne Cevi.DB und Passwort): kann keine Rollen bekommen */
  isCeviNameProfile: boolean;
  stufen: { stufeId: string; name: string; role: StufeRole; source: 'SELF' | 'CEVIDB' }[];
}

/** Antwort von POST /api/auth/ceviname-login, wenn es nicht direkt klappt */
export type CeviNameLoginErrorCode =
  /** Kein Profil mit diesem Cevi-Namen und Geburtsdatum in der Abteilung: Registrierung anbieten */
  | 'NOT_FOUND'
  /** Es gibt ein Konto, aber es ist mit Cevi.DB bzw. Passwort geschützt oder hat Rechte */
  | 'USE_CEVIDB'
  | 'USE_PASSWORD'
  /** Profil existiert schon (bei der Registrierung) */
  | 'EXISTS'
  | 'RATE_LIMITED';

// ---------------------------------------------------------------------------
// Zugang zu Anlässen
// ---------------------------------------------------------------------------

/** Warum sich jemand nicht eintragen kann */
export type EventAccessReason =
  | 'LOGIN_REQUIRED'
  | 'CEVIDB_REQUIRED'
  | 'NO_DEPARTMENT'
  | 'WRONG_DEPARTMENT'
  | 'WRONG_STUFE'
  | 'LEADERS_ONLY'
  | 'SIGNUP_CLOSED'
  | 'SIGNUP_NOT_YET_OPEN';

export interface EventAccessDto {
  canSignup: boolean;
  /** MANAGER = Abteilungsleitung/OK, RULES = erfüllt die Regeln, LINK = über Zugangs-Link */
  via: 'MANAGER' | 'RULES' | 'LINK' | null;
  reason: EventAccessReason | null;
  message: string | null;
  /** Namen der Helfer*innen sichtbar */
  canSeeNames: boolean;
  /** Kontaktangaben und Antworten sichtbar (nur Abteilungsleitung / OK) */
  isManager: boolean;
}

export interface EventQuestionDto {
  id: string;
  label: string;
  type: EventQuestionType;
  options: string[];
  required: boolean;
  /** ONCE = einmal pro Anlass, PER_SIGNUP = bei jeder Eintragung (Antwort pro Schicht) */
  scope: EventQuestionScope;
}

/** Was der angemeldeten Person beim Anlass noch fehlt bzw. was sie angegeben hat */
export interface EventViewerDto {
  access: EventAccessDto;
  missingFields: RequiredProfileField[];
  /** Pflichtfragen ohne Antwort */
  missingQuestionIds: string[];
  answers: Record<string, string>;
}

export interface EventAccessLinkDto {
  id: string;
  label: string;
  kind: 'PERSONAL' | 'GROUP';
  token: string;
  expiresAt: string | null;
  createdAt: string;
  isExpired: boolean;
  /** Personen, die den Link eingelöst haben */
  redeemedBy: { userId: string; displayName: string; redeemedAt: string }[];
}

/** Angaben einer eingetragenen Person für das OK */
export interface EventParticipantDto {
  userId: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  birthDate: string | null;
  homeDepartmentName: string | null;
  viaLink: boolean;
  shiftCount: number;
  /** Antworten auf Fragen mit scope ONCE */
  answers: Record<string, string>;
  /** Antworten auf Fragen mit scope PER_SIGNUP, pro Eintragung */
  signupAnswers: { shiftTitle: string; startTime: string; answers: Record<string, string> }[];
}

export interface EventRosterShiftDto {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  taskTitle?: string | null;
}

export interface EventRosterStufeDto {
  id: string;
  name: string;
  role: string;
}

export interface EventRosterItemDto {
  userId: string;
  ceviName: string | null;
  firstName: string;
  lastName: string;
  displayName: string;
  birthDate: string | null;
  age: number | null;
  departmentId: string | null;
  departmentName: string | null;
  stufen: EventRosterStufeDto[];
  shiftCount: number;
  shifts: EventRosterShiftDto[];
  /** Erfüllt die Zugangsregeln des Anlasses (nur mit `?alle=1` auch false) */
  hasAccess: boolean;
  isDeregistered: boolean;
  deregistrationReason: string | null;
  deregisteredAt: string | null;
}

export interface EventRosterResponseDto {
  minShiftsPerPerson: number | null;
  isRestricted: boolean;
  multipleDepartments: boolean;
  scopeDescription: string;
  items: EventRosterItemDto[];
}

export interface CeviDbRoleDto {
  group_id: number;
  group_name: string;
  role_name: string;
  role_class?: string;
  role?: string;
  permissions?: string[];
}

export interface CeviDbProfileDto {
  id: number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  nickname?: string | null;
  company_name?: string | null;
  company?: boolean;
  address?: string | null;
  zip_code?: string | null;
  town?: string | null;
  country?: string | null;
  gender?: string | null;
  birthday?: string | null;
  primary_group_id?: number | null;
  language?: string | null;
  locale?: string | null;
  roles?: CeviDbRoleDto[];
  _userInfo?: Record<string, unknown>;
  _meta?: {
    fetchedAt?: string;
    grantedScopes?: string;
    tokenType?: string;
    expiresIn?: number;
  };
  [key: string]: unknown;
}

export interface CeviDbDebugResponseDto {
  user: UserDto;
  hasCeviDb: boolean;
  ceviDbData: CeviDbProfileDto | null;
}

export interface CeviDbUserSummaryDto {
  id: string;
  firstName: string;
  lastName: string;
  ceviName: string | null;
  email: string | null;
  ceviDbId: number | null;
  isGlobalAdmin: boolean;
  ceviDbSyncedAt: string | null;
}

export interface QuickLoginDto {
  ceviName: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  phone?: string;
  departmentSlug?: string;
}

export interface AuthResponseDto {
  user: UserDto;
  token?: string;
  redirectUrl?: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
  database: boolean;
}

// ---------------------------------------------------------------------------
// Admin-Portal (admin.<domain>), nur für globale Admins
// ---------------------------------------------------------------------------

/** Womit sich eine Person bisher anmelden kann (abgeleitet aus den gespeicherten Daten). */
export type LoginMethod = 'CEVIDB' | 'PASSWORD' | 'CEVINAME';

export interface AdminUserMembershipDto {
  departmentId: string;
  departmentName: string;
  departmentSlug: string;
  role: string;
}

export interface AdminUserListItemDto {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  ceviName: string | null;
  phone: string | null;
  birthDate: string | null;
  isGlobalAdmin: boolean;
  ceviDbId: number | null;
  loginMethods: LoginMethod[];
  signupCount: number;
  memberships: AdminUserMembershipDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserListDto {
  items: AdminUserListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AdminUserOrganizerDto {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  departmentName: string;
  departmentSlug: string;
  role: string;
  roleTitle: string | null;
}

export interface AdminUserSignupDto {
  id: string;
  shiftTitle: string;
  shiftCategory?: string | null;
  startTime: string;
  endTime: string;
  eventTitle: string;
  eventSlug: string;
  departmentName: string;
  departmentSlug: string;
  isConfirmed: boolean;
  createdAt: string;
}

/** Stufe einer Person, abgeleitet aus ihren Cevi.DB-Rollen (z. B. «Hiskia» als Stufenleiter*in) */
export interface CeviDbStufeDto {
  groupId: number;
  groupName: string;
  /** Stärkste Rolle in der Stufe: Leitung, Teilnehmer*in oder andere Rolle */
  kind: 'LEITUNG' | 'TEILNEHMER' | 'ANDERE';
  /** Bezeichnungen der Rollen in dieser Stufe (z. B. «Stufenleiter/-in») */
  roleNames: string[];
  /** Haupt-Stufe der Person (`primary_group_id`) */
  isPrimary: boolean;
}

export interface AdminUserDetailDto extends AdminUserListItemDto {
  /** Stufen laut Cevi.DB (leer ohne Cevi.DB-Login) */
  stufen: CeviDbStufeDto[];
  organizedEvents: AdminUserOrganizerDto[];
  /** Die neusten Eintragungen (maximal 50) */
  signups: AdminUserSignupDto[];
}

export interface AdminOverviewDto {
  users: number;
  cevidbUsers: number;
  passwordUsers: number;
  /** Personen ohne Passwort und ohne Cevi.DB (Cevi-Name-Schnelllogin) */
  guestUsers: number;
  globalAdmins: number;
  newUsers7d: number;
  departments: number;
  events: number;
  signups: number;
}

/** Darf die angemeldete Person eine Abteilung (Subdomain) für ihre Ortsgruppe anlegen? */
export interface DepartmentCreationEligibilityDto {
  eligible: boolean;
  /**
   * Warum nicht: NOT_CEVIDB (nicht mit Cevi.DB angemeldet), NOT_LEADER (keine Abteilungsleitung),
   * NO_ORTSGRUPPE (Cevi.DB liefert keine Ortsgruppe), EXISTS (Ortsgruppe hat schon eine Abteilung)
   */
  reason: 'NOT_CEVIDB' | 'NOT_LEADER' | 'NO_ORTSGRUPPE' | 'EXISTS' | null;
  ortsgruppeId: number | null;
  /** Name der Ortsgruppe laut Cevi.DB (z. B. "Illnau-Effretikon"), Vorschlag für den Namen */
  ortsgruppeName: string | null;
  /** Name der Cevi.DB-Gruppe, in der die Person Abteilungsleitung ist (z. B. "JS Illnau") */
  leaderGroupName: string | null;
  existingDepartment: { name: string; slug: string } | null;
}

/** Eintrag im Protokoll von Schicht-Eintragungen und -Austragungen */
export interface ShiftSignupLogDto {
  id: string;
  eventId: string;
  shiftId: string | null;
  action: ShiftSignupLogAction;
  helperUserId: string | null;
  helperName: string;
  performedByUserId: string | null;
  performedByName: string | null;
  shiftTitle: string;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  taskTitle: string | null;
  /** Bei ATTENDANCE: neuer Status (null = zurück auf offen) */
  attendance?: AttendanceStatus | null;
  createdAt: string;
}

export type ShiftSignupLogAction = 'SIGNUP' | 'SIGNOFF' | 'ATTENDANCE';

/** Ergebnis des Selbst-Check-ins per QR-Code */
export interface CheckinResultDto {
  eventTitle: string;
  /** Eben (oder schon vorher) als anwesend markierte Schichten */
  checkedIn: Array<{ signupId: string; shiftTitle: string; taskTitle: string | null; startTime: string; endTime: string; alreadyPresent: boolean }>;
  /** Nächste eigene Schicht, falls gerade keine im Check-in-Fenster liegt */
  nextShift: { shiftTitle: string; startTime: string; endTime: string } | null;
}

export type EventMessageTarget = 'ALL' | 'SHIFTS' | 'PEOPLE' | 'OK';

/** Verlauf: vom OK verschickte Nachricht */
export interface EventMessageDto {
  id: string;
  sentByName: string;
  subject: string;
  body: string;
  target: EventMessageTarget;
  targetLabel: string;
  recipientCount: number;
  failedCount: number;
  createdAt: string;
}

/** Antwort von POST /api/events/:slug/messages (bei dryRun ohne Versand) */
export interface EventMessageResultDto {
  recipientCount: number;
  /** Personen ohne verwendbare E-Mail (bekommen nichts) */
  withoutEmail: string[];
  sent: number;
  failed: number;
  message?: EventMessageDto;
}

/** Antwort von POST /api/events/:slug/shifts/bulk */
export interface BulkShiftsResultDto {
  updated: number;
  /** Schichten, die nicht geändert wurden, mit Grund */
  skipped: { id: string; title: string; reason: string }[];
}
