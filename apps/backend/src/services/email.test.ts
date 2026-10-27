import { describe, expect, it } from 'vitest';
import {
  buildShiftIcsAttachment,
  formatFromHeader,
  htmlToPlainText,
  renderEmailTemplate,
} from './email.js';

describe('email service', () => {
  describe('htmlToPlainText', () => {
    it('entfernt <style>-, <head>- und versteckte Preheader-Blöcke vollständig aus dem Text-Fallback', () => {
      const html = renderEmailTemplate({
        preheader: 'Geheimer Preheader',
        eyebrow: 'Einsatz-Erinnerung',
        title: 'Deine Schicht steht bevor!',
        headerSubtitle: 'Cevi Illnau-Effretikon',
        contentHtml: '<p>Hallo <strong>Inferno</strong>,</p><p>dein Einsatz beginnt bald.</p>',
        details: [
          { label: 'Anlass', value: 'Chilbi Illnau 2026' },
          { label: 'Schicht', value: 'Grill', highlight: true },
        ],
        ctaText: 'Zum Schichtplan',
        ctaUrl: 'https://illnau.cevi-schichtplan.ch/events/chilbi-2026',
      });

      const text = htmlToPlainText(html);

      expect(text).not.toContain('color-scheme');
      expect(text).not.toContain('prefers-color-scheme');
      expect(text).not.toContain('PixelsPerInch');
      expect(text).not.toContain('Geheimer Preheader');
      expect(text).toContain('Deine Schicht steht bevor!');
      expect(text).toContain('Hallo Inferno,');
      expect(text).toContain('Chilbi Illnau 2026');
      expect(text).toContain('https://illnau.cevi-schichtplan.ch/events/chilbi-2026');
    });
  });

  describe('formatFromHeader', () => {
    it('behält die authentifizierte Absenderadresse bei und setzt den Anzeigenamen in Anführungszeichen', () => {
      expect(
        formatFromHeader('Chilbi Illnau 2026 (Cevi Illnau)', 'Cevi Schichtplan <admin@cevi-schichtplan.ch>')
      ).toBe('"Chilbi Illnau 2026 (Cevi Illnau)" <admin@cevi-schichtplan.ch>');
    });

    it('bereinigt Anführungszeichen und Zeilenumbrüche im Anzeigenamen', () => {
      expect(
        formatFromHeader('Test "Event"\r\nInjected', 'Cevi Schichtplan <admin@cevi-schichtplan.ch>')
      ).toBe('"Test Event Injected" <admin@cevi-schichtplan.ch>');
    });
  });

  describe('renderEmailTemplate', () => {
    it('rendert Lagerfeuer-Farben, Abteilungs-Kontext, strukturierte Details und Dark-Mode-Klassen', () => {
      const html = renderEmailTemplate({
        title: 'Test-Titel',
        headerSubtitle: 'Cevi Wetzikon',
        accentColor: '#2563eb',
        contentHtml: '<p>Inhalt</p>',
        details: [{ label: 'Schicht', value: 'Bar', highlight: true }],
        unsubscribeUrl: 'https://cevi-schichtplan.ch/profil',
        unsubscribeLabel: 'Erinnerungen abstellen',
      });

      expect(html).toContain('Cevi Wetzikon');
      expect(html).toContain('#2563eb');
      expect(html).toContain('email-detail-card');
      expect(html).toContain('email-brand-name');
      expect(html).toContain('Erinnerungen abstellen');
    });
  });

  describe('buildShiftIcsAttachment', () => {
    it('erzeugt einen gültigen RFC 5545 Kalender-Eintrag für eine Schicht', () => {
      const ics = buildShiftIcsAttachment({
        uid: 'reminder-123@cevi-schichtplan.ch',
        shiftTitle: 'Grill · Aufbau',
        eventTitle: 'Chilbi 2026',
        departmentName: 'Cevi Illnau-Effretikon',
        startTime: new Date('2030-06-01T16:00:00Z'),
        endTime: new Date('2030-06-01T20:00:00Z'),
        shiftUrl: 'https://illnau.cevi-schichtplan.ch/events/chilbi-2026',
      });

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('UID:reminder-123@cevi-schichtplan.ch');
      expect(ics).toContain('DTSTART:20300601T160000Z');
      expect(ics).toContain('DTEND:20300601T200000Z');
      expect(ics).toContain('SUMMARY:Grill · Aufbau · Chilbi 2026');
      expect(ics).toContain('LOCATION:Cevi Illnau-Effretikon');
      expect(ics).toContain('END:VCALENDAR');
    });
  });
});
