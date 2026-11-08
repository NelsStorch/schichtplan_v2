import { describe, expect, it } from 'vitest';
import { CreateEventSchema, STAFF_PIN_MIN_LENGTH, UpdateEventSchema } from '@schichtplan/shared';
import { isAllowedPushEndpoint } from './webPush.js';
import { canChangeOwnEmail } from './profileUpdate.js';
import { createRateLimiter } from './rateLimit.js';
import { claimCeviNameAttempt, releaseCeviNameAttempt } from './ceviNameLogin.js';
import { tenantHeaderAllowed } from '../plugins/tenant.js';
import { cateringBaseUrl } from '../routes/catering.js';

describe('Push-Endpoints (SSRF)', () => {
  it('lässt die Push-Dienste der Browser zu', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
  });

  it('lehnt interne und fremde Adressen ab', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://backend:4000/api/health')).toBe(false);
    expect(isAllowedPushEndpoint('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://evilpush.apple.com.example/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(isAllowedPushEndpoint('kein url')).toBe(false);
  });
});

describe('Eigene E-Mail ändern', () => {
  const base = { email: null, emailVerified: false, passwordHash: null, ceviDbId: null };

  it('ohne echte Adresse immer', () => {
    expect(canChangeOwnEmail(base)).toBe(true);
    expect(canChangeOwnEmail({ ...base, email: 'cevidb_12@cevi-schichtplan.ch', ceviDbId: 12, emailVerified: true })).toBe(true);
  });

  it('selbst eingetragene, unbestätigte Adresse lässt sich korrigieren', () => {
    expect(canChangeOwnEmail({ ...base, email: 'tippfeler@example.ch' })).toBe(true);
  });

  it('bestätigte Adresse, Passwort- und Cevi.DB-Konten nicht', () => {
    expect(canChangeOwnEmail({ ...base, email: 'a@example.ch', emailVerified: true })).toBe(false);
    expect(canChangeOwnEmail({ ...base, email: 'a@example.ch', passwordHash: 'x' })).toBe(false);
    expect(canChangeOwnEmail({ ...base, email: 'a@example.ch', ceviDbId: 5 })).toBe(false);
  });
});

describe('Versuchsbremse undo', () => {
  it('nimmt den letzten Versuch zurück', () => {
    let t = 0;
    const limiter = createRateLimiter(1000, 2, () => t);
    expect(limiter.hit('k')).toBe(false);
    expect(limiter.hit('k')).toBe(false);
    limiter.undo('k');
    expect(limiter.hit('k')).toBe(false);
    expect(limiter.hit('k')).toBe(true);
    t = 2000;
    limiter.undo('unbekannt');
    expect(limiter.hit('k')).toBe(false);
  });
});

describe('Cevi-Name-Bremse', () => {
  it('zählt sofort und sperrt nach 8 Fehlversuchen, Treffer zählen nicht', () => {
    const dep = `dep-${Math.random()}`;
    for (let i = 0; i < 8; i++) expect(claimCeviNameAttempt(dep, 'Flitz')).toBe(false);
    expect(claimCeviNameAttempt(dep, 'flitz ')).toBe(true);

    const other = `dep-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      expect(claimCeviNameAttempt(other, 'Wirbel')).toBe(false);
      releaseCeviNameAttempt(other, 'Wirbel');
    }
  });
});

describe('Abteilung per Header', () => {
  it('lokal immer, in Produktion nur ohne Proxy-Header', () => {
    expect(tenantHeaderAllowed({ 'x-forwarded-for': '1.2.3.4' }, { NODE_ENV: 'development' })).toBe(true);
    expect(tenantHeaderAllowed({}, { NODE_ENV: 'production' })).toBe(true);
    expect(tenantHeaderAllowed({ 'x-forwarded-for': '1.2.3.4' }, { NODE_ENV: 'production' })).toBe(false);
    expect(tenantHeaderAllowed({ 'x-forwarded-host': 'a.b' }, { NODE_ENV: 'production' })).toBe(false);
  });
});

describe('Adresse auf Papier-Bons', () => {
  it('nur eigene Domain, sonst die Abteilungs-Subdomain', () => {
    expect(cateringBaseUrl('illnau.cevi-schichtplan.ch', 'illnau')).toBe('https://illnau.cevi-schichtplan.ch');
    expect(cateringBaseUrl('evil.example', 'illnau')).toBe('https://illnau.cevi-schichtplan.ch');
    expect(cateringBaseUrl('cevi-schichtplan.ch.evil.example', null)).toBe('https://cevi-schichtplan.ch');
    expect(cateringBaseUrl('demo.localhost:3000', 'demo')).toBe('http://demo.localhost:3000');
  });
});

describe('Stand-PIN', () => {
  const base = { title: 'Lager', slug: 'lager', startDate: '2026-12-01T00:00:00.000Z' };

  it('Mindestlänge, leer oder null erlaubt', () => {
    const tooShort = '1'.repeat(STAFF_PIN_MIN_LENGTH - 1);
    expect(UpdateEventSchema.safeParse({ cateringStaffPin: tooShort }).success).toBe(false);
    expect(UpdateEventSchema.safeParse({ cateringStaffPin: '4'.repeat(STAFF_PIN_MIN_LENGTH) }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({ cateringStaffPin: '' }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({ cateringStaffPin: null }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({}).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...base, cateringStaffPin: tooShort }).success).toBe(false);
  });
});
