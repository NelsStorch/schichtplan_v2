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

export interface EventDto {
  id: string;
  departmentId: string;
  title: string;
  slug: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  isPublished: boolean;
  signupMode: SignupMode;
  requireEmailForGuests?: boolean;
  requirePhoneForGuests?: boolean;
  allowPublicSignup: boolean;
  createdAt: string;
  shiftCount?: number;
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
