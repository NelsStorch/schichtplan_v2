import nodemailer, { type Transporter } from 'nodemailer';
import type { MailKind, OrganizationType } from '@schichtplan/shared';
import { getOrganization, getOrganizationByDbType } from '@schichtplan/shared';
import { escapeIcsText, foldIcsLine, formatIcsUtc } from './calendarFeed.js';
import { trackUsage } from './usageStats.js';

export interface SmtpAccountConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

const defaultHost = process.env.SMTP_HOST || 'mail.infomaniak.com';
const defaultPort = Number(process.env.SMTP_PORT || 587);
const defaultSecure = defaultPort === 465;

/**
 * Normalisiert eine beliebige Organisations-Bezeichnung (Slug, Hostname, Enum)
 * in den gültigen Datenbank-Enum-Wert ('CEVI' | 'PFADI' | 'JUBLA' | 'OTHER').
 */
export function normalizeOrganizationType(org?: string | null): OrganizationType {
  if (!org) return 'CEVI';
  const clean = org.toUpperCase().trim();
  if (clean === 'CEVI' || clean === 'PFADI' || clean === 'JUBLA' || clean === 'OTHER') {
    return clean as OrganizationType;
  }
  return getOrganization(org).dbType;
}

/**
 * Liefert die SMTP-Kontodaten für die jeweilige Organisation.
 * Passwörter kommen ausschliesslich aus der Umgebung (Server-.env), nie aus dem Code.
 */
export function getSmtpConfig(orgType: OrganizationType): SmtpAccountConfig {
  const org = getOrganizationByDbType(orgType);
  const suffix = org.envSuffix;
  const env = process.env;
  // Cevi nutzt zusätzlich die älteren Variablen ohne Endung (SMTP_USER, SMTP_PASSWORD, SMTP_FROM)
  const legacy = org.slug === 'cevi';
  const portVar = env[`SMTP_PORT_${suffix}`];
  return {
    host: env[`SMTP_HOST_${suffix}`] || defaultHost,
    port: Number(portVar || defaultPort),
    secure: portVar ? Number(portVar) === 465 : defaultSecure,
    user: env[`SMTP_USER_${suffix}`] || (legacy ? env.SMTP_USER : undefined) || `admin@${org.domain}`,
    pass: env[`SMTP_PASSWORD_${suffix}`] || (legacy ? env.SMTP_PASSWORD : undefined) || '',
    from: env[`SMTP_FROM_${suffix}`] || (legacy ? env.SMTP_FROM : undefined) || `${org.name} <admin@${org.domain}>`,
  };
}

/**
 * Transporter-Pool: Gecachte nodemailer-Transporter pro OrganizationType.
 * Connection-Pooling & Rate-Throttling verhindern Verbindungs-Spikes und Sperren.
 */
const transporterPool = new Map<OrganizationType, Transporter>();

export function getMailTransporter(orgType?: OrganizationType | string | null): Transporter {
  const normalized = normalizeOrganizationType(orgType);
  const existing = transporterPool.get(normalized);
  if (existing) {
    return existing;
  }

  const config = getSmtpConfig(normalized);
  const transporter = nodemailer.createTransport({
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.pass
      ? {
          user: config.user,
          pass: config.pass,
        }
      : undefined,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });

  transporterPool.set(normalized, transporter);
  return transporter;
}

/**
 * Standard-Transporter (CEVI) für Abwärtskompatibilität.
 */
export const mailTransporter = getMailTransporter('CEVI');

export function isEmailConfigured(organization?: OrganizationType | string | null): boolean {
  const norm = normalizeOrganizationType(organization);
  return Boolean(getSmtpConfig(norm).pass);
}

export async function verifySmtpConnection(organization?: OrganizationType | string | null): Promise<boolean> {
  const norm = normalizeOrganizationType(organization);
  const config = getSmtpConfig(norm);
  if (!config.pass) return false;
  try {
    const transporter = getMailTransporter(norm);
    await transporter.verify();
    return true;
  } catch (error) {
    console.error(`[Mail] SMTP-Verbindungstest fehlgeschlagen für ${norm}:`, error);
    return false;
  }
}

export interface EmailDetailRow {
  label: string;
  value: string;
  /** Hebt den Wert farblich mit der Akzentfarbe hervor (z. B. Schichtname) */
  highlight?: boolean;
}

