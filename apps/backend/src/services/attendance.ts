import { randomBytes } from 'node:crypto';
import { CHECKIN_EARLY_MINUTES, type OrganizationType } from '@schichtplan/shared';
import { eventUrl } from './shiftReminders.js';
import { generateCheckinPdf, generateQrSvg } from './qrGenerator.js';
import type { PrismaClient } from '../db.js';

export { generateCheckinPdf, generateQrSvg };

/** Zufälliger, nicht erratbarer Code für den QR-Link (24 Zeichen, URL-sicher) */
export function generateCheckinToken(): string {
  return randomBytes(18).toString('base64url');
}

/** Liegt `now` im Check-in-Fenster der Schicht (ab 30 Min. vor Beginn bis Schichtende)? */
export function isInCheckinWindow(
  startTime: Date,
  endTime: Date,
  now: Date = new Date(),
  earlyMinutes: number = CHECKIN_EARLY_MINUTES,
  lateMinutes: number = 30
): boolean {
  const opens = startTime.getTime() - earlyMinutes * 60_000;
  const closes = endTime.getTime() + lateMinutes * 60_000;
  return now.getTime() >= opens && now.getTime() <= closes;
}

/** Link im QR-Code: https://<abteilung>.<domain>/events/<slug>/checkin?code=<token> */
export function checkinUrl(
  departmentSlug: string,
  eventSlug: string,
  token: string,
  orgOrDomainOrEnv?: OrganizationType | string | NodeJS.ProcessEnv,
  maybeEnv?: NodeJS.ProcessEnv
): string {
  let orgOrDomain: OrganizationType | string | undefined;
  let env: NodeJS.ProcessEnv;
  if (typeof orgOrDomainOrEnv === 'object' && orgOrDomainOrEnv !== null) {
    env = orgOrDomainOrEnv as NodeJS.ProcessEnv;
    orgOrDomain = undefined;
  } else {
    orgOrDomain = orgOrDomainOrEnv;
    env = maybeEnv || process.env;
  }
  return `${eventUrl(departmentSlug, eventSlug, orgOrDomain, env)}/checkin?code=${encodeURIComponent(token)}`;
}

/** Name wie im Protokoll: «Vorname / Cevi-Name», sonst «Vorname Nachname», sonst Gastname */
export function personLabel(
  user: { firstName: string; lastName?: string | null; nickname?: string | null; ceviName?: string | null } | null | undefined,
  guestName?: string | null
): string {
  if (user) {
    const nick = user.nickname ?? user.ceviName;
    return nick ? `${user.firstName} / ${nick}` : `${user.firstName} ${user.lastName ?? ''}`.trim();
  }
  return guestName || 'Gast';
}

export type QrFormat = 'svg' | 'pdf';

export interface QrCodeInput {
  text: string;
  title?: string;
  subtitle?: string;
  color?: string | null;
  secondaryColor?: string | null;
  qrStyle?: 'CORNERS' | 'GRADIENT' | 'SOLID' | null;
  logoUrl?: string | null;
  departmentName?: string;
  checkinEarlyMinutes?: number;
  checkinLateMinutes?: number;
  prisma?: PrismaClient;
  organization?: OrganizationType;
}

/**
 * QR-Code im Stil der Abteilung erzeugen: SVG zum Anzeigen oder A4-PDF (mit Titel/Untertitel) zum Ausdrucken.
 * Läuft komplett lokal, ohne externen Dienst.
 */
export async function createQrCode(format: QrFormat, input: QrCodeInput): Promise<Buffer> {
  if (format === 'pdf') return generateCheckinPdf(input);
  const svg = await generateQrSvg(input);
  return Buffer.from(svg, 'utf8');
}
