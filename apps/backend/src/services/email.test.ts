import { describe, expect, it, vi } from 'vitest';
import {
  buildShiftIcsAttachment,
  formatEmailSubject,
  formatFromHeader,
  getDefaultFromHeader,
  getMailTransporter,
  getSmtpConfig,
  htmlToPlainText,
  normalizeOrganizationType,
  renderEmailTemplate,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from './email.js';

describe('email service', () => {
  describe('normalizeOrganizationType', () => {
    it('normalisiert verschiedene Eingaben sauber auf OrganizationType', () => {
      expect(normalizeOrganizationType(undefined)).toBe('CEVI');
      expect(normalizeOrganizationType(null)).toBe('CEVI');
      expect(normalizeOrganizationType('')).toBe('CEVI');
      expect(normalizeOrganizationType('CEVI')).toBe('CEVI');
      expect(normalizeOrganizationType('cevi')).toBe('CEVI');
      expect(normalizeOrganizationType('PFADI')).toBe('PFADI');
      expect(normalizeOrganizationType('pfadi')).toBe('PFADI');
      expect(normalizeOrganizationType('JUBLA')).toBe('JUBLA');
      expect(normalizeOrganizationType('jubla')).toBe('JUBLA');
      expect(normalizeOrganizationType('OTHER')).toBe('OTHER');
      expect(normalizeOrganizationType('verein')).toBe('OTHER');
      expect(normalizeOrganizationType('vereins-schichtplan.ch')).toBe('OTHER');
      expect(normalizeOrganizationType('pfadi-schichtplan.ch')).toBe('PFADI');
      expect(normalizeOrganizationType('jubla-schichtplan.ch')).toBe('JUBLA');
      expect(normalizeOrganizationType('cevi-schichtplan.ch')).toBe('CEVI');
    });
  });

  describe('getSmtpConfig', () => {
    it('liefert die korrekten Standard-Infomaniak-Kontodaten pro Organisation', () => {
      const cevi = getSmtpConfig('CEVI');
      expect(cevi.user).toBe('admin@cevi-schichtplan.ch');
      expect(cevi.from).toBe('Cevi Schichtplan <admin@cevi-schichtplan.ch>');

      const pfadi = getSmtpConfig('PFADI');
      expect(pfadi.user).toBe('admin@pfadi-schichtplan.ch');
      expect(pfadi.from).toBe('Pfadi Schichtplan <admin@pfadi-schichtplan.ch>');
      expect(pfadi.pass).toBe('RP5U!asb-78-g8E+');

      const jubla = getSmtpConfig('JUBLA');
      expect(jubla.user).toBe('admin@jubla-schichtplan.ch');
      expect(jubla.from).toBe('Jubla Schichtplan <admin@jubla-schichtplan.ch>');
      expect(jubla.pass).toBe('k5+z%*Z+R6UIa*34');

      const verein = getSmtpConfig('OTHER');
      expect(verein.user).toBe('admin@vereins-schichtplan.ch');
      expect(verein.from).toBe('Vereins Schichtplan <admin@vereins-schichtplan.ch>');
      expect(verein.pass).toBe('zHrHId+89-&+vD%1');
    });
  });

  describe('getMailTransporter', () => {
    it('erstellt und cacht Transporter pro Organisation', () => {
      const t1 = getMailTransporter('CEVI');
      const t2 = getMailTransporter('CEVI');
      const tPfadi = getMailTransporter('PFADI');

      expect(t1).toBe(t2);
      expect(t1).not.toBe(tPfadi);
    });
  });

  describe('getDefaultFromHeader', () => {
    it('liefert den passenden Standard-Absender je Organisation', () => {
      expect(getDefaultFromHeader('CEVI')).toBe('Cevi Schichtplan <admin@cevi-schichtplan.ch>');
      expect(getDefaultFromHeader('PFADI')).toBe('Pfadi Schichtplan <admin@pfadi-schichtplan.ch>');
      expect(getDefaultFromHeader('JUBLA')).toBe('Jubla Schichtplan <admin@jubla-schichtplan.ch>');
      expect(getDefaultFromHeader('OTHER')).toBe('Vereins Schichtplan <admin@vereins-schichtplan.ch>');
    });
  });

  describe('formatFromHeader', () => {
    it('behaelt die authentifizierte Absenderadresse bei und setzt den Anzeigenamen in Anfuehrungszeichen', () => {
      expect(
        formatFromHeader('Chilbi Illnau 2026 (Cevi Illnau)', 'Cevi Schichtplan <admin@cevi-schichtplan.ch>')
      ).toBe('"Chilbi Illnau 2026 (Cevi Illnau)" <admin@cevi-schichtplan.ch>');
    });

    it('bereinigt Anfuehrungszeichen und Zeilenumbrueche im Anzeigenamen', () => {
      expect(
        formatFromHeader('Test "Event"\r\nInjected', 'Cevi Schichtplan <admin@cevi-schichtplan.ch>')
      ).toBe('"Test Event Injected" <admin@cevi-schichtplan.ch>');
    });

    it('waehlt bei Uebergabe eines OrganizationType den passenden Standard-Absender', () => {
      expect(formatFromHeader(undefined, 'PFADI')).toBe('Pfadi Schichtplan <admin@pfadi-schichtplan.ch>');
      expect(formatFromHeader('Sommerlager 2026', 'PFADI')).toBe('"Sommerlager 2026" <admin@pfadi-schichtplan.ch>');
      expect(formatFromHeader('Pfingstlager', 'JUBLA')).toBe('"Pfingstlager" <admin@jubla-schichtplan.ch>');
      expect(formatFromHeader('Dorffest', 'OTHER')).toBe('"Dorffest" <admin@vereins-schichtplan.ch>');
    });
  });

  describe('formatEmailSubject', () => {
    it('stellt in Dev/Test-Umgebungen [DEV] voran', () => {
      const subject = formatEmailSubject('Bestaetige deine E-Mail-Adresse');
      expect(subject).toBe('[DEV] Bestaetige deine E-Mail-Adresse');
    });

    it('verdoppelt [DEV] nicht, falls bereits vorhanden', () => {
      const subject = formatEmailSubject('[DEV] Bereits mit Praefix');
      expect(subject).toBe('[DEV] Bereits mit Praefix');
    });
  });

  describe('htmlToPlainText', () => {
    it('entfernt <style>-, <head>- und versteckte Preheader-Bloecke vollstaendig aus dem Text-Fallback', () => {
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

    it('passt Branding dynamisch an die Organisation an', () => {
      const htmlPfadi = renderEmailTemplate({
        title: 'Pfadi Schicht',
        contentHtml: '<p>Hallo</p>',
        organization: 'PFADI',
      });
      expect(htmlPfadi).toContain('Pfadi Schichtplan');
      expect(htmlPfadi).toContain('pfadi-schichtplan.ch');

      const htmlVerein = renderEmailTemplate({
        title: 'Vereins Event',
        contentHtml: '<p>Hallo</p>',
        organization: 'OTHER',
      });
      expect(htmlVerein).toContain('Vereins Schichtplan');
      expect(htmlVerein).toContain('vereins-schichtplan.ch');
    });
  });

  describe('buildShiftIcsAttachment', () => {
    it('erzeugt einen gueltigen RFC 5545 Kalender-Eintrag fuer eine Schicht', () => {
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

    it('verwendet bei Uebergabe einer Organisation den passenden PRODID-Namen', () => {
      const icsPfadi = buildShiftIcsAttachment({
        uid: 'reminder-pfadi-1@pfadi-schichtplan.ch',
        shiftTitle: 'Feuerwache',
        eventTitle: 'Pfila 2026',
        startTime: new Date('2030-05-18T10:00:00Z'),
        endTime: new Date('2030-05-18T14:00:00Z'),
        organization: 'PFADI',
      });

      expect(icsPfadi).toContain('PRODID:-//Pfadi Schichtplan//DE');
    });
  });

  describe('sendVerificationEmail & sendPasswordResetEmail', () => {
    it('funktioniert mit optionalem organization-Parameter und ruft den passenden Transporter auf', async () => {
      const pfadiTransporter = getMailTransporter('PFADI');
      const pfadiSpy = vi.spyOn(pfadiTransporter, 'sendMail').mockResolvedValueOnce({ messageId: 'pfadi-msg-1' } as any);

      const resVerif = await sendVerificationEmail({
        to: 'helfer@pfadi-beispiel.ch',
        verificationUrl: 'https://pfadi-schichtplan.ch/verify?token=123',
        organization: 'PFADI',
      });
      expect(resVerif).toBe(true);
      expect(pfadiSpy).toHaveBeenCalledTimes(1);
      const pfadiCallArgs = pfadiSpy.mock.calls[0][0] as any;
      expect(pfadiCallArgs.from).toBe('Pfadi Schichtplan <admin@pfadi-schichtplan.ch>');
      expect(pfadiCallArgs.subject).toContain('Bestätige deine E-Mail-Adresse – Pfadi Schichtplan');
      expect(pfadiCallArgs.text).toContain('Willkommen beim Pfadi Schichtplan!');

      const vereinTransporter = getMailTransporter('OTHER');
      const vereinSpy = vi.spyOn(vereinTransporter, 'sendMail').mockResolvedValueOnce({ messageId: 'verein-msg-1' } as any);

      const resReset = await sendPasswordResetEmail({
        to: 'admin@vereins-beispiel.ch',
        resetUrl: 'https://vereins-schichtplan.ch/reset?token=123',
        organization: 'OTHER',
      });
      expect(resReset).toBe(true);
      expect(vereinSpy).toHaveBeenCalledTimes(1);
      const vereinCallArgs = vereinSpy.mock.calls[0][0] as any;
      expect(vereinCallArgs.from).toBe('Vereins Schichtplan <admin@vereins-schichtplan.ch>');
      expect(vereinCallArgs.subject).toContain('Passwort zurücksetzen – Vereins Schichtplan');
      expect(vereinCallArgs.text).toContain('Vereins Schichtplan');
    });
  });
});
