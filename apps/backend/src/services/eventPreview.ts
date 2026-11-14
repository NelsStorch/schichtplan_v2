import { toEventAccessType } from '@schichtplan/shared';

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
}

export interface ShiftPreviewDto {
  id: string;
  /** Schichttitel, sonst die einzige Arbeit, die Kategorie oder «Schicht» */
  title: string;
  startTime: string;
  endTime: string;
  openSlots: number | null;
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
 * Eckdaten eines Anlasses für Link-Vorschauen (WhatsApp & Co.), ohne Anmeldung abrufbar.
 * Nur für veröffentlichte, öffentliche Anlässe: Titel interner Anlässe, von Anlässen nur für Leitende oder mit
 * eingeschränktem Zugang gehören nicht in eine Vorschau, die jede Person mit dem Link sieht. Keine Personendaten.
 */
export function toEventPreview(
  event: EventPreviewSource,
  now = new Date(),
  shift: ShiftPreviewSource | null = null
): EventPreviewDto | null {
  if (!event.isPublished || event.leadersOnly || toEventAccessType(event.accessType) !== 'PUBLIC') return null;
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
        }
      : null,
  };
}
