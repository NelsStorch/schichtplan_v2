import nodemailer from 'nodemailer';
import type { MailKind } from '@schichtplan/shared';
import { escapeIcsText, foldIcsLine, formatIcsUtc } from './calendarFeed.js';
import { trackUsage } from './usageStats.js';

const host = process.env.SMTP_HOST || 'mail.infomaniak.com';
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER || 'admin@cevi-schichtplan.ch';
const pass = process.env.SMTP_PASSWORD || '';
const from = process.env.SMTP_FROM || 'Cevi Schichtplan <admin@cevi-schichtplan.ch>';

// Infomaniak: Port 587 uses STARTTLS (secure: false), Port 465 uses SSL/TLS (secure: true)
const isSecure = port === 465;

/**
 * SMTP-Transporter mit Connection-Pooling & Rate-Throttling:
 * Verhindert Verbindungs-Spikes und Rate-Limit-Sperren beim Massenversand (z. B. OK-Nachrichten).
 */
export const mailTransporter = nodemailer.createTransport({
  pool: true,
  maxConnections: 3,
  maxMessages: 100,
  rateDelta: 1000,
  rateLimit: 5,
  host,
  port,
  secure: isSecure,
  auth: pass
    ? {
        user,
        pass,
      }
    : undefined,
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
  },
});

export function isEmailConfigured(): boolean {
  return Boolean(pass);
}

