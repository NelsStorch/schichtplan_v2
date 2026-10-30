import { escapeHtml, renderEmailTemplate, sendEmail } from './email.js';

export type AlertCategory = 'SMTP' | 'DB_OVERLOAD' | 'SERVER_ERROR' | 'TEST';
export type AlertLevel = 'CRITICAL' | 'WARNING' | 'INFO';

export interface ServerAlertPayload {
  category: AlertCategory;
  level?: AlertLevel;
  title: string;
  message: string;
  error?: unknown;
  context?: Record<string, unknown>;
}

export interface AlertResult {
  sent: boolean;
  throttled?: boolean;
  webhookSent?: boolean;
  emailSent?: boolean;
  reason?: string;
}

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 Minuten Cooldown pro Fehler-Schlüssel
const alertHistory = new Map<string, { lastSentAt: number; suppressedCount: number }>();

/** Setzt die Drossel-Historie zurück (für Tests) */
export function resetAlertCooldowns(): void {
  alertHistory.clear();
}

/**
 * Erkennt, ob ein Fehler durch eine temporäre Überlastung oder Verbindungsabbrüche
 * der PostgreSQL-Datenbank (oder Prisma Connection-Pool) verursacht wurde.
 */
export function isDatabaseOverloadError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as Record<string, unknown>;

  // Prisma Error Codes
  const code = anyErr.code;
  if (typeof code === 'string') {
    // P1001: Can't reach database
    // P1002: Reached database but timed out
    // P1008: Operations timed out
    // P1017: Server has closed connection
    // P2024: Timed out fetching connection from connection pool
    if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(code)) return true;
    // Postgres SQLSTATE codes (53300 = too_many_connections, 57014 = query_canceled)
    if (['53300', '57014', '08000', '08003', '08006'].includes(code)) return true;
  }

  const name = anyErr.name;
  if (name === 'PrismaClientInitializationError' || name === 'PrismaClientRustPanicError') {
    return true;
  }

  const msg = String(anyErr.message || '').toLowerCase();
  return (
    msg.includes('connection pool') ||
    msg.includes('connection slots') ||
    msg.includes('too many clients') ||
    msg.includes('connection terminated') ||
    msg.includes('database server was reached but timed out') ||
    msg.includes("can't reach database server") ||
    msg.includes('connection closed') ||
    msg.includes('connection timeout') ||
    // pg-Pool: keine freie Verbindung innert connectionTimeoutMillis (siehe db.ts)
    msg.includes('timeout exceeded when trying to connect') ||
    msg.includes('remaining connection slots are reserved')
  );
}

/** Formatiert eine Fehlermeldung für die Benachrichtigung */
export function extractErrorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof Error) {
    const code = (err as unknown as Record<string, unknown>).code;
    const prefix = code ? `[${code}] ` : '';
    return `${prefix}${err.message}`;
  }
  return String(err);
}

/**
 * Erzeugt das passende JSON-Payload für Discord, Slack oder generische Webhooks.
 */
export function buildWebhookPayload(
  payload: ServerAlertPayload,
  envInfo: { environment: string; domain: string },
  suppressedNote?: string
): Record<string, unknown> {
  const { category, level = 'CRITICAL', title, message, error, context } = payload;
  const errorDetails = extractErrorMessage(error);
  const fullMessage = suppressedNote ? `${message}\n\n${suppressedNote}` : message;

  const icon = level === 'CRITICAL' ? '🚨' : level === 'WARNING' ? '⚠️' : 'ℹ️';
  const header = `${icon} [Cevi Schichtplan] ${title}`;

  // 1. Generic & Slack & Discord kompatible Felder
  const basePayload: Record<string, unknown> = {
    service: 'cevi-schichtplan',
    environment: envInfo.environment,
    domain: envInfo.domain,
    category,
    level,
    title,
    message: fullMessage,
    error: errorDetails,
    context: context || null,
    timestamp: new Date().toISOString(),
    // Standard-Text für Slack & einfache Chat-Bots
    text: `${header}\n*Umgebung:* ${envInfo.environment} (${envInfo.domain})\n*Kategorie:* ${category}\n${fullMessage}${errorDetails ? `\n\`\`\`${errorDetails}\`\`\`` : ''}`,
    // Discord Embed
    content: header,
    embeds: [
      {
        title,
        description: fullMessage,
        color: level === 'CRITICAL' ? 0xed4245 : level === 'WARNING' ? 0xfaa61a : 0x5865f2,
        fields: [
          { name: 'Kategorie', value: category, inline: true },
          { name: 'Umgebung', value: envInfo.environment, inline: true },
          { name: 'Domain', value: envInfo.domain, inline: true },
          ...(errorDetails
            ? [
                {
                  name: 'Fehler',
                  value: `\`\`\`\n${errorDetails.slice(0, 1000)}\n\`\`\``,
                  inline: false,
                },
              ]
            : []),
          ...(context && Object.keys(context).length > 0
            ? [
                {
                  name: 'Kontext',
                  value: `\`\`\`json\n${JSON.stringify(context, null, 2).slice(0, 500)}\n\`\`\``,
                  inline: false,
                },
              ]
            : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  return basePayload;
}

