import type {
  AttendanceMode,
  AttendanceStatus,
  DepartmentPermission,
  EventCapability,
  EventAccessType,
  EventQuestionScope,
  EventQuestionType,
  QuestionRetentionDays,
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
  /** Kontaktperson (Abteilungsleitung oder mit «Personen und Rechte verwalten») */
  contactUserId?: string | null;
  /** Name immer, E-Mail nur für angemeldete Personen */
  contactPerson?: { displayName: string; email: string | null } | null;
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
  userLastName: string | null;
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
  lastName: string | null;
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
  overlapToleranceMinutes?: number;
  /** «Ersatz gesucht» erlaubt */
  allowReplacement?: boolean;
  /** «Ersatz gesucht» bis so viele Stunden vor Schichtbeginn (0 = bis Schichtbeginn) */
  replacementCutoffHours?: number;
  /** Optionaler Hinweis vom OK für die automatische Schicht-Erinnerung (z. B. Treffpunkt, Kleidung) */
  reminderNote?: string | null;
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
  title: string | null;
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
  shiftTitle: string | null;
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

/** Kompakte Zusammenfassung des persönlichen Helfer-Stunden-Kontos für GET /api/shifts/my/summary */
export interface MyHoursSummaryDto {
  totalHours: number;
  completedHours: number;
  upcomingHours: number;
  shiftCount: number;
  leadCount: number;
  eventCount: number;
  departmentCount: number;
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
  /** «Ersatz gesucht» seit (null = nicht angeboten). Sichtbar für alle, auch ohne Namen. */
  replacementWantedAt?: string | null;
  /** Grund, nur wenn man den Namen sieht */
  replacementNote?: string | null;
  /** Wer «Ersatz gesucht» für die Person gesetzt hat (OK), nur wenn man den Namen sieht */
  replacementByName?: string | null;
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
  /** `retentionDays` fehlt bei Vorlagen von vor 2026-10-25 (dann gilt DEFAULT_QUESTION_RETENTION_DAYS) */
  questions?: (Omit<EventQuestionDto, 'id' | 'retentionDays'> & { retentionDays?: QuestionRetentionDays })[];
  allowedDepartmentIds?: string[];
  allowedStufeIds?: string[];
  attendanceMode?: AttendanceMode;
  allowReplacement?: boolean;
  replacementCutoffHours?: number;
  reminderNote?: string | null;
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
  overlapToleranceMinutes?: number;
  shiftCount: number;
  data: EventTemplateData;
  createdAt: string;
  updatedAt: string;
}

export interface UserDto {
  id: string;
  email?: string | null;
  firstName: string;
  lastName: string | null;
  ceviName?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  isGlobalAdmin: boolean;
  /** Rolle in der Abteilung der Subdomain (ADMIN = Abteilungsleitung) */
  departmentRole?: UserRole | null;
  /** Wirksame Rechte in der Abteilung der Subdomain (Abteilungsleitung und globale Admins: alle) */
  departmentPermissions?: DepartmentPermission[];
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
  /** Gewählte Vorlaufzeiten (in Minuten vor Schichtbeginn) für E-Mail-Erinnerungen */
  emailReminderMinutes?: number[];
  /** Möchte Browser-Push-Erinnerungen vor den eigenen Schichten */
  pushReminders?: boolean;
  /** Gewählte Vorlaufzeiten (in Minuten vor Schichtbeginn) für Browser-Push-Erinnerungen */
  pushReminderMinutes?: number[];
  /** Browser-Push, wenn jemand die eigene angebotene Schicht übernimmt («Ersatz gefunden») */
  pushNotifyReplacement?: boolean;
  /** Browser-Push bei neuen Nachrichten vom OK */
  pushNotifyMessages?: boolean;
  /** Anzahl aktivierter Browser-Push-Geräte dieses Kontos */
  pushSubscriptionCount?: number;
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
  lastName: string | null;
  /** Heimabteilung ist diese Abteilung (sonst nur wegen einer Rolle in der Liste) */
  isHomeDepartment: boolean;
  source: 'SELF' | 'CEVIDB' | null;
  /** Rolle im Schichtplan dieser Abteilung (ADMIN = Abteilungsleitung) */
  departmentRole: 'ADMIN' | 'HELPER' | null;
  /** Gespeicherte Rechte (bei der Abteilungsleitung ohne Bedeutung) */
  permissions: DepartmentPermission[];
  /** Woher die Abteilungsleitung kommt */
  leaderSource: 'CEVIDB' | 'MANUAL' | null;
  /** Darf die angemeldete Person Rechte und Stufen dieser Person ändern? */
  canEdit: boolean;
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
  /** Kontaktangaben und Antworten sichtbar, OK-Bereich offen (Abteilungsleitung, OK, «Alle Anlässe sehen») */
  isManager: boolean;
  /** Was die Person in diesem Anlass darf */
  capabilities: EventCapability[];
}

/** Eintrag im Protokoll einer Abteilung (Rechte, Abteilungsleitung, Stufen, Zugehörigkeit) */
export interface DepartmentAuditEntryDto {
  id: string;
  /** null = automatisch über den Cevi.DB-Login */
  actorId: string | null;
  actorName: string;
  /** PERMISSIONS_SET, LEADER_GRANT, LEADER_REVOKE, STUFEN_SET, MEMBER_REMOVE */
  action: string;
  targetUserId: string | null;
  targetLabel: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface EventQuestionDto {
  id: string;
  label: string;
  type: EventQuestionType;
  options: string[];
  required: boolean;
  /** ONCE = einmal pro Anlass, PER_SIGNUP = bei jeder Eintragung (Antwort pro Schicht) */
  scope: EventQuestionScope;
  /** Tage nach dem Anlass, bis die Antworten gelöscht werden (null = nie) */
  retentionDays: QuestionRetentionDays;
}

/** Was der angemeldeten Person beim Anlass noch fehlt bzw. was sie angegeben hat */
export interface EventViewerDto {
  access: EventAccessDto;
  /** Darf Schichten mit «Ersatz gesucht» übernehmen (auch wenn das Eintragen geschlossen ist) */
  canTakeOver: boolean;
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
  birthDate: string | null;
  homeDepartmentName: string | null;
  viaLink: boolean;
  shiftCount: number;
  /** Antworten auf Fragen mit scope ONCE */
  answers: Record<string, string>;
  /** Antworten auf Fragen mit scope PER_SIGNUP, pro Eintragung */
  signupAnswers: { shiftTitle: string | null; startTime: string; answers: Record<string, string> }[];
}

export interface EventRosterShiftDto {
  id: string;
  title: string | null;
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
  lastName: string | null;
  displayName: string;
  birthDate: string | null;
  /** Alter am Anlass (erste Schicht), passend zu den Altersgrenzen */
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
  lastName: string | null;
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
  permissions: DepartmentPermission[];
}

export interface AdminUserListItemDto {
  potentialDuplicateOf?: { id: string; name: string; ceviName: string | null; email: string | null } | null;
  id: string;
  email: string | null;
  emailVerified?: boolean;
  firstName: string;
  lastName: string | null;
  ceviName: string | null;
  phone: string | null;
  birthDate: string | null;
  isGlobalAdmin: boolean;
  ceviDbId: number | null;
  loginMethods: LoginMethod[];
  signupCount: number;
  memberships: AdminUserMembershipDto[];
  homeDepartmentId?: string | null;
  homeDepartmentName?: string | null;
  homeDepartmentSlug?: string | null;
  homeDepartmentSource?: string | null;
  ceviDbOrtsgruppeId?: number | null;
  ceviDbOrtsgruppeName?: string | null;
  ceviDbDepartmentLeader?: boolean;
  ceviDbLeaderGroupName?: string | null;
  /** Letzter Tag mit Nutzung (YYYY-MM-DD, Schweizer Zeit), null = seit Einführung nicht gesehen */
  lastSeenOn?: string | null;
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
  shiftTitle: string | null;
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
  /** Verwaiste Cevi-Name-Profile (0 Eintragungen, älter als 30 Tage) */
  staleGuestUsers?: number;
  duplicateUsers?: number;
  globalAdmins: number;
  newUsers7d: number;
  departments: number;
  events: number;
  signups: number;
}

export interface AdminDepartmentLeaderDto {
  userId: string;
  name: string;
}

export interface AdminDepartmentListItemDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  contactUserId: string | null;
  contactName: string | null;
  ceviDbGroupId: number | null;
  membersOnly: boolean;
  /** Personen mit Abteilungsrolle (department_members) */
  memberCount: number;
  /** Personen mit dieser Heimabteilung */
  homeUserCount: number;
  eventCount: number;
  /** Anlässe, die noch nicht vorbei sind */
  upcomingEventCount: number;
  signupCount: number;
  /** Abteilungsleitung (Rolle ADMIN) */
  leaders: AdminDepartmentLeaderDto[];
  createdAt: string;
}

export interface AdminDepartmentPersonDto {
  userId: string;
  firstName: string;
  lastName: string | null;
  ceviName: string | null;
  email: string | null;
  isGlobalAdmin: boolean;
  loginMethods: LoginMethod[];
  /** Rolle in der Abteilung, null = nur Heimabteilung */
  role: string | null;
  permissions: DepartmentPermission[];
  leaderSource: string | null;
  isHome: boolean;
  /** CEVIDB oder SELF, nur bei Heimabteilung */
  homeSource: string | null;
}

export interface AdminDepartmentStufeDto {
  id: string;
  name: string;
  ceviDbGroupId: number | null;
  memberCount: number;
}

export interface AdminDepartmentDetailDto extends AdminDepartmentListItemDto {
  people: AdminDepartmentPersonDto[];
  stufen: AdminDepartmentStufeDto[];
  /** Die neusten Einträge im Protokoll der Abteilung */
  audit: DepartmentAuditEntryDto[];
  events: AdminEventListItemDto[];
  templates?: { id: string; name: string; description: string | null; shiftCount: number }[];
}

export interface AdminEventListItemDto {
  id: string;
  title: string;
  slug: string;
  departmentId: string;
  departmentName: string;
  departmentSlug: string;
  startDate: string;
  endDate: string;
  isPublished: boolean;
  allowPublicSignup: boolean;
  accessType: string;
  shiftCount: number;
  /** Summe der benötigten Plätze aller Schichten */
  slotCount: number;
  signupCount: number;
  organizerCount: number;
  createdAt: string;
}

export interface AdminEventListDto {
  items: AdminEventListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** Admin-Sitzung: Anmeldeart («cevidb», «password», «ceviname») und bis wann sie fürs Portal gilt */
export interface AdminSessionDto {
  loginMethod: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
}

/** Eintrag im Protokoll des Admin-Portals */
export interface AdminAuditEntryDto {
  id: string;
  adminId: string | null;
  adminName: string;
  /** z. B. DEPARTMENT_DELETE, USER_ADMIN_GRANT, MEMBER_ROLE_SET */
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAuditListDto {
  items: AdminAuditEntryDto[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** Startseite des Admin-Portals: Kennzahlen, Hinweise und was als Nächstes ansteht */
export interface AdminDashboardCriticalEventDto {
  id: string;
  title: string;
  slug: string;
  departmentId: string;
  departmentName: string;
  departmentSlug: string;
  startDate: string;
  endDate: string;
  isPublished: boolean;
  slotCount: number;
  signupCount: number;
  fillPct: number;
  reason: 'UNDERSTAFFED' | 'UNPUBLISHED_SOON';
}

export interface AdminDashboardDto {
  upcomingEvents: AdminEventListItemDto[];
  recentUsers: AdminUserListItemDto[];
  /** Abteilungen ohne Abteilungsleitung */
  departmentsWithoutLeader: { id: string; name: string; slug: string }[];
  /** Inaktive Abteilungen (keine Anlässe in den letzten 6 Monaten oder älter als 30 Tage ohne Anlass) */
  inactiveDepartments?: { id: string; name: string; slug: string; lastEventDate: string | null }[];
  departmentsWithoutContact?: { id: string; name: string; slug: string }[];
  criticalEvents?: AdminDashboardCriticalEventDto[];
  failedMessages7d?: number;
  potentialDuplicatesCount?: number;
  systemHealth?: {
    databaseOk: boolean;
    uptimeSeconds: number;
  };
  signups7d: number;
}

/** Darf die angemeldete Person eine Abteilung (Subdomain) für ihre Ortsgruppe anlegen? */
export interface DepartmentCreationEligibilityDto {
  eligible: boolean;
  /**
   * Warum nicht: NOT_CEVIDB (nicht mit Cevi.DB angemeldet), NOT_LEADER (keine Abteilungsleitung),
   * NO_ORTSGRUPPE (Leitungsrolle liegt in keiner Ortsgruppe), EXISTS (Gruppe hat schon eine Abteilung),
   * UNVERIFIED (Gruppenstruktur aus Cevi.DB fehlt, neu anmelden hilft)
   */
  reason: 'NOT_CEVIDB' | 'NOT_LEADER' | 'NO_ORTSGRUPPE' | 'EXISTS' | 'UNVERIFIED' | null;
  /** Cevi.DB-Gruppe der neuen Abteilung: die Ortsgruppe oder, bei mehreren Jungscharen, die Jungschar */
  ortsgruppeId: number | null;
  /** Name dieser Gruppe (z. B. "Weiningen-Geroldswil" oder "Effretikon"), Vorschlag für den Namen */
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

/** REPLACE: Schicht übernommen («Ersatz gesucht»), performedByName = wer abgegeben hat */
export type ShiftSignupLogAction = 'SIGNUP' | 'SIGNOFF' | 'REPLACE' | 'ATTENDANCE';

/** Ergebnis des Selbst-Check-ins per QR-Code */
export interface CheckinResultDto {
  eventTitle: string;
  /** Eben (oder schon vorher) als anwesend markierte Schichten */
  checkedIn: Array<{ signupId: string; shiftTitle: string | null; taskTitle: string | null; startTime: string; endTime: string; alreadyPresent: boolean }>;
  /** Nächste eigene Schicht, falls gerade keine im Check-in-Fenster liegt */
  nextShift: { shiftTitle: string | null; startTime: string; endTime: string } | null;
}

export type EventMessageTarget = 'ALL' | 'SHIFTS' | 'PEOPLE' | 'OK' | 'OPEN';

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
  skipped: { id: string; title: string | null; reason: string }[];
}
