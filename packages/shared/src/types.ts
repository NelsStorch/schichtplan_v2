import { UserRole, SignupMode } from './constants.js';

export interface DepartmentDto {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  contactEmail?: string | null;
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
  signupMode: SignupMode;
  requireEmailForGuests?: boolean;
  requirePhoneForGuests?: boolean;
  allowPublicSignup: boolean;
  createdAt: string;
  shiftCount?: number;
  organizers?: EventOrganizerDto[];
}

export interface ShiftDto {
  id: string;
  eventId: string;
  title: string;
  category: string;
  startTime: string;
  endTime: string;
  requiredSlots: number;
  description?: string | null;
  minAge?: number | null;
  signups?: ShiftSignupDto[];
  freeSlots?: number;
}

export interface ShiftSignupDto {
  id: string;
  shiftId: string;
  userId?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  displayName: string;
  userFirstName?: string | null;
  userLastName?: string | null;
  userCeviName?: string | null;
  createdAt: string;
  isConfirmed: boolean;
}

export interface UserDto {
  id: string;
  email?: string | null;
  firstName: string;
  lastName: string;
  ceviName?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  isGlobalAdmin: boolean;
  departmentRole?: UserRole | null;
  ceviDbId?: number | null;
  ceviDbSyncedAt?: string | null;
  hasCeviDb?: boolean;
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
  shiftCategory: string;
  startTime: string;
  endTime: string;
  eventTitle: string;
  eventSlug: string;
  departmentName: string;
  departmentSlug: string;
  isConfirmed: boolean;
  createdAt: string;
}

export interface AdminUserDetailDto extends AdminUserListItemDto {
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
  /** Name der Cevi.DB-Gruppe, in der die Person Abteilungsleitung ist (z. B. "JS Illnau") */
  leaderGroupName: string | null;
  existingDepartment: { name: string; slug: string } | null;
}
