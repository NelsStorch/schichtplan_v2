import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST || 'mail.infomaniak.com';
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER || 'admin@cevi-schichtplan.ch';
const pass = process.env.SMTP_PASSWORD || '';
const from = process.env.SMTP_FROM || 'Cevi Schichtplan <admin@cevi-schichtplan.ch>';

// Infomaniak: Port 587 uses STARTTLS (secure: false), Port 465 uses SSL/TLS (secure: true)
const isSecure = port === 465;

export const mailTransporter = nodemailer.createTransport({
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

/**
 * Universeller HTML-E-Mail-Renderer im Cevi-Schichtplan Design.
 * Kompatibel mit allen gängigen E-Mail-Clients (Gmail, Outlook, Apple Mail, Webmailer).
 */
export function renderEmailTemplate({
  preheader,
  title,
  contentHtml,
  ctaText,
  ctaUrl,
  footerNote,
}: {
  preheader?: string;
  title: string;
  contentHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const brandColor = '#e11d48';

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    a { color: ${brandColor}; text-decoration: underline; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  ${
    preheader
      ? `<div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">${escapeHtml(
          preheader
        )}</div>`
      : ''
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #f1f5f9; background-color: #ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
                      <span style="color: ${brandColor}; margin-right: 6px;">●</span>Cevi Schichtplan
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px; color: #334155; font-size: 15px; line-height: 1.6;">
              <h1 style="margin: 0 0 18px 0; font-size: 21px; font-weight: 700; color: #0f172a; letter-spacing: -0.015em; line-height: 1.3;">
                ${escapeHtml(title)}
              </h1>
              
              <div style="margin-bottom: 24px;">
                ${contentHtml}
              </div>

              ${
                ctaText && ctaUrl
                  ? `
              <div style="margin: 32px 0 24px 0; text-align: left;">
                <a href="${escapeHtml(ctaUrl)}" style="background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 13px 26px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(225, 29, 72, 0.2);">
                  ${escapeHtml(ctaText)}
                </a>
              </div>
              <p style="margin: 24px 0 0 0; font-size: 13px; color: #64748b; line-height: 1.5; word-break: break-all;">
                Falls der Button nicht funktioniert, öffne diesen Link im Browser:<br>
                <a href="${escapeHtml(ctaUrl)}" style="color: ${brandColor}; font-size: 12px;">${escapeHtml(ctaUrl)}</a>
              </p>
              `
                  : ''
              }
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; color: #94a3b8; font-size: 12px; line-height: 1.5;">
              ${footerNote ? `<p style="margin: 0 0 8px 0; color: #64748b;">${escapeHtml(footerNote)}</p>` : ''}
              <p style="margin: 0;">
                Diese E-Mail wurde automatisch von <strong>Cevi Schichtplan</strong> versendet.<br>
                <a href="https://cevi-schichtplan.ch" style="color: #64748b; text-decoration: none;">cevi-schichtplan.ch</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Basis-E-Mail-Versandfunktion mit Logging und sicherem Fallback für Development.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const plainText = text || html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();

  if (!pass) {
    console.warn(`\n[Mail-Dev / Mock] Kein SMTP_PASSWORD gesetzt. E-Mail wird geloggt:`);
    console.warn(`Empfänger: ${to}`);
    console.warn(`Betreff:   ${subject}`);
    console.warn(`Text:      ${plainText}\n`);
    return true; // Im Dev-Modus ohne SMTP als Erfolg werten, damit Flows getestet werden können
  }

  try {
    const info = await mailTransporter.sendMail({
      from,
      to,
      subject,
      text: plainText,
      html,
    });
    console.log(`[Mail] Gesendet an ${to} (ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`[Mail] Fehler beim Senden an ${to}:`, error);
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
  const subject = 'Bitte bestätige deine E-Mail-Adresse – Cevi Schichtplan';
  const title = 'E-Mail-Adresse bestätigen';
  const preheader = 'Aktiviere dein Cevi Schichtplan Konto.';

  const contentHtml = `
    <p style="margin: 0 0 14px 0;">Hallo <strong>${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 14px 0;">vielen Dank für deine Registrierung beim <strong>Cevi Schichtplan</strong>!</p>
    <p style="margin: 0 0 14px 0;">Bitte klicke auf den Button unten, um deine E-Mail-Adresse zu bestätigen und dein Konto zu aktivieren:</p>
  `;

  const footerNote = `Dieser Link ist ${expiresHours} Stunden gültig. Falls du kein Konto beim Cevi Schichtplan erstellt hast, kannst du diese Nachricht ignorieren.`;

  const html = renderEmailTemplate({
    preheader,
    title,
    contentHtml,
    ctaText: 'E-Mail-Adresse jetzt bestätigen',
    ctaUrl: verificationUrl,
    footerNote,
  });

  const text = `Hallo ${displayName},\n\nVielen Dank für deine Registrierung beim Cevi Schichtplan!\n\nBitte öffne den folgenden Link in deinem Browser, um deine E-Mail-Adresse zu bestätigen und dein Konto zu aktivieren:\n${verificationUrl}\n\nDieser Link ist ${expiresHours} Stunden gültig.\n\nFalls du kein Konto erstellt hast, kannst du diese Nachricht ignorieren.\n\nViele Grüsse,\nCevi Schichtplan`;

  return sendEmail({ to, subject, html, text });
}

/**
 * 2. Passwort zurücksetzen (für zukünftige Erweiterung)
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
  const title = 'Neues Passwort festlegen';
  const preheader = 'Setze dein Passwort für den Cevi Schichtplan zurück.';

  const contentHtml = `
    <p style="margin: 0 0 14px 0;">Hallo <strong>${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 14px 0;">wir haben eine Anfrage erhalten, das Passwort für dein Konto beim Cevi Schichtplan zurückzusetzen.</p>
    <p style="margin: 0 0 14px 0;">Klicke auf den Button unten, um ein neues Passwort festzulegen:</p>
  `;

  const footerNote = `Dieser Link ist ${expiresHours} Stunden gültig. Falls du dies nicht angefordert hast, bleibt dein bisheriges Passwort unverändert.`;

  const html = renderEmailTemplate({
    preheader,
    title,
    contentHtml,
    ctaText: 'Neues Passwort vergeben',
    ctaUrl: resetUrl,
    footerNote,
  });

  const text = `Hallo ${displayName},\n\nKlicke auf folgenden Link, um dein Passwort zurückzusetzen:\n${resetUrl}\n\nDieser Link ist ${expiresHours} Stunden gültig.\n\nCevi Schichtplan`;

  return sendEmail({ to, subject, html, text });
}

/**
 * 3. Schicht-Erinnerung (für zukünftige Erweiterung)
 */
export async function sendShiftReminderEmail({
  to,
  name,
  eventTitle,
  shiftTitle,
  timeRangeFormatted,
  shiftUrl,
}: {
  to: string;
  name?: string | null;
  eventTitle: string;
  shiftTitle: string;
  timeRangeFormatted: string;
  shiftUrl?: string;
}): Promise<boolean> {
  const displayName = name?.trim() ? name.trim() : 'Cevianer*in';
  const subject = `Erinnerung: Deine Schicht «${shiftTitle}» (${eventTitle})`;
  const title = 'Schicht-Erinnerung';
  const preheader = `Deine Schicht beginnt bald: ${shiftTitle}`;

  const contentHtml = `
    <p style="margin: 0 0 14px 0;">Hallo <strong>${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 14px 0;">dies ist eine kleine Erinnerung an deine bevorstehende Schicht:</p>
    <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0 0 6px 0;"><strong>Anlass:</strong> ${escapeHtml(eventTitle)}</p>
      <p style="margin: 0 0 6px 0;"><strong>Schicht:</strong> ${escapeHtml(shiftTitle)}</p>
      <p style="margin: 0;"><strong>Zeit:</strong> ${escapeHtml(timeRangeFormatted)}</p>
    </div>
    <p style="margin: 14px 0 0 0;">Vielen Dank für deinen geschätzten Einsatz!</p>
  `;

  const html = renderEmailTemplate({
    preheader,
    title,
    contentHtml,
    ctaText: shiftUrl ? 'Zum Schichtplan' : undefined,
    ctaUrl: shiftUrl,
  });

  return sendEmail({ to, subject, html });
}

/**
 * 4. Allgemeine Benachrichtigung / Info-Mail
 */
export async function sendGenericEmail({
  to,
  subject,
  title,
  messageHtml,
  ctaText,
  ctaUrl,
  preheader,
}: {
  to: string;
  subject: string;
  title: string;
  messageHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  preheader?: string;
}): Promise<boolean> {
  const html = renderEmailTemplate({
    preheader,
    title,
    contentHtml: messageHtml,
    ctaText,
    ctaUrl,
  });

  return sendEmail({ to, subject, html });
}
