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
  shifts: Array<{ requiredSlots: number; _count: { signups: number } }>;
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
}

/**
 * Eckdaten eines Anlasses für Link-Vorschauen (WhatsApp & Co.), ohne Anmeldung abrufbar.
 * Nur für veröffentlichte, öffentliche Anlässe: Titel interner Anlässe, von Anlässen nur für Leitende oder mit
 * eingeschränktem Zugang gehören nicht in eine Vorschau, die jede Person mit dem Link sieht. Keine Personendaten.
 */
export function toEventPreview(event: EventPreviewSource, now = new Date()): EventPreviewDto | null {
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
  };
}
