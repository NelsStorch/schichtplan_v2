import type {
  EventAccessType,
  EventQuestionDto,
  EventViewerDto,
  RequiredProfileField,
  ShiftDto,
  ResponsiblePersonDto,
  EventResponsibleMode,
  EventContactVisibility,
  AttendanceMode,
} from '@schichtplan/shared';

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
  eventStartDate?: string;
  cancelDeadlineDays?: number | null;
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
  allowPublicSignup: boolean;
  accessType: EventAccessType;
  leadersOnly: boolean;
  requiredFields: RequiredProfileField[];
  /** Wer sich eintragen darf, als Satz (z. B. «Cevi Illnau (Hiskia), nur Leitende») */
  audience: string;
  allowedDepartments: { id: string; name: string }[];
  allowedStufen: { id: string; name: string; departmentId: string }[];
  questions: EventQuestionDto[];
  viewer: EventViewerDto;
  organizers?: EventOrganizer[];
  shifts: ShiftDto[];
  minShiftsPerPerson?: number | null;
  contactUserId?: string | null;
  contactUser?: ResponsiblePersonDto | null;
  dayCutoffTime: string;
  responsibleMode: EventResponsibleMode;
  dayResponsibles?: Record<string, ResponsiblePersonDto[]>;
  contactVisibility?: EventContactVisibility;
  cancelDeadlineDays?: number | null;
  attendanceMode?: AttendanceMode;
  /** Nur für das OK: geheimer Code im QR-Link für den Selbst-Check-in */
  checkinToken?: string | null;
}
