import type { ShiftDto, SignupMode } from '@schichtplan/shared';

/** Antwort von GET /api/shifts/my */
export interface MyShift {
  signupId: string;
  shiftId: string;
  title: string;
  category: string;
  description?: string;
  startTime: string;
  endTime: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  departmentName: string;
  departmentSlug: string;
  createdAt: string;
}

export interface EventOrganizer {
  id: string;
  eventId: string;
  userId: string;
  userFirstName: string;
  userLastName: string;
  userCeviName?: string | null;
  displayName: string;
  role: 'OK_LEAD' | 'OK_MEMBER';
  roleTitle?: string | null;
  createdAt: string;
}

/** Antwort von GET /api/events/:slug */
export interface EventDetails {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  startDate: string;
  endDate: string;
  signupMode: SignupMode;
  requireEmailForGuests?: boolean;
  requirePhoneForGuests?: boolean;
  organizers?: EventOrganizer[];
  shifts: ShiftDto[];
}
