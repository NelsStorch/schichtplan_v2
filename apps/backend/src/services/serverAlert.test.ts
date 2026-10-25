import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildWebhookPayload,
  isDatabaseOverloadError,
  resetAlertCooldowns,
  sendServerAlert,
} from './serverAlert.js';

describe('serverAlert', () => {
  beforeEach(() => {
    resetAlertCooldowns();
    vi.restoreAllMocks();
  });

  describe('isDatabaseOverloadError', () => {
    it('erkennt Prisma Connection-Pool Timeouts und DB-Ausfälle', () => {
      expect(isDatabaseOverloadError({ code: 'P2024', message: 'Timed out fetching a connection from pool' })).toBe(true);
      expect(isDatabaseOverloadError({ code: 'P1001', message: "Can't reach database server" })).toBe(true);
      expect(isDatabaseOverloadError({ code: 'P1002', message: 'Database server timed out' })).toBe(true);
      expect(isDatabaseOverloadError({ code: 'P1017', message: 'Server has closed connection' })).toBe(true);
      expect(isDatabaseOverloadError({ code: '53300', message: 'too many connections' })).toBe(true);
    });

    it('erkennt textuelle Connection-Pool- und Slot-Fehler', () => {
      const err = new Error('remaining connection slots are reserved for non-replication superuser connections');
      expect(isDatabaseOverloadError(err)).toBe(true);
    });

    it('gibt false für reguläre Anwendungs- und Validierungsfehler zurück', () => {
      expect(isDatabaseOverloadError(new Error('Ungültiges Passwort'))).toBe(false);
      expect(isDatabaseOverloadError({ code: 'P2002', message: 'Unique constraint failed' })).toBe(false);
      expect(isDatabaseOverloadError(null)).toBe(false);
      expect(isDatabaseOverloadError('str')).toBe(false);
    });
  });

  describe('buildWebhookPayload', () => {
    it('generiert ein Discord- und Slack-kompatibles Payload', () => {
      const payload = buildWebhookPayload(
        {
          category: 'DB_OVERLOAD',
          level: 'CRITICAL',
          title: 'Datenbank überlastet',
          message: 'Connection pool exhausted',
          error: new Error('P2024 Timeout'),
          context: { route: '/api/events' },
        },
        { environment: 'production', domain: 'cevi-schichtplan.ch' }
      );

      expect(payload.service).toBe('cevi-schichtplan');
      expect(payload.category).toBe('DB_OVERLOAD');
      expect(payload.level).toBe('CRITICAL');
      expect(payload.text).toContain('Datenbank überlastet');
      expect(payload.text).toContain('cevi-schichtplan.ch');
      expect(payload.embeds).toBeDefined();

      const embeds = payload.embeds as any[];
      expect(embeds[0].color).toBe(0xed4245); // Rot für CRITICAL
      expect(embeds[0].fields).toContainEqual({ name: 'Kategorie', value: 'DB_OVERLOAD', inline: true });
    });
  });

  describe('sendServerAlert & Throttling', () => {
    it('meldet Fehler über Webhook und drosselt Wiederholungen', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const alert = {
        category: 'DB_OVERLOAD' as const,
        title: 'Datenbank antwortet nicht',
        message: 'Timeout beim Verbindungsaufbau',
      };

      // 1. Erster Alarm geht raus
      const res1 = await sendServerAlert(alert, { webhookUrl: 'https://webhook.example.com/alert' });
      expect(res1.sent).toBe(true);
      expect(res1.webhookSent).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 2. Zweiter Alarm innerhalb des Cooldowns wird gedrosselt
      const res2 = await sendServerAlert(alert, { webhookUrl: 'https://webhook.example.com/alert' });
      expect(res2.sent).toBe(false);
      expect(res2.throttled).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 3. Mit force: true wird die Drossel umgangen
      const res3 = await sendServerAlert(alert, { webhookUrl: 'https://webhook.example.com/alert', force: true });
      expect(res3.sent).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('verhindert SMTP-Fehlerschleifen per E-Mail', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      // Bei SMTP-Fehlern darf keine Alarm-E-Mail versendet werden
      const res = await sendServerAlert(
        {
          category: 'SMTP',
          title: 'SMTP-Verbindung fehlgeschlagen',
          message: 'Connection refused mail.infomaniak.com',
        },
        {
          webhookUrl: 'https://webhook.example.com/alert',
          alertEmail: 'admin@cevi-schichtplan.ch',
        }
      );

      expect(res.webhookSent).toBe(true);
      expect(res.emailSent).toBe(false);
    });
  });
});
