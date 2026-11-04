export interface CalendarEntry {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
}

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escapeText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

/**
 * Erzeugt eine direkte URL für Google Kalender mit Zeitzone Europe/Zurich für einen Einzeleinsatz.
 * Start- und Endzeit werden in UTC formatiert (YYYYMMDDTHHmmssZ), Google rechnet mit ctz=Europe/Zurich.
 */
export function googleCalendarUrl(entry: CalendarEntry): string {
  const startUtc = stamp(entry.start);
  const endUtc = stamp(entry.end);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: entry.title,
    dates: `${startUtc}/${endUtc}`,
    ctz: 'Europe/Zurich',
  });
  if (entry.description) params.set('details', entry.description);
  if (entry.location) params.set('location', entry.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Erzeugt den 1-Klick-Abonnement-Link für Google Kalender (Web & App).
 * Öffnet Google Kalender direkt mit der Abfrage «Kalender hinzufügen?».
 */
export function googleCalendarSubscribeUrl(feedUrl: string): string {
  // Google Calendar erwartet webcal:// im cid-Parameter für externen Feed-Sync
  const webcalUrl = feedUrl.replace(/^https:\/\//i, 'webcal://').replace(/^http:\/\//i, 'webcal://');
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
}

/**
 * Erzeugt den 1-Klick-Abonnement-Link für Outlook Web / Microsoft 365.
 */
export function outlookCalendarSubscribeUrl(httpsUrl: string, name = 'Meine Cevi-Schichten'): string {
  return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl)}&name=${encodeURIComponent(name)}`;
}

export type ClientDevice = 'ios' | 'mac' | 'android' | 'windows' | 'other';

/**
 * Erkennt das Betriebssystem des Geräts (für gerätespezifische Kalender-Buttons).
 */
export function detectClientDevice(): ClientDevice {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/macintosh|mac os x/.test(ua)) return 'mac';
  if (/android/.test(ua)) return 'android';
  if (/windows/.test(ua)) return 'windows';
  return 'other';
}

/** Erzeugt eine .ics-Datei und startet den Download (Kalender-Integration wie in der Legacy-App). */
export function downloadIcs(filename: string, entries: CalendarEntry[]) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cevi Schichtplan//DE',
    'CALSCALE:GREGORIAN',
    ...entries.flatMap((e) => [
      'BEGIN:VEVENT',
      `UID:${e.uid}@cevi-schichtplan.ch`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(e.title)}`,
      'END:VALARM',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