/**
 * Sendet einen Server-Alarm an die konfigurierte Server-Leitung (Webhook oder Mail).
 * Enthält automatischen Cooldown gegen Alarm-Fluten bei kurzzeitigen Ausfällen.
 * Läuft fehlerresistent und wirft niemals Exceptions nach aussen.
 */
export async function sendServerAlert(
  payload: ServerAlertPayload,
  options?: {
    webhookUrl?: string;
    alertEmail?: string;
    cooldownMs?: number;
    force?: boolean;
  }
): Promise<AlertResult> {
  const webhookUrl =
    options?.webhookUrl ??
    process.env.ADMIN_ALERT_WEBHOOK_URL ??
    process.env.SERVER_ALERT_WEBHOOK_URL;

  const alertEmail =
    options?.alertEmail ??
    process.env.ADMIN_ALERT_EMAIL;

  if (!webhookUrl && !alertEmail) {
    return { sent: false, reason: 'Kein ADMIN_ALERT_WEBHOOK_URL oder ADMIN_ALERT_EMAIL konfiguriert' };
  }

  // Cooldown / Flut-Schutz prüfen
  const cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const historyKey = `${payload.category}:${payload.title}`;
  const now = Date.now();
  const history = alertHistory.get(historyKey);

  if (!options?.force && history && now - history.lastSentAt < cooldownMs) {
    history.suppressedCount++;
    return { sent: false, throttled: true, reason: `Gedrosselt (${history.suppressedCount} unterdrückt)` };
  }

  const suppressedCount = history?.suppressedCount || 0;
  const suppressedNote =
    suppressedCount > 0
      ? `(Hinweis: In den vergangenen ${Math.round(cooldownMs / 60000)} Minuten wurden ${suppressedCount} weitere gleichartige Fehler unterdrückt.)`
      : undefined;

  // Eintrag aktualisieren
  alertHistory.set(historyKey, { lastSentAt: now, suppressedCount: 0 });

  const environment = process.env.NODE_ENV || 'development';
  const domain = (process.env.COOKIE_DOMAIN || process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
  const envInfo = { environment, domain };

  let webhookSent = false;
  let emailSent = false;

  // 1. Webhook senden (falls URL konfiguriert)
  if (webhookUrl) {
    try {
      const body = buildWebhookPayload(payload, envInfo, suppressedNote);
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        webhookSent = true;
      } else {
        const text = await res.text().catch(() => '');
        console.error(`[ServerAlert] Webhook-Versand fehlgeschlagen (HTTP ${res.status}):`, text.slice(0, 200));
      }
    } catch (err) {
      console.error('[ServerAlert] Webhook-Versand fehlgeschlagen:', err instanceof Error ? err.message : err);
    }
  }

  // 2. E-Mail senden (nur wenn konfiguriert UND Kategorie != SMTP, um Endlosschleifen zu vermeiden)
  if (alertEmail && payload.category !== 'SMTP') {
    try {
      const level = payload.level || 'CRITICAL';
      const errorDetails = extractErrorMessage(payload.error);
      const contentHtml = `
        <p style="margin: 0 0 16px 0;">${escapeHtml(payload.message)}</p>
        ${
          errorDetails
            ? `<pre class="email-link-box" style="background: #fafaf9; border: 1px solid #e4e1de; padding: 12px 14px; border-radius: 10px; overflow-x: auto; font-size: 12.5px; line-height: 1.45; color: #1c1917; margin: 16px 0;">${escapeHtml(
                errorDetails
              )}</pre>`
            : ''
        }
        ${suppressedNote ? `<p style="color: #716b66; font-size: 12.5px; margin: 12px 0 0 0;">${escapeHtml(suppressedNote)}</p>` : ''}
      `;

      const html = renderEmailTemplate({
        preheader: `[${level}] ${payload.title} (${environment})`,
        eyebrow: `Server-Alarm · ${level}`,
        title: payload.title,
        headerSubtitle: `Monitoring · ${domain}`,
        contentHtml,
        details: [
          { label: 'Kategorie', value: payload.category, highlight: true },
          { label: 'Stufe', value: level },
          { label: 'Umgebung', value: `${environment} (${domain})` },
        ],
        ctaText: 'Admin-Portal öffnen',
        ctaUrl: `https://admin.${domain}/#statistik`,
      });

      const text = [
        `[${level}] ${payload.title}`,
        `Kategorie: ${payload.category}`,
        `Umgebung: ${environment} (${domain})`,
        '',
        payload.message,
        ...(errorDetails ? ['', `Fehler: ${errorDetails}`] : []),
        ...(suppressedNote ? ['', suppressedNote] : []),
      ].join('\n');

      emailSent = await sendEmail({
        to: alertEmail,
        subject: `[Cevi Schichtplan Alert] ${payload.title}`,
        html,
        text,
        kind: 'SERVER_ALERT',
      });
    } catch (err) {
      console.error('[ServerAlert] Alert-E-Mail fehlgeschlagen:', err instanceof Error ? err.message : err);
    }
  }

  return {
    sent: webhookSent || emailSent,
    webhookSent,
    emailSent,
  };
}
