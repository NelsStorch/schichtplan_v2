import { UserRole } from './constants.js';

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
  allowPublicSignup: boolean;
  createdAt: string;
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
  userId: string;
  userFirstName: string;
  userLastName: string;
  userCeviName?: string | null;
  createdAt: string;
  isConfirmed: boolean;
}

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  ceviName?: string | null;
  phone?: string | null;
  isGlobalAdmin: boolean;
  departmentRole?: UserRole | null;
}

export interface AuthResponseDto {
  user: UserDto;
  token?: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
  database: boolean;
}
