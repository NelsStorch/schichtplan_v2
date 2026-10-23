export interface CalendarEntry {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
}

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

/**
 * Erzeugt eine direkte URL für Google Kalender mit Zeitzone Europe/Zurich.
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
      `SUMMARY:${escape(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
      ...(e.location ? [`LOCATION:${escape(e.location)}`] : []),
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escape(e.title)}`,
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
