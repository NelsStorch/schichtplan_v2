import { describe, expect, it, vi } from 'vitest';
import {
  checkinUrl,
  createQrCode,
  generateCheckinToken,
  isInCheckinWindow,
  personLabel,
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

  it('berücksichtigt die Organisation für Pfadi, Jubla und Vereine', () => {
    const env = { NODE_ENV: 'production', DOMAIN: 'cevi-schichtplan.ch' } as NodeJS.ProcessEnv;
    expect(checkinUrl('schleife', 'lager', 'tok1', 'PFADI', env)).toBe(
      'https://schleife.pfadi-schichtplan.ch/events/lager/checkin?code=tok1'
    );
    expect(checkinUrl('jungwacht', 'lager', 'tok2', 'JUBLA', env)).toBe(
      'https://jungwacht.jubla-schichtplan.ch/events/lager/checkin?code=tok2'
    );
    expect(checkinUrl('tv-effi', 'turnfest', 'tok3', 'OTHER', env)).toBe(
      'https://tv-effi.vereins-schichtplan.ch/events/turnfest/checkin?code=tok3'
    );
  });

  it('unterstützt Staging-Domains mit dev.-Präfix', () => {
    const stagingEnv = { NODE_ENV: 'production', DOMAIN: 'dev.cevi-schichtplan.ch' } as NodeJS.ProcessEnv;
    expect(checkinUrl('schleife', 'lager', 'tok1', 'PFADI', stagingEnv)).toBe(
      'https://schleife.dev.pfadi-schichtplan.ch/events/lager/checkin?code=tok1'
    );
  });

  it('zeigt lokal auf localhost', () => {
    const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;
    expect(checkinUrl('demo', 'fest', 'x', env)).toBe('http://demo.localhost:3000/events/fest/checkin?code=x');
  });
});

describe('personLabel', () => {
  it('nimmt Cevi-Name, sonst vollen Namen, sonst Gastnamen', () => {
    expect(personLabel({ firstName: 'Nels', lastName: 'Storch', nickname: 'Inferno' })).toBe('Nels / Inferno');
    expect(personLabel({ firstName: 'Nels', lastName: 'Storch', ceviName: 'Inferno' })).toBe('Nels / Inferno');
    expect(personLabel({ firstName: 'Anna', lastName: 'Muster', nickname: null })).toBe('Anna Muster');
    expect(personLabel({ firstName: 'Anna', lastName: 'Muster', ceviName: null })).toBe('Anna Muster');
    expect(personLabel(null, 'Max')).toBe('Max');
    expect(personLabel(null)).toBe('Gast');
  });
});

describe('createQrCode', () => {
  it('erzeugt SVG und PDF lokal, ohne externen Dienst', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const svg = await createQrCode('svg', { text: 'https://x.cevi-schichtplan.ch/events/a/checkin?code=b' });
    expect(svg.toString('utf8')).toContain('<svg');
    const pdf = await createQrCode('pdf', { text: 'https://x', title: 'Chilbi', subtitle: 'Check-in' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
