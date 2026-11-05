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
  taskId?: string | null;
  taskTitle?: string | null;
  title: string | null;
  category: string;
  description?: string;
  startTime: string;
  endTime: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventStartDate?: string;
  cancelDeadlineDays?: number | null;
  cateringTokensEnabled?: boolean;
  /** «Ersatz gesucht»: erlaubt, Frist und eigener Stand */
  allowReplacement?: boolean;
  replacementCutoffHours?: number;
  replacementWantedAt?: string | null;
  replacementNote?: string | null;
  departmentName: string;
  departmentSlug: string;
  createdAt: string;
  isSignup?: boolean;
  isResponsible?: boolean;
  responsibleRole?: string | null;
  /** Schicht- oder Tagesleitung inkl. freigegebener Kontaktdaten (auch offline gecacht) */
  responsibles?: ResponsiblePersonDto[];
  /** Hauptkontaktperson des Anlasses inkl. freigegebener Kontaktdaten */
  contactUser?: ResponsiblePersonDto | null;
  /** Namen der anderen Helfer*innen in derselben Schicht */
  coHelpers?: string[];
  filledSlots?: number;
  requiredSlots?: number;
  dayCutoffTime?: string;
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
  reminderNote?: string | null;
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
  signupOpensAt?: string | null;
  cancelDeadlineDays?: number | null;
  overlapToleranceMinutes?: number;
  attendanceMode?: AttendanceMode;
  checkinEarlyMinutes?: number;
  checkinLateMinutes?: number;
  cateringTokensEnabled?: boolean;
  cateringTokenItems?: string[];
  cateringEarlyHours?: number;
  cateringStaffPin?: string | null;
  cateringRemindersEnabled?: boolean;
  allowReplacement?: boolean;
  replacementCutoffHours?: number;
  /** Nur für das OK: geheimer Code im QR-Link für den Selbst-Check-in */
  checkinToken?: string | null;
}
