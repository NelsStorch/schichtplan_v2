import { describe, expect, it } from 'vitest';
import { googleCalendarUrl } from './ics';

describe('googleCalendarUrl', () => {
  it('baut den Link mit UTC-Zeiten und Zeitzone Zürich', () => {
    const url = new URL(
      googleCalendarUrl({
        uid: 'a',
        title: 'Bar, Spätschicht',
        description: 'Bitte pünktlich',
        location: 'Pfadiheim',
        start: '2026-10-17T16:00:00.000Z',
        end: '2026-10-17T20:30:00.000Z',
      })
    );
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('text')).toBe('Bar, Spätschicht');
    expect(url.searchParams.get('dates')).toBe('20261017T160000Z/20261017T203000Z');
    expect(url.searchParams.get('ctz')).toBe('Europe/Zurich');
    expect(url.searchParams.get('details')).toBe('Bitte pünktlich');
    expect(url.searchParams.get('location')).toBe('Pfadiheim');
  });

  it('lässt leere Angaben weg', () => {
    const url = new URL(
      googleCalendarUrl({ uid: 'a', title: 'x', start: '2026-10-17T16:00:00Z', end: '2026-10-17T17:00:00Z' })
    );
    expect(url.searchParams.has('details')).toBe(false);
    expect(url.searchParams.has('location')).toBe(false);
  });
});
