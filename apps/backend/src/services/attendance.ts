import { randomBytes } from 'node:crypto';
import { CHECKIN_EARLY_MINUTES } from '@schichtplan/shared';
import { eventUrl } from './shiftReminders.js';
import { trackUsage } from './usageStats.js';
import { generateCheckinPdf, generateQrSvg } from './qrGenerator.js';
import type { PrismaClient } from '../db.js';

export { generateCheckinPdf, generateQrSvg };

/** Zufälliger, nicht erratbarer Code für den QR-Link (24 Zeichen, URL-sicher) */
export function generateCheckinToken(): string {
  return randomBytes(18).toString('base64url');
}

/** Liegt `now` im Check-in-Fenster der Schicht (ab 30 Min. vor Beginn bis Schichtende)? */
export function isInCheckinWindow(startTime: Date, endTime: Date, now: Date = new Date()): boolean {
  const opens = startTime.getTime() - CHECKIN_EARLY_MINUTES * 60_000;
  return now.getTime() >= opens && now.getTime() <= endTime.getTime();
}

/** Link im QR-Code: https://<abteilung>.<domain>/events/<slug>/checkin?code=<token> */
export function checkinUrl(
  departmentSlug: string,
  eventSlug: string,
  token: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${eventUrl(departmentSlug, eventSlug, env)}/checkin?code=${encodeURIComponent(token)}`;
}

/** Name wie im Protokoll: «Vorname / Cevi-Name», sonst «Vorname Nachname», sonst Gastname */
export function personLabel(
  user: { firstName: string; lastName?: string | null; ceviName?: string | null } | null | undefined,
  guestName?: string | null
): string {
  if (user) {
    return user.ceviName ? `${user.firstName} / ${user.ceviName}` : `${user.firstName} ${user.lastName ?? ''}`.trim();
  }
  return guestName || 'Gast';
}

export type QrFormat = 'svg' | 'pdf';

/** Basis-URL des Cevi-QR-Generators (https://github.com/cevi/qr-code-generator) */
export function qrApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.QR_API_URL || 'https://backend.qr.cevi.tools').replace(/\/+$/, '');
}

export interface QrCodeInput {
  text: string;
  title?: string;
  subtitle?: string;
  color?: string | null;
  logoUrl?: string | null;
  departmentName?: string;
  prisma?: PrismaClient;
}

/**
 * QR-Code im Cevi-Stil erzeugen: SVG zum Anzeigen oder A4-PDF (mit Titel/Untertitel) zum Ausdrucken.
 * Läuft lokal ohne externe Abhängigkeiten. Wenn `fetchImpl` oder `QR_API_URL` gesetzt ist, wird
 * für Tests oder Sonderfälle die externe API aufgerufen.
 */
export async function fetchCeviQrCode(
  format: QrFormat,
  input: QrCodeInput,
  fetchImpl?: typeof fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<Buffer> {
  // Wenn explizit eine externe URL konfiguriert ist oder ein Mock-Fetch übergeben wurde (Vitest)
  if (env.QR_API_URL || fetchImpl) {
    const body =
      format === 'pdf'
        ? { text: input.text, title: input.title, subtitle: input.subtitle, show_url: false }
        : { text: input.text };
    const res = await (fetchImpl ?? fetch)(`${qrApiBaseUrl(env)}/${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      trackUsage('EXTERNAL', { dim: 'QR_ERROR' });
      throw new Error(`QR-Generator antwortet mit ${res.status}`);
    }
    trackUsage('EXTERNAL', { dim: 'QR_OK' });
    return Buffer.from(await res.arrayBuffer());
  }

  // Lokale Generierung: SVG oder A4-PDF mit Abteilungsfarbe und zentriertem Logo
  if (format === 'pdf') {
    return generateCheckinPdf(input);
  }
  const svg = await generateQrSvg(input);
  return Buffer.from(svg, 'utf8');
}
