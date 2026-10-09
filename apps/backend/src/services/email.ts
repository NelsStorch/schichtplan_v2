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
    // STARTTLS negotiation
    rejectUnauthorized: false,
  },
});

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
  if (!pass) {
    console.warn(`[Mail] Kein SMTP_PASSWORD gesetzt. E-Mail an ${to} wurde nicht versendet.`);
    return false;
  }

  try {
    const info = await mailTransporter.sendMail({
      from,
      to,
      subject,
      text: text || html.replace(/<[^>]*>?/gm, ''),
      html,
    });
    console.log(`[Mail] Gesendet an ${to} (ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`[Mail] Fehler beim Senden an ${to}:`, error);
    return false;
  }
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