export interface EmailTemplateOptions {
  preheader?: string;
  eyebrow?: string;
  title: string;
  contentHtml: string;
  /** Strukturierte Key-Value-Karte (z. B. für Schicht-Details, Zeiten, Admin-Infos) */
  details?: EmailDetailRow[];
  calloutBox?: {
    title?: string;
    text: string;
    tone?: 'info' | 'warning' | 'neutral' | 'success';
  };
  ctaText?: string;
  ctaUrl?: string;
  secondaryCtaText?: string;
  secondaryCtaUrl?: string;
  footerNote?: string;
  /** Dynamischer Untertitel im Header (z. B. Abteilungsname statt Standardtext) */
  headerSubtitle?: string;
  /** Optionale Absender-Signatur am Ende der E-Mail (Standard: «Dein Cevi Schichtplan Team») */
  signatureName?: string;
  /** Optionale Akzentfarbe der Abteilung (#rrggbb), Standard: #e11d48 */
  accentColor?: string | null;
  /** Direktlink zum Abbestellen / Verwalten im Footer */
  unsubscribeUrl?: string;
  unsubscribeLabel?: string;
  /** Optionale Organisation für dynamisches Branding (Logo, Farben, Footer, Domain) */
  organization?: OrganizationType | string;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Liefert den formatierten Standard-Absender für die jeweilige Organisation.
 */
export function getDefaultFromHeader(orgType?: OrganizationType | string | null): string {
  const norm = normalizeOrganizationType(orgType);
  return getSmtpConfig(norm).from;
}

/**
 * Baut den Absender-Header mit optionalem Anzeigenamen unter Beibehaltung der
 * authentifizierten E-Mail-Adresse (wichtig für SPF/DKIM/DMARC Alignment).
 * Akzeptiert als zweiten Parameter entweder eine explizite Absenderadresse oder einen OrganizationType.
 */
export function formatFromHeader(
  customSenderName?: string,
  baseFromOrOrg?: string | OrganizationType
): string {
  let baseFrom: string;
  if (!baseFromOrOrg) {
    baseFrom = getDefaultFromHeader('CEVI');
  } else if (baseFromOrOrg.includes('@')) {
    baseFrom = baseFromOrOrg;
  } else {
    baseFrom = getDefaultFromHeader(baseFromOrOrg);
  }

  if (!customSenderName?.trim()) return baseFrom;
  const emailMatch = baseFrom.match(/<([^>]+)>/);
  const address = emailMatch ? emailMatch[1] : baseFrom.trim();
  const safeName = customSenderName
    .replace(/[\r\n"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `"${safeName}" <${address}>`;
}

/**
 * Setzt in Dev- und Staging-Umgebungen das Präfix "[DEV] " vor den E-Mail-Betreff.
 */
export function formatEmailSubject(subject: string): string {
  const isDev =
    process.env.NODE_ENV !== 'production' ||
    Boolean(process.env.DOMAIN?.includes('dev')) ||
    process.env.IS_DEV === 'true';

  if (isDev && !subject.trimStart().startsWith('[DEV] ')) {
    return `[DEV] ${subject}`;
  }
  return subject;
}

/**
 * Liefert eine passende Standard-Anrede für Helfende ohne hinterlegten Namen.
 */
function getDefaultGreeting(orgSlug: string): string {
  switch (orgSlug) {
    case 'pfadi':
      return 'Pfadi';
    case 'jubla':
      return 'Jublaner*in';
    case 'verein':
      return 'Helfer*in';
    default:
      return 'Cevianer*in';
  }
}

/** Entfernt alle Blöcke `<tag ...> ... </tag ...>` samt Inhalt (linear, ohne Regex-Backtracking). */
function stripBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  const open = `<${tag}`;
  const close = `</${tag}`;
  let out = '';
  let pos = 0;
  for (;;) {
    const a = lower.indexOf(open, pos);
    if (a === -1) break;
    // «<headline» ist kein <head>: nach dem Tag-Namen muss ein Trennzeichen folgen
    const next = lower.charAt(a + open.length);
    if (next !== '>' && next !== '/' && !/\s/.test(next)) {
      out += html.slice(pos, a + open.length);
      pos = a + open.length;
      continue;
    }
    out += html.slice(pos, a);
    const b = lower.indexOf(close, a + open.length);
    if (b === -1) {
      pos = html.length;
      break;
    }
    const e = lower.indexOf('>', b + close.length);
    pos = e === -1 ? html.length : e + 1;
  }
  return out + html.slice(pos);
}

/** Entfernt HTML-Kommentare `<!-- ... -->` (linear; ein nicht geschlossener Kommentar reicht bis zum Ende). */
function stripComments(html: string): string {
  let out = '';
  let pos = 0;
  for (;;) {
    const a = html.indexOf('<!--', pos);
    if (a === -1) break;
    out += html.slice(pos, a);
    const b = html.indexOf('-->', a + 4);
    if (b === -1) return out;
    pos = b + 3;
  }
  return out + html.slice(pos);
}

/** Wendet eine Ersetzung wiederholt an, bis sich nichts mehr ändert (gegen verschachtelte Muster wie `<<b>b>`). */
function replaceUntilStable(input: string, pattern: RegExp, replacement: string): string {
  let prev: string;
  let cur = input;
  do {
    prev = cur;
    cur = cur.replace(pattern, replacement);
  } while (cur !== prev);
  return cur;
}

/** Macht Werte für Logzeilen unschädlich (keine Zeilenumbrüche/Steuerzeichen, kein Log-Spoofing). */
function safeLog(value: unknown): string {
  return String(value ?? '')
    .slice(0, 500)
    .replace(/\n|\r/g, ' ')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ');
}

/** Entfernt versteckte Vorschautext-Blöcke (div mit mso-hide:all) ohne Regex über den ganzen Block (linear). */
function stripHiddenDivs(html: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let pos = 0;
  for (;;) {
    const open = lower.indexOf('<div', pos);
    if (open === -1) break;
    const openEnd = lower.indexOf('>', open);
    if (openEnd === -1) break;
    if (!/mso-hide:\s*all/.test(lower.slice(open, openEnd))) {
      out += html.slice(pos, openEnd + 1);
      pos = openEnd + 1;
      continue;
    }
    out += html.slice(pos, open);
    const close = lower.indexOf('</div>', openEnd);
    if (close === -1) {
      pos = html.length;
      break;
    }
    pos = close + '</div>'.length;
  }
  return out + html.slice(pos);
}

/**
 * Konvertiert HTML-Mails sauber in reinen Text (ohne CSS-Blöcke, XML oder HTML-Entities).
 * Verhindert hohe SpamAssassin-Scores (MPART_ALT_DIFF).
 */
export function htmlToPlainText(html: string): string {
  let text = stripComments(html);
  text = stripBlocks(text, 'head');
  text = stripBlocks(text, 'style');
  text = stripBlocks(text, 'script');
  text = stripHiddenDivs(text);
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|tr|li)>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' ');
  return replaceUntilStable(text, /<[^<>]*>/g, '')
    .replace(/&zwnj;/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&bull;/gi, '•')
    .replace(/&rarr;/gi, '→')
    .replace(/&copy;/gi, '©')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Erzeugt eine RFC 5545 kompatible .ics-Kalenderdatei für eine einzelne Schicht.
 * Dadurch zeigen Gmail, Apple Mail & Outlook direkt eine Termin-Karte über der E-Mail an.
 */
export function buildShiftIcsAttachment({
  uid,
  shiftTitle,
  eventTitle,
  departmentName,
  startTime,
  endTime,
  shiftUrl,
  description,
  organization,
}: {
  uid: string;
  shiftTitle: string;
  eventTitle: string;
  departmentName?: string;
  startTime: Date;
  endTime: Date;
  shiftUrl?: string;
  description?: string;
  organization?: OrganizationType | string;
}): string {
  const org = getOrganization(organization);
  const nowUtc = formatIcsUtc(new Date());
  const summary = `${shiftTitle} · ${eventTitle}`;
  const descLines = [
    `Schicht: ${shiftTitle}`,
    `Anlass: ${eventTitle}`,
    departmentName ? `Abteilung: ${departmentName}` : null,
    description ? `\n${description}` : null,
    shiftUrl ? `\nSchichtplan: ${shiftUrl}` : null,
  ].filter(Boolean) as string[];

  const rawLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${org.name}//DE`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART:${formatIcsUtc(startTime)}`,
    `DTEND:${formatIcsUtc(endTime)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descLines.join('\n'))}`,
    ...(departmentName ? [`LOCATION:${escapeIcsText(departmentName)}`] : []),
    ...(shiftUrl ? [`URL:${shiftUrl}`] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return rawLines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/**
 * Erzeugt einen Web-Direktlink zu Google Calendar für 1-Klick-Import auf Mobilgeräten.
 */
export function buildGoogleCalendarUrl({
  title,
  startTime,
  endTime,
  description,
  location,
}: {
  title: string;
  startTime: Date;
  endTime: Date;
  description?: string;
  location?: string;
}): string {
  const formatUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatUtc(startTime)}/${formatUtc(endTime)}`,
  });
  if (description) params.set('details', description);
  if (location) params.set('location', location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * High-End HTML-E-Mail-Renderer im warmen «Lagerfeuer»-Design-System (@schichtplan/ui).
 * - Warm-Stone Farbpalette (#f5f4f2 Canvas, #fefefd Surface, #1c1917 Ink)
 * - Dynamischer Abteilungs-Kontext & Akzentfarbe
 * - Strukturierte Detail-Karten & Callouts
 * - Vollständige Dark-Mode-Unterstützung (@media prefers-color-scheme: dark) ohne Kontrastbrüche
 * - 100% kompatibel mit Gmail, Outlook, Apple Mail, Bluewin, ProtonMail & Mobilgeräten
 */
export function renderEmailTemplate({
  preheader,
  eyebrow,
  title,
  contentHtml,
  details,
  calloutBox,
  ctaText,
  ctaUrl,
  secondaryCtaText,
  secondaryCtaUrl,
  footerNote,
  headerSubtitle,
  signatureName,
  accentColor,
  unsubscribeUrl,
  unsubscribeLabel,
  organization,
}: EmailTemplateOptions): string {
  const org = getOrganization(organization);
  const brandColor = accentColor && HEX_COLOR_RE.test(accentColor) ? accentColor : org.primaryColor;
  const brandName = org.name;
  const logoUrl = `https://${org.domain}${org.logoUrl}`;
  const subtitle = headerSubtitle?.trim() || `Schweizer Plattform für ${org.targetGroup}`;
  const signature = signatureName?.trim() || `Dein ${org.name} Team`;

  let calloutBg = '#fafaf9';
  let calloutBorder = '#e4e1de';
  let calloutAccent = '#716b66';
  if (calloutBox?.tone === 'warning') {
    calloutBg = '#fffbeb';
    calloutBorder = '#fde68a';
    calloutAccent = '#d97706';
  } else if (calloutBox?.tone === 'info') {
    calloutBg = '#fff1f2';
    calloutBorder = '#ffe4e6';
    calloutAccent = brandColor;
  } else if (calloutBox?.tone === 'success') {
    calloutBg = '#f0fdf4';
    calloutBorder = '#bbf7d0';
    calloutAccent = '#16a34a';
  }

  const detailsHtml =
    details && details.length > 0
      ? `
      <div class="email-detail-card" style="background-color: #fafaf9; border: 1px solid #e4e1de; border-radius: 14px; padding: 6px 20px; margin: 22px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 14.5px;">
          ${details
            .map((row, idx) => {
              const isLast = idx === details.length - 1;
              const borderStyle = isLast ? '' : 'border-bottom: 1px solid #eceae7;';
              const rowClass = isLast ? '' : 'class="email-detail-row"';
              const valueColor = row.highlight ? brandColor : '#1c1917';
              const valueClass = row.highlight ? 'email-detail-highlight' : 'email-detail-value';
              return `
              <tr ${rowClass}>
                <td class="email-detail-label" valign="top" style="padding: 11px 12px 11px 0; color: #716b66; font-weight: 600; width: 110px; ${borderStyle}">${escapeHtml(row.label)}</td>
                <td class="${valueClass}" valign="top" style="padding: 11px 0; color: ${valueColor}; font-weight: ${row.highlight ? '700' : '600'}; ${borderStyle}">${escapeHtml(row.value)}</td>
              </tr>`;
            })
            .join('')}
        </table>
      </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #f5f4f2;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    a {
      color: ${brandColor};
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .email-outer { padding: 20px 10px !important; }
      .email-header { padding: 22px 22px 18px 22px !important; }
      .email-body { padding: 26px 22px 24px 22px !important; }
      .email-footer { padding: 20px 22px !important; }
      .email-title { font-size: 21px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #0c0a09 !important; }
      .email-card { background-color: #171513 !important; border-color: #2d2926 !important; }
      .email-header { background-color: #171513 !important; border-color: #2d2926 !important; }
      .email-brand-name { color: #f5f4f2 !important; }
      .email-brand-sub { color: #8a847f !important; }
      .email-eyebrow { background-color: #2d161c !important; color: #fb7185 !important; }
      .email-title { color: #f5f4f2 !important; }
      .email-body { color: #d6d3d0 !important; }
      .email-detail-card { background-color: #211e1c !important; border-color: #2d2926 !important; }
      .email-detail-row td { border-color: #2d2926 !important; }
      .email-detail-label { color: #8a847f !important; }
      .email-detail-value { color: #f5f4f2 !important; }
      .email-detail-highlight { color: #fb7185 !important; }
      .email-callout { background-color: #211e1c !important; border-color: #2d2926 !important; color: #d6d3d0 !important; }
      .email-callout-title { color: #f5f4f2 !important; }
      .email-callout-text { color: #aca6a1 !important; }
      .email-link-box { background-color: #211e1c !important; border-color: #2d2926 !important; color: #8a847f !important; }
      .email-divider { border-color: #2d2926 !important; color: #8a847f !important; }
      .email-signature { color: #f5f4f2 !important; }
      .email-footer { background-color: #12100e !important; border-color: #2d2926 !important; color: #8a847f !important; }
      .email-footer-note { color: #aca6a1 !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin: 0; padding: 0; background-color: #f5f4f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  ${
    preheader
      ? `<div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #f5f4f2; opacity: 0;">${escapeHtml(
          preheader
        )} &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
      : ''
  }

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg email-outer" style="background-color: #f5f4f2; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px;">
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-card" style="background-color: #fefefd; border-radius: 20px; border: 1px solid #e4e1de; overflow: hidden; box-shadow: 0 1px 2px rgba(41, 37, 36, 0.06), 0 8px 24px -6px rgba(41, 37, 36, 0.10);">
                
                <!-- Top Brand Accent Stripe -->
                <tr>
                  <td height="5" style="background-color: ${brandColor}; line-height: 5px; font-size: 5px;">&nbsp;</td>
                </tr>

                <!-- Header: Logo & Wordmark Lockup -->
                <tr>
                  <td class="email-header" style="padding: 26px 36px 22px 36px; border-bottom: 1px solid #eceae7; background-color: #fefefd;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" valign="middle">
                          <table role="presentation" cellpadding="0" cellspacing="0">
                            <tr>
                              <td valign="middle" style="padding-right: 14px;">
                                <img src="${logoUrl}" width="38" height="38" alt="${escapeHtml(brandName)} Logo" style="display: block; width: 38px; height: 38px; border-radius: 10px;" />
                              </td>
                              <td valign="middle">
                                <span class="email-brand-name" style="display: block; font-size: 17px; font-weight: 800; color: #1c1917; letter-spacing: -0.02em; line-height: 1.15;">
                                  ${escapeHtml(brandName)}
                                </span>
                                <span class="email-brand-sub" style="display: block; font-size: 11.5px; font-weight: 600; color: #716b66; letter-spacing: 0.02em; margin-top: 2px;">
                                  ${escapeHtml(subtitle)}
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Main Content Body -->
                <tr>
                  <td class="email-body" style="padding: 32px 36px 30px 36px; color: #57534e; font-size: 15.5px; line-height: 1.65;">
                    
                    ${
                      eyebrow
                        ? `<div class="email-eyebrow" style="display: inline-block; background-color: #ffe4e6; color: ${brandColor}; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; margin-bottom: 14px;">
                            ${escapeHtml(eyebrow)}
                          </div>`
                        : ''
                    }

                    <h1 class="email-title" style="margin: 0 0 18px 0; font-size: 23px; font-weight: 800; color: #1c1917; letter-spacing: -0.03em; line-height: 1.25;">
                      ${escapeHtml(title)}
                    </h1>
                    
                    <div style="margin-bottom: 20px;">
                      ${contentHtml}
                    </div>

                    ${detailsHtml}

                    ${
                      calloutBox
                        ? `
                    <div class="email-callout" style="background-color: ${calloutBg}; border: 1px solid ${calloutBorder}; border-left: 4px solid ${calloutAccent}; border-radius: 12px; padding: 14px 18px; margin: 22px 0;">
                      ${
                        calloutBox.title
                          ? `<p class="email-callout-title" style="margin: 0 0 4px 0; font-size: 13.5px; font-weight: 700; color: #1c1917;">${escapeHtml(
                              calloutBox.title
                            )}</p>`
                          : ''
                      }
                      <p class="email-callout-text" style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #57534e;">${escapeHtml(
                        calloutBox.text
                      )}</p>
                    </div>
                    `
                        : ''
                    }

                    ${
                      ctaText && ctaUrl
                        ? `
                    <!-- Pill CTA Buttons -->
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 22px 0;">
                      <tr>
                        <td align="left" style="border-radius: 9999px; background-color: ${brandColor};">
                          <a href="${escapeHtml(ctaUrl)}" target="_blank" style="display: inline-block; padding: 13px 26px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 9999px; letter-spacing: -0.01em;">
                            ${escapeHtml(ctaText)} &nbsp;&rarr;
                          </a>
                        </td>
                        ${
                          secondaryCtaText && secondaryCtaUrl
                            ? `
                        <td style="width: 12px;"></td>
                        <td align="left" style="border-radius: 9999px; border: 1px solid #d6d3d0; background-color: #ffffff;">
                          <a href="${escapeHtml(secondaryCtaUrl)}" target="_blank" style="display: inline-block; padding: 12px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #1c1917; text-decoration: none; border-radius: 9999px; letter-spacing: -0.01em;">
                            ${escapeHtml(secondaryCtaText)}
                          </a>
                        </td>`
                            : ''
                        }
                      </tr>
                    </table>

                    <!-- Fallback Link Block -->
                    <div class="email-link-box" style="background-color: #fafaf9; border: 1px solid #e4e1de; border-radius: 12px; padding: 12px 16px; margin: 20px 0 0 0;">
                      <p style="margin: 0 0 4px 0; font-size: 11.5px; font-weight: 600; color: #716b66; text-transform: uppercase; letter-spacing: 0.04em;">
                        Button funktioniert nicht? Direktlink:
                      </p>
                      <p style="margin: 0; font-size: 12px; line-height: 1.4; word-break: break-all;">
                        <a href="${escapeHtml(ctaUrl)}" style="color: ${brandColor}; text-decoration: underline;">${escapeHtml(
                            ctaUrl
                          )}</a>
                      </p>
                    </div>
                    `
                        : ''
                    }

                    <div class="email-divider" style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #eceae7; font-size: 14px; color: #716b66; line-height: 1.5;">
                      Herzliche Grüsse<br>
                      <strong class="email-signature" style="color: #1c1917;">${escapeHtml(signature)}</strong>
                    </div>

                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td class="email-footer" style="padding: 22px 36px; background-color: #fafaf9; border-top: 1px solid #eceae7; color: #716b66; font-size: 12px; line-height: 1.6;">
                    ${
                      footerNote
                        ? `<p class="email-footer-note" style="margin: 0 0 10px 0; color: #57534e; font-size: 12.5px;">${escapeHtml(
                            footerNote
                          )}</p>`
                        : ''
                    }
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" valign="middle">
                          <p style="margin: 0;">
                            &copy; ${new Date().getFullYear()} <strong>${escapeHtml(brandName)}</strong> &bull;
                            <a href="https://${org.domain}" style="color: #716b66; text-decoration: underline;">${org.domain}</a>
                            &bull;
                            <a href="https://hilfe.${org.domain}" style="color: #716b66; text-decoration: underline;">Hilfe</a>
                            ${
                              unsubscribeUrl
                                ? ` &bull; <a href="${escapeHtml(unsubscribeUrl)}" style="color: #716b66; text-decoration: underline;">${escapeHtml(
                                    unsubscribeLabel || 'Benachrichtigungen verwalten'
                                  )}</a>`
                                : ''
                            }
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Basis-E-Mail-Versandfunktion mit Anti-Spam-Headern, sauberem Text-Fallback,
 * Multi-SMTP-Transporter-Auswahl und Entwicklungs-Präfix.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  fromName,
  unsubscribeUrl,
  autoSubmitted = true,
  icalEvent,
  kind = 'OTHER',
  organization,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Antworten gehen an diese Adresse statt an den Absender */
  replyTo?: string;
  /** Anzeigename im From-Header (z. B. «Chilbi Illnau – Cevi Schichtplan») */
  fromName?: string;
  /** URL für den List-Unsubscribe-Header (wichtig für Gmail/Yahoo/Bluewin) */
  unsubscribeUrl?: string;
  /** Setzt Auto-Submitted: auto-generated (verhindert Out-of-Office-Schleifen bei Systemmails) */
  autoSubmitted?: boolean;
  /** Optionale .ics-Kalenderdatei (für native Termin-Vorschau im Mail-Client) */
  icalEvent?: {
    filename?: string;
    method?: 'PUBLISH' | 'REQUEST';
    content: string;
  };
  /** Art der Mail, nur für die Statistik */
  kind?: MailKind;
  /** Optionale Organisation für passenden SMTP-Transporter & Absenderadresse */
  organization?: OrganizationType | string;
}): Promise<boolean> {
  const orgType = normalizeOrganizationType(organization);
  const smtpConfig = getSmtpConfig(orgType);
  const plainText = text?.trim() ? text.trim() : htmlToPlainText(html);
  const formattedFrom = formatFromHeader(fromName, smtpConfig.from);
  const finalSubject = formatEmailSubject(subject);

  const headers: Record<string, string> = {};
  if (autoSubmitted) {
    headers['Auto-Submitted'] = 'auto-generated';
    headers['X-Auto-Response-Suppress'] = 'All';
  }
  if (unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
  }

  if (!smtpConfig.pass) {
    console.warn('\n[Mail-Dev / Mock] Kein SMTP_PASSWORD für %s gesetzt. E-Mail wird geloggt:', safeLog(orgType));
    console.warn('Von:       %s', safeLog(formattedFrom));
    console.warn('Empfänger: %s', safeLog(to));
    console.warn('Betreff:   %s', safeLog(finalSubject));
    console.warn('Text:      %s\n', safeLog(plainText));
    return true; // Im Dev-Modus ohne SMTP als Erfolg werten, damit Flows getestet werden können
  }

  try {
    const transporter = getMailTransporter(orgType);
    const info = await transporter.sendMail({
      from: formattedFrom,
      to,
      subject: finalSubject,
      text: plainText,
      html,
      replyTo,
      headers,
      icalEvent: icalEvent
        ? {
            filename: icalEvent.filename || 'schicht.ics',
            method: icalEvent.method || 'PUBLISH',
            content: icalEvent.content,
          }
        : undefined,
    });
    console.log('[Mail (%s)] Gesendet an %s (ID: %s)', safeLog(orgType), safeLog(to), safeLog(info.messageId));
    trackUsage('MAIL_SENT', { dim: kind });
    return true;
  } catch (error) {
    console.error('[Mail (%s)] Fehler beim Senden an %s:', safeLog(orgType), safeLog(to), error);
    trackUsage('MAIL_FAILED', { dim: kind });
    return false;
  }
}

