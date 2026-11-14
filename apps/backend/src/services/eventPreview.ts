import { accessTypeConfig, replacementDeadline } from '@schichtplan/shared';

export interface EventPreviewSource {
  title: string;
  slug: string;
  logoUrl: string | null;
  startDate: Date;
  endDate: Date;
  dayCutoffTime: string;
  isPublished: boolean;
  accessType: string;
  leadersOnly: boolean;
  allowPublicSignup: boolean;
  allowReplacement: boolean;
  replacementCutoffHours: number;
  updatedAt: Date;
  bannerUrl: string | null;
  shifts: Array<{ requiredSlots: number; _count: { signups: number } }>;
}

export interface ShiftPreviewSource {
  id: string;
  title: string | null;
  category: string | null;
  startTime: Date;
  endTime: Date;
  requiredSlots: number;
  _count: { signups: number };
  tasks: Array<{ title: string }>;
  /** Nur Einträge mit «Ersatz gesucht» (ohne Personendaten, nur zum Zählen) */
  signups: Array<{ id: string }>;
}

export interface ShiftPreviewDto {
  id: string;
  /** Schichttitel, sonst die einzige Arbeit, die Kategorie oder «Schicht» */
  title: string;
  startTime: string;
  endTime: string;
  openSlots: number | null;
  /** Wie viele Eingetragene Ersatz suchen (0, wenn die Frist vorbei oder Ersatz ausgeschaltet ist) */
  replacementWanted: number;
}

export interface EventPreviewDto {
  title: string;
  slug: string;
  logoUrl: string | null;
  startDate: string;
  endDate: string;
  dayCutoffTime: string;
  /** Freie Plätze, null wenn nicht mehr eingetragen werden kann (vorbei oder geschlossen) */
  openSlots: number | null;
  updatedAt: string;
  bannerUrl: string | null;
  /** Nur bei Abruf mit `?schicht=ID` und wenn die Schicht zum Anlass gehört */
  shift: ShiftPreviewDto | null;
}

/**
 * Eckdaten eines Anlasses für Link-Vorschauen (WhatsApp & Co.), ohne Anmeldung abrufbar. Zeigt nur, was die
 * Anlass-Seite auch ohne Login jeder Person mit dem Link zeigt (gleiche Regel wie GET /api/events/:slug):
 * keine Entwürfe und bei Abteilungen «nur für Mitglieder» keine internen Anlässe. Keine Personendaten.
 */
export function toEventPreview(
  event: EventPreviewSource,
  now = new Date(),
  shift: ShiftPreviewSource | null = null,
  departmentMembersOnly = false
): EventPreviewDto | null {
  if (!event.isPublished) return null;
  if (departmentMembersOnly && accessTypeConfig(event.accessType).scope !== 'ANY') return null;
  const open = event.shifts.reduce((sum, s) => sum + Math.max(0, s.requiredSlots - s._count.signups), 0);
  const canSignUp = event.allowPublicSignup && event.endDate > now;
  return {
    title: event.title,
    slug: event.slug,
    logoUrl: event.logoUrl,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
    dayCutoffTime: event.dayCutoffTime,
    openSlots: canSignUp ? open : null,
    updatedAt: event.updatedAt.toISOString(),
    bannerUrl: event.bannerUrl,
    shift: shift
      ? {
          id: shift.id,
          title:
            shift.title?.trim() ||
            (shift.tasks.length === 1 ? shift.tasks[0].title.trim() : '') ||
            shift.category?.trim() ||
            'Schicht',
          startTime: shift.startTime.toISOString(),
          endTime: shift.endTime.toISOString(),
          openSlots:
            event.allowPublicSignup && shift.endTime > now
              ? Math.max(0, shift.requiredSlots - shift._count.signups)
              : null,
          replacementWanted:
            event.allowReplacement && now < replacementDeadline(shift.startTime, event.replacementCutoffHours)
              ? shift.signups.length
              : 0,
        }
      : null,
  };
}
