import { describe, expect, it, vi } from 'vitest';
import {
  checkinUrl,
  fetchCeviQrCode,
  generateCheckinToken,
  isInCheckinWindow,
  personLabel,
  qrApiBaseUrl,
} from './attendance.js';

describe('isInCheckinWindow', () => {
  const start = new Date('2030-06-01T18:00:00Z');
  const end = new Date('2030-06-01T22:00:00Z');

  it('öffnet 30 Minuten vor Beginn', () => {
    expect(isInCheckinWindow(start, end, new Date('2030-06-01T17:29:59Z'))).toBe(false);
    expect(isInCheckinWindow(start, end, new Date('2030-06-01T17:30:00Z'))).toBe(true);
  });

  it('gilt standardmässig bis 30 Minuten nach Schichtende', () => {
    expect(isInCheckinWindow(start, end, new Date('2030-06-01T22:00:00Z'))).toBe(true);
    expect(isInCheckinWindow(start, end, new Date('2030-06-01T22:30:00Z'))).toBe(true);
    expect(isInCheckinWindow(start, end, new Date('2030-06-01T22:30:01Z'))).toBe(false);
  });

  it('berücksichtigt konfigurierte Vorlauf- und Nachlaufzeiten', () => {
    // 15 Min vor Beginn bis 45 Min nach Ende
    expect(isInCheckinWindow(start, end, new Date('2030-06-01T17:44:59Z'), 15, 45)).toBe(false);
    expect(isInCheckinWindow(start, end, new Date('2030-06-01T17:45:00Z'), 15, 45)).toBe(true);
    expect(isInCheckinWindow(start, end, new Date('2030-06-01T22:45:00Z'), 15, 45)).toBe(true);
    expect(isInCheckinWindow(start, end, new Date('2030-06-01T22:45:01Z'), 15, 45)).toBe(false);
  });
});

describe('generateCheckinToken', () => {
  it('erzeugt URL-sichere, verschiedene Codes', () => {
    const a = generateCheckinToken();
    const b = generateCheckinToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(a).not.toBe(b);
  });
});

describe('checkinUrl', () => {
  it('zeigt in Produktion auf die Abteilungs-Subdomain', () => {
    const env = { NODE_ENV: 'production', DOMAIN: 'cevi-schichtplan.ch' } as NodeJS.ProcessEnv;
    expect(checkinUrl('illnau', 'chilbi-2026', 'abc_DEF-123', env)).toBe(
      'https://illnau.cevi-schichtplan.ch/events/chilbi-2026/checkin?code=abc_DEF-123'
    );
  });

  it('zeigt lokal auf localhost', () => {
    const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;
    expect(checkinUrl('demo', 'fest', 'x', env)).toBe('http://demo.localhost:3000/events/fest/checkin?code=x');
  });
});

describe('personLabel', () => {
  it('nimmt Cevi-Name, sonst vollen Namen, sonst Gastnamen', () => {
    expect(personLabel({ firstName: 'Nels', lastName: 'Storch', ceviName: 'Inferno' })).toBe('Nels / Inferno');
    expect(personLabel({ firstName: 'Anna', lastName: 'Muster', ceviName: null })).toBe('Anna Muster');
    expect(personLabel(null, 'Max')).toBe('Max');
    expect(personLabel(null)).toBe('Gast');
  });
});

describe('fetchCeviQrCode', () => {
  it('ruft den Cevi-QR-Generator mit Titel für das PDF auf', async () => {
    const fetchImpl = vi.fn(async () => new Response('%PDF', { status: 200 }));
    const file = await fetchCeviQrCode(
      'pdf',
      { text: 'https://x', title: 'Chilbi', subtitle: 'Check-in' },
      fetchImpl as unknown as typeof fetch,
      {} as NodeJS.ProcessEnv
    );
    expect(file.toString()).toBe('%PDF');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://backend.qr.cevi.tools/pdf');
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'https://x',
      title: 'Chilbi',
      subtitle: 'Check-in',
      show_url: false,
    });
  });

  it('meldet Fehler des Generators', async () => {
    const fetchImpl = vi.fn(async () => new Response('kaputt', { status: 500 }));
    await expect(
      fetchCeviQrCode('svg', { text: 'https://x' }, fetchImpl as unknown as typeof fetch, {} as NodeJS.ProcessEnv)
    ).rejects.toThrow('500');
  });

  it('lässt sich per QR_API_URL umbiegen', () => {
    expect(qrApiBaseUrl({ QR_API_URL: 'http://qr:5000/' } as NodeJS.ProcessEnv)).toBe('http://qr:5000');
  });
});