// -----------------------------------------------------------------------------
// Vordefinierte E-Mail-Funktionen für App-Events
// -----------------------------------------------------------------------------

/**
 * 1. E-Mail-Adresse bestätigen (Verifizierungslink)
 */
export async function sendVerificationEmail({
  to,
  name,
  verificationUrl,
  expiresHours = 24,
  deletesUnconfirmed = false,
  organization,
}: {
  to: string;
  name?: string | null;
  verificationUrl: string;
  expiresHours?: number;
  /** Hinweis, dass das Konto ohne Bestätigung gelöscht wird (neue Passwort-Konten) */
  deletesUnconfirmed?: boolean;
  /** Organisation für passendes Branding & SMTP-Absender */
  organization?: OrganizationType;
}): Promise<boolean> {
  const org = getOrganization(organization);
  const defaultGreeting = getDefaultGreeting(org.slug);
  const displayName = name?.trim() ? name.trim() : defaultGreeting;
  const subject = `Bestätige deine E-Mail-Adresse – ${org.name}`;
  const eyebrow = 'Konto-Aktivierung';
  const title = `Willkommen beim ${org.name}!`;
  const preheader = 'Bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.';

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong class="email-signature" style="color: #1c1917;">${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">schön, dass du dabei bist! Bitte bestätige kurz deine E-Mail-Adresse, damit wir dir Erinnerungen zu deinen Schichten und Infos vom OK schicken können:</p>
  `;

  // Neues Passwort-Konto: ohne Bestätigung wird es nach Ablauf des Links gelöscht (services/unverifiedAccounts.ts)
  const deleteNote = deletesUnconfirmed ? ' Ohne Bestätigung löschen wir das Konto danach wieder.' : '';
  const calloutBox = {
    title: 'Sicherheitshinweis',
    text: `Dieser Bestätigungslink ist ${expiresHours} Stunden gültig.${deleteNote} Falls du diese Adresse nicht selbst eingetragen hast, kannst du diese E-Mail einfach ignorieren.`,
    tone: 'info' as const,
  };

  const html = renderEmailTemplate({
    preheader,
    eyebrow,
    title,
    contentHtml,
    calloutBox,
    ctaText: 'E-Mail-Adresse bestätigen',
    ctaUrl: verificationUrl,
    footerNote: `Du erhältst diese E-Mail, weil deine Adresse bei einem Konto auf ${org.domain} hinterlegt wurde.`,
    organization: org.slug,
  });

  const text = `Hallo ${displayName},\n\nWillkommen beim ${org.name}!\n\nBitte öffne den folgenden Link in deinem Browser, um deine E-Mail-Adresse zu bestätigen:\n${verificationUrl}\n\nDieser Link ist ${expiresHours} Stunden gültig.${deleteNote}\n\nFalls du diese Adresse nicht selbst eingetragen hast, kannst du diese Nachricht ignorieren.\n\nHerzliche Grüsse\nDein ${org.name} Team\nhttps://${org.domain}`;

  return sendEmail({
    to,
    subject,
    html,
    text,
    organization: org.dbType,
    kind: 'VERIFICATION',
  });
}

/**
 * 2. Passwort zurücksetzen
 */
export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
  expiresHours = 2,
  organization,
}: {
  to: string;
  name?: string | null;
  resetUrl: string;
  expiresHours?: number;
  /** Organisation für passendes Branding & SMTP-Absender */
  organization?: OrganizationType;
}): Promise<boolean> {
  const org = getOrganization(organization);
  const defaultGreeting = getDefaultGreeting(org.slug);
  const displayName = name?.trim() ? name.trim() : defaultGreeting;
  const subject = `Passwort zurücksetzen – ${org.name}`;
  const eyebrow = 'Sicherheit';
  const title = 'Neues Passwort festlegen';
  const preheader = `Setze dein Passwort für den ${org.name} zurück.`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong class="email-signature" style="color: #1c1917;">${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">du hast angefordert, das Passwort für dein Konto beim ${escapeHtml(org.name)} zurückzusetzen.</p>
    <p style="margin: 0;">Klicke auf den Button unten, um ein neues Passwort zu wählen:</p>
  `;

  const calloutBox = {
    title: 'Wichtiger Hinweis',
    text: `Dieser Link ist ${expiresHours} Stunden gültig. Wenn du diese Anfrage nicht selbst gestellt hast, bleibt dein bisheriges Passwort unverändert.`,
    tone: 'warning' as const,
  };

  const footerNote =
    org.authProviderShort && org.authProviderShort !== 'E-Mail'
      ? `Tipp: Mit einem ${org.authProviderShort}-Konto kannst du dich auch jederzeit direkt ohne separates Passwort anmelden.`
      : undefined;

  const html = renderEmailTemplate({
    preheader,
    eyebrow,
    title,
    contentHtml,
    calloutBox,
    ctaText: 'Neues Passwort wählen',
    ctaUrl: resetUrl,
    footerNote,
    organization: org.slug,
  });

  const text = `Hallo ${displayName},\n\nÖffne folgenden Link, um ein neues Passwort für den ${org.name} festzulegen:\n${resetUrl}\n\nDieser Link ist ${expiresHours} Stunden gültig. Falls du diese Anfrage nicht selbst gestellt hast, bleibt dein bisheriges Passwort unverändert.\n\nHerzliche Grüsse\nDein ${org.name} Team\nhttps://${org.domain}`;

  return sendEmail({
    to,
    subject,
    html,
    text,
    organization: org.dbType,
    kind: 'PASSWORD_RESET',
  });
}

/**
 * Registrierung mit einer E-Mail, zu der es schon ein Konto gibt. Die Antwort im Browser ist dieselbe wie
 * bei einem neuen Konto (sonst liesse sich prüfen, wer ein Konto hat); Bescheid bekommt nur die Adresse.
 */
export async function sendAccountExistsEmail({
  to,
  name,
  loginUrl,
  resetUrl,
  organization,
}: {
  to: string;
  name?: string | null;
  loginUrl: string;
  resetUrl: string;
  /** Organisation für passendes Branding & SMTP-Absender */
  organization?: OrganizationType;
}): Promise<boolean> {
  const org = getOrganization(organization);
  const defaultGreeting = getDefaultGreeting(org.slug);
  const displayName = name?.trim() ? name.trim() : defaultGreeting;
  const subject = `Du hast schon ein Konto – ${org.name}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong class="email-signature" style="color: #1c1917;">${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">jemand wollte mit dieser E-Mail-Adresse ein neues Konto beim ${escapeHtml(org.name)} anlegen. Zu deiner Adresse gibt es aber bereits ein Konto.</p>
    <p style="margin: 0;">Melde dich einfach an. Falls du dein Passwort nicht mehr weisst, kannst du es <a href="${escapeHtml(resetUrl)}" style="text-decoration: underline; font-weight: 600;">hier zurücksetzen</a>.</p>
  `;

  const html = renderEmailTemplate({
    preheader: 'Zu deiner E-Mail-Adresse gibt es schon ein Konto.',
    eyebrow: 'Konto-Hinweis',
    title: 'Du hast schon ein Konto',
    contentHtml,
    calloutBox: {
      title: 'Warst das nicht du?',
      text: 'Dann kannst du diese E-Mail ignorieren. An deinem Konto hat sich nichts geändert.',
      tone: 'info' as const,
    },
    ctaText: 'Jetzt anmelden',
    ctaUrl: loginUrl,
    organization: org.slug,
  });

  const text = `Hallo ${displayName},\n\njemand wollte mit dieser E-Mail-Adresse ein neues Konto anlegen. Du hast aber schon eines.\n\nAnmelden: ${loginUrl}\nPasswort vergessen: ${resetUrl}\n\nWarst das nicht du? Dann ignoriere diese E-Mail. An deinem Konto hat sich nichts geändert.\n\nHerzliche Grüsse\nDein ${org.name} Team`;

  return sendEmail({
    to,
    subject,
    html,
    text,
    organization: org.dbType,
    kind: 'ACCOUNT_EXISTS',
  });
}

/**
 * 3. Schicht-Erinnerung (mit frei wählbarer Vorlaufzeit & optionalem OK-Hinweis)
 */
export async function sendShiftReminderEmail({
  to,
  name,
  eventTitle,
  shiftTitle,
  timeRangeFormatted,
  shiftUrl,
  departmentName,
  accentColor,
  category,
  startTime,
  endTime,
  shiftId,
  leadMinutes,
  reminderNote,
  isResponsible = false,
  isGuest = false,
  organization,
}: {
  to: string;
  name?: string | null;
  eventTitle: string;
  shiftTitle: string;
  timeRangeFormatted: string;
  shiftUrl?: string;
  departmentName?: string;
  accentColor?: string | null;
  category?: string | null;
  startTime?: Date;
  endTime?: Date;
  shiftId?: string;
  /** Vorlaufzeit der Erinnerung in Minuten (z. B. 60, 120, 1440) */
  leadMinutes?: number;
  /** Optionaler Hinweis vom OK (z. B. Treffpunkt, Check-in, Kleidung) */
  reminderNote?: string | null;
  /** Ist die Person als Schichtleitung eingeteilt? */
  isResponsible?: boolean;
  /** Anmeldung als Gast ohne Benutzerkonto */
  isGuest?: boolean;
  /** Organisation für passendes Branding & SMTP-Absender */
  organization?: OrganizationType;
}): Promise<boolean> {
  const org = getOrganization(organization);
  const defaultGreeting = getDefaultGreeting(org.slug);
  const displayName = name?.trim() ? name.trim() : defaultGreeting;
  const leadLabel =
    leadMinutes !== undefined
      ? leadMinutes < 60
        ? `in ${leadMinutes} Minuten`
        : leadMinutes === 60
          ? 'in 1 Stunde'
          : leadMinutes < 1440
            ? `in ${Math.round(leadMinutes / 60)} Stunden`
            : leadMinutes === 1440
              ? 'in 24 Stunden'
              : leadMinutes === 2880
                ? 'in 2 Tagen'
                : leadMinutes === 10080
                  ? 'in 1 Woche'
                  : `in ${Math.round(leadMinutes / 1440)} Tagen`
      : 'bald';

  const subject = `Erinnerung: Deine Schicht «${shiftTitle}» beginnt ${leadLabel} (${eventTitle})`;
  const eyebrow = isResponsible ? 'Schichtleitung · Erinnerung' : 'Einsatz-Erinnerung';
  const title = leadMinutes !== undefined ? `Deine Schicht beginnt ${leadLabel}!` : 'Deine Schicht steht bevor!';
  const preheader = `Dein Einsatz «${shiftTitle}» bei ${eventTitle} beginnt ${leadLabel} (${timeRangeFormatted}).`;
  const profileUrl = `https://${org.domain}/profil`;

  const cleanNote = reminderNote?.trim() || null;
  const noteBlockHtml = cleanNote
    ? `
    <div class="email-callout" style="background-color: #f4f7f4; border: 1px solid #d5e3d6; border-left: 4px solid ${
      accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#2d5a3c'
    }; border-radius: 12px; padding: 16px 18px; margin: 20px 0;">
      <p class="email-callout-title" style="margin: 0 0 6px 0; font-size: 13.5px; font-weight: 700; color: #1c1917;">Hinweis vom OK (${escapeHtml(
        eventTitle
      )})</p>
      <p class="email-callout-text" style="margin: 0; font-size: 14px; line-height: 1.55; color: #3f3c39; white-space: pre-line;">${escapeHtml(
        cleanNote
      )}</p>
    </div>`
    : '';

  const roleSentence = isResponsible
    ? `Zur Erinnerung: ${leadLabel === 'bald' ? 'Bald' : `In Kürze (${leadLabel})`} beginnt deine Schicht als <strong class="email-signature" style="color: #1c1917;">Schichtleitung</strong> beim Anlass <strong class="email-signature" style="color: #1c1917;">${escapeHtml(eventTitle)}</strong>:`
    : `Zur Erinnerung: ${leadLabel === 'bald' ? 'Bald' : `In Kürze (${leadLabel})`} beginnt deine Schicht beim Anlass <strong class="email-signature" style="color: #1c1917;">${escapeHtml(eventTitle)}</strong>:`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong class="email-signature" style="color: #1c1917;">${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0;">vielen Dank für deinen Einsatz! ${roleSentence}</p>
    ${noteBlockHtml}
  `;

  const details: EmailDetailRow[] = [
    { label: 'Anlass', value: eventTitle },
    ...(departmentName ? [{ label: 'Abteilung', value: departmentName }] : []),
    { label: isResponsible ? 'Schicht (Leitung)' : 'Schicht', value: shiftTitle, highlight: true },
    ...(category ? [{ label: 'Bereich', value: category }] : []),
    { label: 'Zeit', value: timeRangeFormatted },
  ];

  const googleCalendarUrl =
    startTime && endTime
      ? buildGoogleCalendarUrl({
          title: `${shiftTitle} (${eventTitle})`,
          startTime,
          endTime,
          description: `Schicht: ${shiftTitle}\nAnlass: ${eventTitle}${departmentName ? `\nAbteilung: ${departmentName}` : ''}${cleanNote ? `\nHinweis: ${cleanNote}` : ''}${shiftUrl ? `\n${shiftUrl}` : ''}`,
          location: departmentName || undefined,
        })
      : undefined;

  const calloutBox = isGuest
    ? {
        title: 'Kurzfristig verhindert?',
        text: 'Melde dich bitte direkt beim OK des Anlasses oder der Abteilungsleitung, damit deine Schicht neu vergeben werden kann.',
        tone: 'neutral' as const,
      }
    : {
        title: 'Kurzfristig verhindert?',
        text: 'Öffne den Schichtplan und klicke bei deiner Schicht auf «Ersatz suchen», damit jemand deinen Platz übernehmen kann.',
        tone: 'neutral' as const,
      };

  const footerNote = isGuest
    ? `Du erhältst diese Erinnerung für deine Helfer-Eintragung bei «${eventTitle}».`
    : leadMinutes !== undefined
      ? `Du erhältst diese Erinnerung gemäss deinen Einstellungen (${leadLabel.replace(/^in /, '')} vor Schichtbeginn).`
      : 'Du erhältst diese Erinnerung vor Beginn deiner eingetragenen Schicht.';

  const unsubscribeUrl = isGuest ? undefined : profileUrl;
  const unsubscribeLabel = isGuest ? undefined : 'Erinnerungen im Profil anpassen';

  const html = renderEmailTemplate({
    preheader,
    eyebrow,
    title,
    contentHtml,
    details,
    calloutBox,
    ctaText: shiftUrl ? 'Zum Schichtplan' : undefined,
    ctaUrl: shiftUrl,
    secondaryCtaText: googleCalendarUrl ? '📅 Zu Google Kalender' : undefined,
    secondaryCtaUrl: googleCalendarUrl,
    headerSubtitle: departmentName || undefined,
    accentColor,
    footerNote,
    unsubscribeUrl,
    unsubscribeLabel,
    organization: org.slug,
  });

  const textLines = [
    `Hallo ${displayName},`,
    '',
    `vielen Dank für deinen Einsatz! Deine Schicht beginnt ${leadLabel}:`,
    '',
    `• Anlass: ${eventTitle}`,
    ...(departmentName ? [`• Abteilung: ${departmentName}`] : []),
    `• Schicht: ${shiftTitle}${isResponsible ? ' (Schichtleitung)' : ''}`,
    ...(category ? [`• Bereich: ${category}`] : []),
    `• Zeit: ${timeRangeFormatted}`,
    ...(cleanNote ? ['', `Hinweis vom OK (${eventTitle}):`, cleanNote] : []),
    ...(shiftUrl ? ['', `Zum Schichtplan: ${shiftUrl}`] : []),
    ...(googleCalendarUrl ? [`Zu Google Kalender: ${googleCalendarUrl}`] : []),
    '',
    ...(isGuest
      ? ['Kurzfristig verhindert? Bitte melde dich direkt beim OK des Anlasses oder der Abteilungsleitung.']
      : [
          'Kurzfristig verhindert? Öffne den Schichtplan und klicke bei deiner Schicht auf «Ersatz suchen».',
          '',
          `Erinnerungen anpassen: ${profileUrl}`,
        ]),
    '',
    'Herzliche Grüsse',
    departmentName || `Dein ${org.name} Team`,
  ];

  const icsContent =
    startTime && endTime
      ? buildShiftIcsAttachment({
          uid: `reminder-${shiftId || startTime.getTime()}@${org.domain}`,
          shiftTitle,
          eventTitle,
          departmentName,
          startTime,
          endTime,
          shiftUrl,
          organization: org.dbType,
        })
      : undefined;

  return sendEmail({
    to,
    subject,
    html,
    text: textLines.join('\n'),
    fromName: departmentName ? `${eventTitle} (${departmentName})` : `${eventTitle} – ${org.name}`,
    unsubscribeUrl,
    icalEvent: icsContent ? { filename: 'schicht.ics', method: 'PUBLISH', content: icsContent } : undefined,
    kind: 'SHIFT_REMINDER',
    organization: org.dbType,
  });
}

/**
 * 4. Schicht abgesagt: Eine Schicht wurde gelöscht, eingetragene Personen werden informiert.
 */
export async function sendShiftCancelledEmail({
  to,
  name,
  eventTitle,
  shiftTitle,
  timeRangeFormatted,
  eventUrl,
  departmentName,
  accentColor,
  organization,
}: {
  to: string;
  name?: string | null;
  eventTitle: string;
  shiftTitle: string;
  timeRangeFormatted: string;
  eventUrl?: string;
  departmentName?: string;
  accentColor?: string | null;
  organization?: OrganizationType;
}): Promise<boolean> {
  const org = getOrganization(organization);
  const defaultGreeting = getDefaultGreeting(org.slug);
  const displayName = name?.trim() ? name.trim() : defaultGreeting;
  const subject = `Schicht abgesagt: «${shiftTitle}» (${eventTitle})`;
  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong class="email-signature" style="color: #1c1917;">${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0;">die Schicht <strong class="email-signature" style="color: #1c1917;">«${escapeHtml(shiftTitle)}»</strong> beim Anlass <strong class="email-signature" style="color: #1c1917;">${escapeHtml(eventTitle)}</strong> wurde leider abgesagt und aus dem Schichtplan entfernt. Dein Einsatz für diese Schicht entfällt.</p>
  `;

  const details: EmailDetailRow[] = [
    { label: 'Anlass', value: eventTitle },
    ...(departmentName ? [{ label: 'Abteilung', value: departmentName }] : []),
    { label: 'Schicht', value: shiftTitle, highlight: true },
    { label: 'Ursprüngliche Zeit', value: timeRangeFormatted },
    { label: 'Status', value: 'Abgesagt / Entfällt' },
  ];

  const html = renderEmailTemplate({
    preheader: `Deine Schicht «${shiftTitle}» bei ${eventTitle} wurde abgesagt.`,
    eyebrow: 'Schicht abgesagt',
    title: 'Deine Schicht entfällt',
    contentHtml,
    details,
    calloutBox: {
      title: 'Was bedeutet das für dich?',
      text: 'Du musst zu dieser Schicht nicht antreten. Falls du stattdessen eine andere Schicht übernehmen möchtest, kannst du dich im Schichtplan neu eintragen.',
      tone: 'warning',
    },
    ctaText: eventUrl ? 'Zum Schichtplan' : undefined,
    ctaUrl: eventUrl,
    headerSubtitle: departmentName || undefined,
    accentColor,
    footerNote: `Du erhältst diese Benachrichtigung, weil du für diese Schicht bei «${eventTitle}» eingetragen warst.`,
    organization: org.slug,
  });

  const textLines = [
    `Hallo ${displayName},`,
    '',
    `die Schicht «${shiftTitle}» (${timeRangeFormatted}) beim Anlass «${eventTitle}» wurde leider abgesagt und aus dem Schichtplan entfernt. Dein Einsatz für diese Schicht entfällt.`,
    '',
    `• Anlass: ${eventTitle}`,
    ...(departmentName ? [`• Abteilung: ${departmentName}`] : []),
    `• Schicht: ${shiftTitle}`,
    `• Zeit: ${timeRangeFormatted}`,
    '• Status: Abgesagt / Entfällt',
    '',
    'Was bedeutet das für dich? Du musst zu dieser Schicht nicht antreten. Falls du stattdessen eine andere Schicht übernehmen möchtest, kannst du dich im Schichtplan neu eintragen.',
    ...(eventUrl ? ['', `Zum Schichtplan: ${eventUrl}`] : []),
    '',
    'Herzliche Grüsse',
    departmentName || `Dein ${org.name} Team`,
  ];

  return sendEmail({
    to,
    subject,
    html,
    text: textLines.join('\n'),
    fromName: departmentName ? `${eventTitle} (${departmentName})` : `${eventTitle} – ${org.name}`,
    kind: 'SHIFT_CANCELLED',
    organization: org.dbType,
  });
}

/**
 * «Ersatz gefunden»: Die Person, die «Ersatz gesucht» gesetzt hat, ist nicht mehr eingetragen.
 */
export async function sendReplacementTakenEmail({
  to,
  name,
  takenBy,
  eventTitle,
  shiftTitle,
  timeRangeFormatted,
  eventUrl,
  departmentName,
  accentColor,
  organization,
}: {
  to: string;
  name?: string | null;
  takenBy: string;
  eventTitle: string;
  shiftTitle: string;
  timeRangeFormatted: string;
  eventUrl?: string;
  departmentName?: string;
  accentColor?: string | null;
  organization?: OrganizationType;
}): Promise<boolean> {
  const org = getOrganization(organization);
  const defaultGreeting = getDefaultGreeting(org.slug);
  const displayName = name?.trim() ? name.trim() : defaultGreeting;
  const subject = `Ersatz gefunden: «${shiftTitle}» (${eventTitle})`;
  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong class="email-signature" style="color: #1c1917;">${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0;">gute Neuigkeiten: <strong class="email-signature" style="color: #1c1917;">${escapeHtml(takenBy)}</strong> hat deine Schicht übernommen. Du bist dafür nicht mehr eingetragen.</p>
  `;

  const details: EmailDetailRow[] = [
    { label: 'Anlass', value: eventTitle },
    ...(departmentName ? [{ label: 'Abteilung', value: departmentName }] : []),
    { label: 'Schicht', value: shiftTitle, highlight: true },
    { label: 'Zeit', value: timeRangeFormatted },
    { label: 'Übernommen von', value: takenBy },
  ];

  const html = renderEmailTemplate({
    preheader: `${takenBy} hat deine Schicht «${shiftTitle}» bei ${eventTitle} übernommen.`,
    eyebrow: 'Ersatz gefunden',
    title: 'Deine Schicht wurde übernommen',
    contentHtml,
    details,
    ctaText: eventUrl ? 'Zum Schichtplan' : undefined,
    ctaUrl: eventUrl,
    headerSubtitle: departmentName || undefined,
    accentColor,
    footerNote: `Du erhältst diese Mail, weil du für deine Schicht bei «${eventTitle}» einen Ersatz gesucht hast.`,
    organization: org.slug,
  });

  const text = [
    `Hallo ${displayName},`,
    '',
    `gute Neuigkeiten: ${takenBy} hat deine Schicht übernommen. Du bist dafür nicht mehr eingetragen.`,
    '',
    `• Anlass: ${eventTitle}`,
    ...(departmentName ? [`• Abteilung: ${departmentName}`] : []),
    `• Schicht: ${shiftTitle}`,
    `• Zeit: ${timeRangeFormatted}`,
    `• Übernommen von: ${takenBy}`,
    ...(eventUrl ? ['', `Zum Schichtplan: ${eventUrl}`] : []),
    '',
    'Herzliche Grüsse',
    `Dein ${org.name} Team`,
  ].join('\n');

  return sendEmail({
    to,
    subject,
    html,
    text,
    fromName: departmentName ? `${eventTitle} (${departmentName})` : `${eventTitle} – ${org.name}`,
    kind: 'REPLACEMENT_TAKEN',
    organization: org.dbType,
  });
}

/**
 * 4. Allgemeine Benachrichtigung / Info-Mail
 */
export async function sendGenericEmail({
  to,
  subject,
  eyebrow,
  title,
  messageHtml,
  details,
  ctaText,
  ctaUrl,
  preheader,
  footerNote,
  organization,
}: {
  to: string;
  subject: string;
  eyebrow?: string;
  title: string;
  messageHtml: string;
  details?: EmailDetailRow[];
  ctaText?: string;
  ctaUrl?: string;
  preheader?: string;
  footerNote?: string;
  organization?: OrganizationType;
}): Promise<boolean> {
  const org = getOrganization(organization);
  const html = renderEmailTemplate({
    preheader: preheader || subject,
    eyebrow,
    title,
    contentHtml: messageHtml,
    details,
    ctaText,
    ctaUrl,
    footerNote,
    organization: org.slug,
  });

  return sendEmail({ to, subject, html, organization: org.dbType, kind: 'ADMIN_NOTICE' });
}
