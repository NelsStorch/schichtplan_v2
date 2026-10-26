import { afterEach, describe, expect, it } from 'vitest';
import { normalizeUsageDim } from '@schichtplan/shared';
import {
  bufferedUsage,
  durationBucket,
  percentileFromBuckets,
  recordRequest,
  resetUsageBuffer,
  statusClass,
  trackUsage,
  trackUsageUnchecked,
} from './usageStats.js';

describe('Nutzungsstatistik', () => {
  afterEach(resetUsageBuffer);

  it('zählt pro Schweizer Kalendertag, Unterteilung und Abteilung', () => {
    // 23:30 UTC am 25.10. ist in Zürich schon der 26.10.
    const at = new Date('2026-10-25T23:30:00Z');
    trackUsage('LOGIN', { dim: 'cevidb', departmentId: 'abt', at });
    trackUsage('LOGIN', { dim: 'cevidb', departmentId: 'abt', at });
    trackUsage('ACCOUNT_DELETE', { at });
    const { counters } = bufferedUsage();
    expect(counters.get(['2026-10-26', 'LOGIN', 'cevidb', 'abt'].join('\u0000'))).toBe(2);
    expect(counters.get(['2026-10-26', 'ACCOUNT_DELETE', '', ''].join('\u0000'))).toBe(1);
  });

  it('verwirft unbekannte Unterteilungen und freie Texte', () => {
    expect(trackUsageUnchecked('UI_PDF', 'plan_print', null)).toBe(true);
    expect(trackUsageUnchecked('UI_PDF', 'irgendwas', null)).toBe(false);
    expect(trackUsageUnchecked('UI_THEME', undefined, null)).toBe(false);
    // Hilfeseiten: nur kurze Pfade, keine Namen mit Leerzeichen, keine Query-Strings
    expect(normalizeUsageDim('HELP_PAGE', '/ok/fragen/')).toBe('ok/fragen');
    expect(normalizeUsageDim('HELP_PAGE', '/')).toBe('index');
    expect(normalizeUsageDim('HELP_PAGE', 'Nels Storch')).toBeNull();
    expect(normalizeUsageDim('HELP_PAGE', 'suche?q=inferno')).toBeNull();
    expect(normalizeUsageDim('HELP_PAGE', 'a//b')).toBeNull();
    // Ohne Unterteilung zählt immer ''
    expect(normalizeUsageDim('HELP_SEARCH_EMPTY', 'egal')).toBe('');
  });

  it('fasst Anfragen pro Stunde, Route-Muster und Statusklasse zusammen', () => {
    const at = new Date('2026-10-26T10:15:00Z');
    recordRequest('/api/events/:slug', 'GET', 200, 12, at);
    recordRequest('/api/events/:slug', 'GET', 204, 700, new Date('2026-10-26T10:59:00Z'));
    recordRequest('/api/events/:slug', 'GET', 429, 1, at);
    const { requests } = bufferedUsage();
    const ok = requests.get(['2026-10-26T10:00:00.000Z', '/api/events/:slug', 'GET', '2xx'].join('\u0000'));
    expect(ok).toMatchObject({ count: 2, totalMs: 712, maxMs: 700 });
    expect(ok!.buckets[durationBucket(12)]).toBe(1);
    expect(requests.has(['2026-10-26T10:00:00.000Z', '/api/events/:slug', 'GET', '429'].join('\u0000'))).toBe(true);
  });

  it('teilt Statuscodes und Laufzeiten ein', () => {
    expect(statusClass(201)).toBe('2xx');
    expect(statusClass(404)).toBe('4xx');
    expect(statusClass(429)).toBe('429');
    expect(statusClass(503)).toBe('5xx');
    expect(durationBucket(10)).toBe(0);
    expect(durationBucket(25)).toBe(0);
    expect(durationBucket(26)).toBe(1);
    expect(durationBucket(99_999)).toBe(8);
  });

  it('schätzt Perzentile aus den Stufen', () => {
    // 90 schnelle (≤25 ms), 10 langsame (≤1000 ms)
    const buckets = [90, 0, 0, 0, 0, 10, 0, 0, 0];
    expect(percentileFromBuckets(buckets, 0.5)).toBe(25);
    expect(percentileFromBuckets(buckets, 0.95)).toBe(1000);
    expect(percentileFromBuckets([0, 0, 0], 0.5)).toBeNull();
  });
});
