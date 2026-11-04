import { describe, expect, it } from 'vitest';
import {
  buildIcsFeed,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  generateCalendarToken,
  type CalendarShiftItem,
} from './calendarFeed.js';

describe('calendarFeed', () => {
  it('formatIcsUtc formatiert Datum korrekt nach UTC', () => {
    const d = new Date('2026-10-25T14:30:00.000Z');
    expect(formatIcsUtc(d)).toBe('20261025T143000Z');
  });

  it('escapeIcsText maskiert Sonderzeichen korrekt', () => {
    const raw = 'Hallo, Welt; backslash \\ und \n neue Zeile';
    expect(escapeIcsText(raw)).toBe('Hallo\\, Welt\\; backslash \\\\ und \\n neue Zeile');
  });

  it('foldIcsLine bricht Zeilen über 75 Bytes mit Leerzeichen um', () => {
    const shortLine = 'SUMMARY:Kurzer Text';
    expect(foldIcsLine(shortLine)).toBe(shortLine);

    const longLine =
      'DESCRIPTION:Dies ist eine sehr lange Beschreibung fuer einen Einsatz beim Schichtplan, der definitiv ueber fuenfundsiebzig Bytes lang ist.';
    const folded = foldIcsLine(longLine);
    expect(folded).toContain('\r\n ');
    const lines = folded.split('\r\n');
    for (let i = 0; i < lines.length; i++) {
      expect(Buffer.byteLength(lines[i], 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('generateCalendarToken generiert 48-stelligen Hex-String', () => {
    const token1 = generateCalendarToken();
    const token2 = generateCalendarToken();
    expect(token1).toHaveLength(48);
    expect(token2).toHaveLength(48);
    expect(token1).not.toBe(token2);
    expect(/^[0-9a-f]{48}$/.test(token1)).toBe(true);
  });

  it('buildIcsFeed generiert valides iCal-Abonnement mit VEVENTs und VALARM', () => {
    const shifts: CalendarShiftItem[] = [
      {
        uid: 'shift-1-user-1@cevi-schichtplan.ch',
        shiftId: 'shift-1',
        title: 'Kuchenverkauf',
        category: 'Kiosk',
        description: 'Bitte Wechselgeld mitnehmen.',
        taskTitle: 'Kasse',
        startTime: new Date('2026-10-26T08:00:00.000Z'),
        endTime: new Date('2026-10-26T12:00:00.000Z'),
        eventId: 'evt-1',
        eventTitle: 'Chilbi 2026',
        eventSlug: 'chilbi-2026',
        departmentName: 'Cevi Illnau-Effretikon',
        departmentSlug: 'illnau',
        isResponsible: true,
        responsibleRole: 'Schichtleitung',
      },
    ];

    const ics = buildIcsFeed({
      userDisplayName: 'Inferno',
      shifts,
      domain: 'cevi-schichtplan.ch',
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//Cevi Schichtplan//DE');
    expect(ics).toContain('X-WR-CALNAME:Cevi Schichtplan (Inferno)');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT2H');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:shift-1-user-1@cevi-schichtplan.ch');
    expect(ics).toContain('DTSTART:20261026T080000Z');
    expect(ics).toContain('DTEND:20261026T120000Z');
    expect(ics).toContain('SUMMARY:[Schichtleitung] Kuchenverkauf (Kasse) · Chilbi 2026');
    expect(ics).toContain('LOCATION:Cevi Illnau-Effretikon');
    expect(ics).toContain('https://illnau.cevi-schichtplan.ch/events/chilbi-2026');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT2H');
    expect(ics).toContain('END:VALARM');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics.endsWith('\r\n')).toBe(true);
  });
});

describe('deriveCalendarUrls', () => {
  it('übernimmt valide Subdomains und fällt bei manipulierten Host-Headern auf die Root-Domain zurück', async () => {
    const { deriveCalendarUrls } = await import('../routes/calendar.js');

    // Valider Aufruf
    const valid = deriveCalendarUrls(
      { headers: { host: 'illnau.cevi-schichtplan.ch' }, protocol: 'https' },
      'tok123'
    );
    expect(valid.httpsUrl).toBe('https://illnau.cevi-schichtplan.ch/api/calendar/tok123.ics');
    expect(valid.webcalUrl).toBe('webcal://illnau.cevi-schichtplan.ch/api/calendar/tok123.ics');

    // Manipulierter X-Forwarded-Host Header (Host Header Injection / Poisoning)
    const poisoned = deriveCalendarUrls(
      { headers: { 'x-forwarded-host': 'evil.com', host: 'illnau.cevi-schichtplan.ch' }, protocol: 'https' },
      'tok123'
    );
    // Verhindert evil.com und fällt sicher auf die Root-Domain zurück
    expect(poisoned.httpsUrl).toBe('https://cevi-schichtplan.ch/api/calendar/tok123.ics');
    expect(poisoned.webcalUrl).toBe('webcal://cevi-schichtplan.ch/api/calendar/tok123.ics');
  });
});