export async function verifySmtpConnection(): Promise<boolean> {
  if (!pass) return false;
  try {
    await mailTransporter.verify();
    return true;
  } catch (error) {
    console.error('[Mail] SMTP-Verbindungstest fehlgeschlagen:', error);
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
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Baut den Absender-Header mit optionalem Anzeigenamen unter Beibehaltung der
 * authentifizierten E-Mail-Adresse (wichtig für SPF/DKIM/DMARC Alignment).
 */
export function formatFromHeader(customSenderName?: string, baseFrom: string = from): string {
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
 * Konvertiert HTML-Mails sauber in reinen Text (ohne CSS-Blöcke, XML oder HTML-Entities).
 * Verhindert hohe SpamAssassin-Scores (MPART_ALT_DIFF).
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<div[^>]*mso-hide:\s*all[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|tr|li)>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
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
}: {
  uid: string;
  shiftTitle: string;
  eventTitle: string;
  departmentName?: string;
  startTime: Date;
  endTime: Date;
  shiftUrl?: string;
  description?: string;
}): string {
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
    'PRODID:-//Cevi Schichtplan//DE',
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
  footerNote,
  headerSubtitle,
  signatureName,
  accentColor,
  unsubscribeUrl,
  unsubscribeLabel,
}: EmailTemplateOptions): string {
  const brandColor = accentColor && HEX_COLOR_RE.test(accentColor) ? accentColor : '#e11d48';
  const logoUrl = 'https://cevi-schichtplan.ch/images/cevi-logo.png';
  const subtitle = headerSubtitle?.trim() || 'Schweizer Plattform für Abteilungsanlässe';
  const signature = signatureName?.trim() || 'Dein Cevi Schichtplan Team';

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
                                <img src="${logoUrl}" width="38" height="38" alt="Cevi Logo" style="display: block; width: 38px; height: 38px; border-radius: 10px;" />
                              </td>
                              <td valign="middle">
                                <span class="email-brand-name" style="display: block; font-size: 17px; font-weight: 800; color: #1c1917; letter-spacing: -0.02em; line-height: 1.15;">
                                  Cevi Schichtplan
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
                    <!-- Pill CTA Button -->
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 22px 0;">
                      <tr>
                        <td align="left" style="border-radius: 9999px; background-color: ${brandColor};">
                          <a href="${escapeHtml(ctaUrl)}" target="_blank" style="display: inline-block; padding: 13px 30px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 9999px; letter-spacing: -0.01em;">
                            ${escapeHtml(ctaText)} &nbsp;&rarr;
                          </a>
                        </td>
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
                            &copy; ${new Date().getFullYear()} <strong>Cevi Schichtplan</strong> &bull;
                            <a href="https://cevi-schichtplan.ch" style="color: #716b66; text-decoration: underline;">cevi-schichtplan.ch</a>
                            &bull;
                            <a href="https://hilfe.cevi-schichtplan.ch" style="color: #716b66; text-decoration: underline;">Hilfe</a>
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
 * Basis-E-Mail-Versandfunktion mit Anti-Spam-Headern, sauberem Text-Fallback und Logging.
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
}): Promise<boolean> {
  const plainText = text?.trim() ? text.trim() : htmlToPlainText(html);
  const formattedFrom = formatFromHeader(fromName);

  const headers: Record<string, string> = {};
  if (autoSubmitted) {
    headers['Auto-Submitted'] = 'auto-generated';
    headers['X-Auto-Response-Suppress'] = 'All';
  }
  if (unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
  }

  if (!pass) {
    console.warn(`\n[Mail-Dev / Mock] Kein SMTP_PASSWORD gesetzt. E-Mail wird geloggt:`);
    console.warn(`Von:       ${formattedFrom}`);
    console.warn(`Empfänger: ${to}`);
    console.warn(`Betreff:   ${subject}`);
    console.warn(`Text:      ${plainText}\n`);
    return true; // Im Dev-Modus ohne SMTP als Erfolg werten, damit Flows getestet werden können
  }

  try {
    const info = await mailTransporter.sendMail({
      from: formattedFrom,
      to,
      subject,
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
    console.log(`[Mail] Gesendet an ${to} (ID: ${info.messageId})`);
    trackUsage('MAIL_SENT', { dim: kind });
    return true;
  } catch (error) {
    console.error(`[Mail] Fehler beim Senden an ${to}:`, error);
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
}: {
  to: string;
  name?: string | null;
  verificationUrl: string;
  expiresHours?: number;
}): Promise<boolean> {
  const displayName = name?.trim() ? name.trim() : 'Cevianer*in';
  const subject = 'Bestätige deine E-Mail-Adresse – Cevi Schichtplan';
  const eyebrow = 'Konto-Aktivierung';
  const title = 'Willkommen beim Cevi Schichtplan!';
  const preheader = 'Bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.';

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong class="email-signature" style="color: #1c1917;">${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">schön, dass du dabei bist! Bitte bestätige kurz deine E-Mail-Adresse, damit wir dir Erinnerungen zu deinen Schichten und Infos vom OK schicken können:</p>
  `;

  const calloutBox = {
    title: 'Sicherheitshinweis',
    text: `Dieser Bestätigungslink ist ${expiresHours} Stunden gültig. Falls du diese Adresse nicht selbst eingetragen hast, kannst du diese E-Mail einfach ignorieren.`,
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
    footerNote:
      'Du erhältst diese E-Mail, weil deine Adresse bei einem Konto auf cevi-schichtplan.ch hinterlegt wurde.',
  });

  const text = `Hallo ${displayName},\n\nWillkommen beim Cevi Schichtplan!\n\nBitte öffne den folgenden Link in deinem Browser, um deine E-Mail-Adresse zu bestätigen:\n${verificationUrl}\n\nDieser Link ist ${expiresHours} Stunden gültig.\n\nFalls du diese Adresse nicht selbst eingetragen hast, kannst du diese Nachricht ignorieren.\n\nHerzliche Grüsse\nDein Cevi Schichtplan Team\nhttps://cevi-schichtplan.ch`;

  return sendEmail({ to, subject, html, text, kind: 'VERIFICATION' });
}

/**
 * 2. Passwort zurücksetzen
 */
export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
  expiresHours = 2,
}: {
  to: string;
  name?: string | null;
  resetUrl: string;
  expiresHours?: number;
}): Promise<boolean> {
  const displayName = name?.trim() ? name.trim() : 'Cevianer*in';
  const subject = 'Passwort zurücksetzen – Cevi Schichtplan';
  const eyebrow = 'Sicherheit';
  const title = 'Neues Passwort festlegen';
  const preheader = 'Setze dein Passwort für den Cevi Schichtplan zurück.';

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong class="email-signature" style="color: #1c1917;">${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">du hast angefordert, das Passwort für dein Konto beim Cevi Schichtplan zurückzusetzen.</p>
    <p style="margin: 0;">Klicke auf den Button unten, um ein neues Passwort zu wählen:</p>
  `;

  const calloutBox = {
    title: 'Wichtiger Hinweis',
    text: `Dieser Link ist ${expiresHours} Stunden gültig. Wenn du diese Anfrage nicht selbst gestellt hast, bleibt dein bisheriges Passwort unverändert.`,
    tone: 'warning' as const,
  };

  const html = renderEmailTemplate({
    preheader,
    eyebrow,
    title,
    contentHtml,
    calloutBox,
    ctaText: 'Neues Passwort wählen',
    ctaUrl: resetUrl,
    footerNote: 'Tipp: Mit einem Cevi.DB-Konto kannst du dich auch jederzeit direkt ohne separates Passwort anmelden.',
  });

  const text = `Hallo ${displayName},\n\nÖffne folgenden Link, um ein neues Passwort für den Cevi Schichtplan festzulegen:\n${resetUrl}\n\nDieser Link ist ${expiresHours} Stunden gültig. Falls du diese Anfrage nicht selbst gestellt hast, bleibt dein bisheriges Passwort unverändert.\n\nHerzliche Grüsse\nDein Cevi Schichtplan Team\nhttps://cevi-schichtplan.ch`;

  return sendEmail({ to, subject, html, text, kind: 'PASSWORD_RESET' });
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
}: {
  to: string;
  name?: string | null;
  loginUrl: string;
  resetUrl: string;
}): Promise<boolean> {
  const displayName = name?.trim() ? name.trim() : 'Cevianer*in';
  const subject = 'Du hast schon ein Konto – Cevi Schichtplan';

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong class="email-signature" style="color: #1c1917;">${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">jemand wollte mit dieser E-Mail-Adresse ein neues Konto beim Cevi Schichtplan anlegen. Zu deiner Adresse gibt es aber bereits ein Konto.</p>
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
  });

  const text = `Hallo ${displayName},\n\njemand wollte mit dieser E-Mail-Adresse ein neues Konto anlegen. Du hast aber schon eines.\n\nAnmelden: ${loginUrl}\nPasswort vergessen: ${resetUrl}\n\nWarst das nicht du? Dann ignoriere diese E-Mail. An deinem Konto hat sich nichts geändert.\n\nHerzliche Grüsse\nDein Cevi Schichtplan Team`;

  return sendEmail({ to, subject, html, text, kind: 'ACCOUNT_EXISTS' });
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
}): Promise<boolean> {
  const displayName = name?.trim() ? name.trim() : 'Cevianer*in';
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
  const profileUrl = 'https://cevi-schichtplan.ch/profil';

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

  const html = renderEmailTemplate({
    preheader,
    eyebrow,
    title,
    contentHtml,
    details,
    calloutBox: {
      title: 'Kurzfristig verhindert?',
      text: 'Öffne den Schichtplan und klicke bei deiner Schicht auf «Ersatz suchen», damit jemand deinen Platz übernehmen kann.',
      tone: 'neutral',
    },
    ctaText: shiftUrl ? 'Zum Schichtplan' : undefined,
    ctaUrl: shiftUrl,
    headerSubtitle: departmentName || undefined,
    accentColor,
    footerNote:
      leadMinutes !== undefined
        ? `Du erhältst diese Erinnerung gemäss deinen Einstellungen (${leadLabel.replace(/^in /, '')} vor Schichtbeginn).`
        : 'Du erhältst diese Erinnerung vor Beginn deiner eingetragenen Schicht.',
    unsubscribeUrl: profileUrl,
    unsubscribeLabel: 'Erinnerungen im Profil anpassen',
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
    '',
    'Kurzfristig verhindert? Öffne den Schichtplan und klicke bei deiner Schicht auf «Ersatz suchen».',
    '',
    'Herzliche Grüsse',
    'Dein Cevi Schichtplan Team',
    `Erinnerungen anpassen: ${profileUrl}`,
  ];

  const icsContent =
    startTime && endTime
      ? buildShiftIcsAttachment({
          uid: `reminder-${shiftId || startTime.getTime()}@cevi-schichtplan.ch`,
          shiftTitle,
          eventTitle,
          departmentName,
          startTime,
          endTime,
          shiftUrl,
        })
      : undefined;

  return sendEmail({
    to,
    subject,
    html,
    text: textLines.join('\n'),
    fromName: departmentName ? `${eventTitle} (${departmentName})` : `${eventTitle} – Cevi Schichtplan`,
    unsubscribeUrl: profileUrl,
    icalEvent: icsContent ? { filename: 'schicht.ics', method: 'PUBLISH', content: icsContent } : undefined,
    kind: 'SHIFT_REMINDER',
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
}): Promise<boolean> {
  const displayName = name?.trim() ? name.trim() : 'Cevianer*in';
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
    'Dein Cevi Schichtplan Team',
  ].join('\n');

  return sendEmail({
    to,
    subject,
    html,
    text,
    fromName: departmentName ? `${eventTitle} (${departmentName})` : `${eventTitle} – Cevi Schichtplan`,
    kind: 'REPLACEMENT_TAKEN',
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
}): Promise<boolean> {
  const html = renderEmailTemplate({
    preheader: preheader || subject,
    eyebrow,
    title,
    contentHtml: messageHtml,
    details,
    ctaText,
    ctaUrl,
    footerNote,
  });

  return sendEmail({ to, subject, html, kind: 'ADMIN_NOTICE' });
}
