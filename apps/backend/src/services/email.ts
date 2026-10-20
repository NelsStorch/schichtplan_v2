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
 * High-End HTML-E-Mail-Renderer im modernen Cevi-Schichtplan Design.
 * - Echtes hochauflösendes Cevi-Logo im Kopfbereich
 * - Double-Bezel Card-Architektur mit Soft-Ambient-Schatten
 * - Farbkalibrierte Cevi-Akzente (#e11d48)
 * - Typografische Eyebrows und pillenförmiger CTA-Button mit Direction-Indicator
 * - Dunkelmodus-Optimierung (@media prefers-color-scheme: dark)
 * - 100% kompatibel mit Gmail, Outlook, Apple Mail, Webmailern & Mobilgeräten
 */
export function renderEmailTemplate({
  preheader,
  eyebrow,
  title,
  contentHtml,
  calloutBox,
  ctaText,
  ctaUrl,
  footerNote,
}: {
  preheader?: string;
  eyebrow?: string;
  title: string;
  contentHtml: string;
  calloutBox?: {
    title?: string;
    text: string;
    tone?: 'info' | 'warning' | 'neutral';
  };
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const brandColor = '#e11d48';
  const logoUrl = 'https://cevi-schichtplan.ch/images/cevi-logo.png';

  let calloutBg = '#f8fafc';
  let calloutBorder = '#e2e8f0';
  let calloutAccent = '#94a3b8';
  if (calloutBox?.tone === 'warning') {
    calloutBg = '#fffbeb';
    calloutBorder = '#fef3c7';
    calloutAccent = '#f59e0b';
  } else if (calloutBox?.tone === 'info') {
    calloutBg = '#fff1f2';
    calloutBorder = '#ffe4e6';
    calloutAccent = '#e11d48';
  }

  return `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
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
      background-color: #f1f5f9;
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
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #090d16 !important; }
      .email-card { background-color: #121826 !important; border-color: #1f293d !important; }
      .email-header { background-color: #121826 !important; border-color: #1f293d !important; }
      .email-title { color: #f8fafc !important; }
      .email-body { color: #cbd5e1 !important; }
      .email-footer { background-color: #0d121d !important; border-color: #1f293d !important; color: #64748b !important; }
      .email-callout { background-color: #182234 !important; border-color: #26354d !important; color: #cbd5e1 !important; }
      .email-link-box { background-color: #182234 !important; border-color: #26354d !important; color: #94a3b8 !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  ${
    preheader
      ? `<div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #f1f5f9; opacity: 0;">${escapeHtml(
          preheader
        )} &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
      : ''
  }

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Inner Enclosure (Double-Bezel Shell) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px;">
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-card" style="background-color: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 12px 36px -4px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.04);">
                
                <!-- Top Vibrant Brand Stripe -->
                <tr>
                  <td height="5" style="background: linear-gradient(90deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%); line-height: 5px; font-size: 5px;">&nbsp;</td>
                </tr>

                <!-- Header: Logo & Wordmark Lockup -->
                <tr>
                  <td class="email-header" style="padding: 28px 36px 22px 36px; border-bottom: 1px solid #f1f5f9; background-color: #ffffff;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" valign="middle">
                          <table role="presentation" cellpadding="0" cellspacing="0">
                            <tr>
                              <td valign="middle" style="padding-right: 14px;">
                                <img src="${logoUrl}" width="38" height="38" alt="Cevi Logo" style="display: block; width: 38px; height: 38px; border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.08);" />
                              </td>
                              <td valign="middle">
                                <span style="display: block; font-size: 17px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; line-height: 1.1;">
                                  Cevi Schichtplan
                                </span>
                                <span style="display: block; font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.05em; text-transform: uppercase; margin-top: 2px;">
                                  Offizielle Benachrichtigung
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td align="right" valign="middle" style="display: none; mso-hide: all;">
                          <!-- Optional Right Header Info -->
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Main Content Body -->
                <tr>
                  <td class="email-body" style="padding: 36px 36px 32px 36px; color: #334155; font-size: 15.5px; line-height: 1.65;">
                    
                    ${
                      eyebrow
                        ? `<div style="display: inline-block; background-color: #ffe4e6; color: #e11d48; font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 11px; border-radius: 9999px; margin-bottom: 16px;">
                            ${escapeHtml(eyebrow)}
                          </div>`
                        : ''
                    }

                    <h1 class="email-title" style="margin: 0 0 20px 0; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.03em; line-height: 1.25;">
                      ${escapeHtml(title)}
                    </h1>
                    
                    <div style="margin-bottom: 24px;">
                      ${contentHtml}
                    </div>

                    ${
                      calloutBox
                        ? `
                    <div class="email-callout" style="background-color: ${calloutBg}; border: 1px solid ${calloutBorder}; border-left: 4px solid ${calloutAccent}; border-radius: 10px; padding: 14px 18px; margin: 24px 0;">
                      ${
                        calloutBox.title
                          ? `<p style="margin: 0 0 4px 0; font-size: 13.5px; font-weight: 700; color: #0f172a;">${escapeHtml(
                              calloutBox.title
                            )}</p>`
                          : ''
                      }
                      <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #475569;">${escapeHtml(
                        calloutBox.text
                      )}</p>
                    </div>
                    `
                        : ''
                    }

                    ${
                      ctaText && ctaUrl
                        ? `
                    <!-- Magnetic Pill CTA Button -->
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 32px 0 24px 0;">
                      <tr>
                        <td align="left" style="border-radius: 100px; background-color: ${brandColor}; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.35);">
                          <a href="${escapeHtml(ctaUrl)}" target="_blank" style="display: inline-block; padding: 14px 34px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 100px; letter-spacing: -0.01em;">
                            ${escapeHtml(ctaText)} &nbsp;&rarr;
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Fallback Link Block -->
                    <div class="email-link-box" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; margin: 24px 0 0 0;">
                      <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;">
                        Link funktioniert nicht?
                      </p>
                      <p style="margin: 0; font-size: 12px; line-height: 1.4; word-break: break-all;">
                        Kopiere diese Adresse in deinen Browser:<br>
                        <a href="${escapeHtml(ctaUrl)}" style="color: ${brandColor}; text-decoration: underline;">${escapeHtml(
                            ctaUrl
                          )}</a>
                      </p>
                    </div>
                    `
                        : ''
                    }

                    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 14px; color: #64748b; line-height: 1.5;">
                      Herzliche Grüsse,<br>
                      <strong style="color: #0f172a;">Dein Cevi Schichtplan Team</strong>
                    </div>

                  </td>
                </tr>

                <!-- Elevated Footer -->
                <tr>
                  <td class="email-footer" style="padding: 24px 36px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; color: #64748b; font-size: 12px; line-height: 1.6;">
                    ${
                      footerNote
                        ? `<p style="margin: 0 0 10px 0; color: #475569; font-size: 12.5px;">${escapeHtml(
                            footerNote
                          )}</p>`
                        : ''
                    }
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" valign="middle">
                          <p style="margin: 0;">
                            &copy; ${new Date().getFullYear()} <strong>Cevi Schichtplan</strong> &bull; Schweizer Plattform für Abteilungsanlässe.<br>
                            <a href="https://cevi-schichtplan.ch" style="color: #64748b; text-decoration: underline;">cevi-schichtplan.ch</a>
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
 * Basis-E-Mail-Versandfunktion mit Logging und sicherem Fallback für Development.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Antworten gehen an diese Adresse statt an den Absender */
  replyTo?: string;
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
      replyTo,
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
  const subject = 'Bestätige deine E-Mail-Adresse – Cevi Schichtplan';
  const eyebrow = 'Konto-Aktivierung';
  const title = 'Willkommen beim Cevi Schichtplan!';
  const preheader = 'Bitte bestätige deine E-Mail-Adresse, um dein neues Konto zu aktivieren.';

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong>${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">schön, dass du dabei bist! Um deine Registrierung abzuschliessen und deine Helfereinsätze zu planen, bestätige bitte mit einem Klick deine E-Mail-Adresse:</p>
  `;

  const calloutBox = {
    title: 'Sicherheitshinweis',
    text: `Dieser Bestätigungslink ist ${expiresHours} Stunden gültig. Falls du dieses Konto nicht erstellt hast, musst du nichts weiter tun.`,
    tone: 'info' as const,
  };

  const html = renderEmailTemplate({
    preheader,
    eyebrow,
    title,
    contentHtml,
    calloutBox,
    ctaText: 'E-Mail-Adresse jetzt bestätigen',
    ctaUrl: verificationUrl,
    footerNote: 'Du erhältst diese E-Mail, weil deine Adresse bei der Kontoerstellung auf cevi-schichtplan.ch angegeben wurde.',
  });

  const text = `Hallo ${displayName},\n\nWillkommen beim Cevi Schichtplan!\n\nBitte öffne den folgenden Link in deinem Browser, um deine E-Mail-Adresse zu bestätigen und dein Konto zu aktivieren:\n${verificationUrl}\n\nDieser Link ist ${expiresHours} Stunden gültig.\n\nFalls du dieses Konto nicht erstellt hast, kannst du diese Nachricht ignorieren.\n\nViele Grüsse,\nDein Cevi Schichtplan Team\nhttps://cevi-schichtplan.ch`;

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
  const eyebrow = 'Sicherheit';
  const title = 'Neues Passwort festlegen';
  const preheader = 'Setze dein Passwort für den Cevi Schichtplan sicher zurück.';

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong>${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">wir haben eine Anfrage erhalten, das Passwort für dein Konto beim Cevi Schichtplan zurückzusetzen.</p>
    <p style="margin: 0 0 16px 0;">Klicke auf den Button unten, um ein neues, sicheres Passwort zu vergeben:</p>
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
    ctaText: 'Neues Passwort vergeben',
    ctaUrl: resetUrl,
    footerNote: 'Sicherheitstipp: Verwende ein sicheres, einmaliges Passwort aus Buchstaben, Zahlen und Sonderzeichen.',
  });

  const text = `Hallo ${displayName},\n\nKlicke auf folgenden Link, um dein Passwort zurückzusetzen:\n${resetUrl}\n\nDieser Link ist ${expiresHours} Stunden gültig.\n\nDein Cevi Schichtplan Team`;

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
  const eyebrow = 'Einsatz-Erinnerung';
  const title = 'Deine Schicht steht bevor!';
  const preheader = `Erinnerung an deine Schicht «${shiftTitle}» bei ${eventTitle}.`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hallo <strong>${escapeHtml(displayName)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">vielen Dank für deine Unterstützung! Hier sind die Details zu deiner bevorstehenden Schicht:</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 14.5px;">
        <tr>
          <td style="padding: 4px 0; color: #64748b; width: 90px;"><strong>Anlass:</strong></td>
          <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${escapeHtml(eventTitle)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;"><strong>Schicht:</strong></td>
          <td style="padding: 4px 0; color: #e11d48; font-weight: 700;">${escapeHtml(shiftTitle)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;"><strong>Zeit:</strong></td>
          <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${escapeHtml(timeRangeFormatted)}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 16px 0 0 0;">Wir freuen uns auf deinen Einsatz!</p>
  `;

  const html = renderEmailTemplate({
    preheader,
    eyebrow,
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
  eyebrow,
  title,
  messageHtml,
  ctaText,
  ctaUrl,
  preheader,
}: {
  to: string;
  subject: string;
  eyebrow?: string;
  title: string;
  messageHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  preheader?: string;
}): Promise<boolean> {
  const html = renderEmailTemplate({
    preheader,
    eyebrow,
    title,
    contentHtml: messageHtml,
    ctaText,
    ctaUrl,
  });

  return sendEmail({ to, subject, html });
}
