import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HITOBITO_SCOPES,
  classifyUnitRole,
  getHitobitoConfig,
  getHitobitoConfigFromHost,
  getUnitRoleKey,
  getVocabulary,
  getVocabularyFromHost,
  isDepartmentLeaderRole,
  isUnitRoleClass,
} from '@schichtplan/shared';

describe('Hitobito & Vokabular (Multi-Verband)', () => {
  describe('Vokabular-Definitionen', () => {
    it('liefert das korrekte Vokabular für CEVI', () => {
      const vocab = getVocabulary('CEVI');
      expect(vocab).toMatchObject({
        department: 'Abteilung',
        departmentLeader: 'Abteilungsleitung',
        member: 'Cevianer*in',
        memberPlural: 'Cevianer*innen',
        group: 'Stufe',
        groupPlural: 'Stufen',
        groupLeader: 'Stufenleitung',
        nickname: 'Cevi-Name',
        authProvider: 'Cevi.DB',
      });
    });

    it('liefert das korrekte Vokabular für PFADI', () => {
      const vocab = getVocabulary('PFADI');
      expect(vocab).toMatchObject({
        department: 'Abteilung',
        departmentLeader: 'Abteilungsleitung',
        member: 'Pfadfinder*in',
        memberPlural: 'Pfadfinder*innen',
        group: 'Einheit',
        groupPlural: 'Einheiten',
        groupLeader: 'Einheitsleitung',
        nickname: 'Pfadiname',
        authProvider: 'PBS MiData',
      });
    });

    it('liefert das korrekte Vokabular für JUBLA', () => {
      const vocab = getVocabulary('JUBLA');
      expect(vocab).toMatchObject({
        department: 'Schar',
        departmentLeader: 'Scharleitung',
        member: 'Jublaner*in',
        memberPlural: 'Jublaner*innen',
        group: 'Gruppe',
        groupPlural: 'Gruppen',
        groupLeader: 'Gruppenleitung',
        nickname: 'Leitername',
        authProvider: 'Jubla-DB',
      });
    });

    it('liefert das korrekte Vokabular für OTHER (Verein)', () => {
      const vocab = getVocabulary('OTHER');
      expect(vocab).toMatchObject({
        department: 'Verein',
        departmentLeader: 'Vorstand',
        member: 'Mitglied',
        memberPlural: 'Mitglieder',
        group: 'Team',
        groupPlural: 'Teams',
        groupLeader: 'Teamleitung',
        nickname: 'Spitzname',
      });
      // Fallback über 'VEREIN'
      expect(getVocabulary('VEREIN')).toEqual(vocab);
    });

    it('ermittelt Vokabular korrekt aus Hostnamen', () => {
      expect(getVocabularyFromHost('pfadi-schichtplan.ch').member).toBe('Pfadfinder*in');
      expect(getVocabularyFromHost('dev.jubla-schichtplan.ch').department).toBe('Schar');
      expect(getVocabularyFromHost('vereins-schichtplan.ch').departmentLeader).toBe('Vorstand');
      expect(getVocabularyFromHost('cevi-schichtplan.ch').group).toBe('Stufe');
      expect(getVocabularyFromHost(null).group).toBe('Stufe'); // Default CEVI
    });
  });

  describe('Hitobito-Konfiguration & Scopes', () => {
    it('enthält immer den zwingenden groups Scope', () => {
      for (const org of ['CEVI', 'PFADI', 'JUBLA'] as const) {
        const config = getHitobitoConfig(org);
        expect(config.oauthScopes).toContain('groups');
        expect(config.oauthScopes).toContain('with_roles');
        expect(config.oauthScopes).toBe(DEFAULT_HITOBITO_SCOPES);
      }
    });

    it('liefert die Verbands-spezifischen BaseURLs und Gruppenfelder', () => {
      expect(getHitobitoConfig('CEVI')).toMatchObject({
        defaultBaseUrl: 'https://db.cevi.ch',
        ortsgruppeField: 'ortsgruppe_id',
      });
      expect(getHitobitoConfig('PFADI')).toMatchObject({
        defaultBaseUrl: 'https://midata.scouts.ch',
        ortsgruppeField: 'abteilung_id',
      });
      expect(getHitobitoConfig('JUBLA')).toMatchObject({
        defaultBaseUrl: 'https://db.jubla.ch',
        ortsgruppeField: 'schar_id',
      });
    });

    it('unterstützt Abwärtskompatibilitäts-Aliase', () => {
      const cevi = getHitobitoConfig('CEVI');
      expect(cevi.stufeRoleClassPrefix).toBe('Group::Stufe::');
      expect(cevi.stufeLeaderRoles).toContain('Stufenleiter');
      expect(cevi.stufeParticipantRoles).toContain('Teilnehmer');
    });

    it('ermittelt Konfiguration anhand von Hostnamen', () => {
      expect(getHitobitoConfigFromHost('midata.pfadi-schichtplan.ch').name).toBe('PBS MiData');
      expect(getHitobitoConfigFromHost('jubla-schichtplan.ch').name).toBe('Jubla-DB');
    });
  });

  describe('Leitungsrollen-Erkennung (isDepartmentLeaderRole)', () => {
    it('erkennt Cevi-Leitungsrollen', () => {
      expect(isDepartmentLeaderRole('Group::Jungschar::Abteilungsleiter', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Jungschar::Abteilungsleiterin', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::Abteilungsleiter', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Ortsgruppe::AdministratorCeviDB', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Stufe::Stufenleiter', 'CEVI')).toBe(false);
    });

    it('erkennt Pfadi-Leitungsrollen (PBS MiData & DPSG/BdP)', () => {
      expect(isDepartmentLeaderRole('Group::Abteilung::Abteilungsleitung', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::AbteilungsleitungStv', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::Sekretariat', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::Praesidium', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Stamm::Stammesfuehrung', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Stamm::StammesfuehrungStv', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Pfadi::Einheitsleitung', 'PFADI')).toBe(false);
    });

    it('erkennt Jubla-Leitungsrollen (Scharleitung, Präses, CampLeader)', () => {
      expect(isDepartmentLeaderRole('Group::Flock::Leader', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Flock::CampLeader', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Flock::President', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Schar::Scharleitung', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Schar::Scharleiter', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Schar::Praeses', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::ChildGroup::Leader', 'JUBLA')).toBe(false);
    });

    it('funktioniert mit konfigurierten Arrays (Abwärtskompatibilität)', () => {
      const configured = ['Custom::Leader::Role'];
      expect(isDepartmentLeaderRole('Custom::Leader::Role', configured)).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::Abteilungsleiter', configured)).toBe(true);
      expect(isDepartmentLeaderRole('Group::Schar::Scharleitung', configured)).toBe(true);
      expect(isDepartmentLeaderRole('Unknown::Role', configured)).toBe(false);
    });

    it('prüft global, wenn kein Verband übergeben wird', () => {
      expect(isDepartmentLeaderRole('Group::Jungschar::Abteilungsleiter')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::Abteilungsleitung')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Flock::Leader')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Stufe::Teilnehmer')).toBe(false);
    });
  });

  describe('Stufen- und Einheiten-Rollen (classifyUnitRole, isUnitRoleClass)', () => {
    it('erkennt Einheiten-Rollenklassen nach Präfix', () => {
      expect(isUnitRoleClass('Group::Stufe::Stufenleiter', 'CEVI')).toBe(true);
      expect(isUnitRoleClass('Group::Pfadi::Einheitsleitung', 'PFADI')).toBe(true);
      expect(isUnitRoleClass('Group::Woelfe::Wolf', 'PFADI')).toBe(true);
      expect(isUnitRoleClass('Group::Biber::Biber', 'PFADI')).toBe(true);
      expect(isUnitRoleClass('Group::ChildGroup::Child', 'JUBLA')).toBe(true);
      expect(isUnitRoleClass('Group::Jungschar::Abteilungsleiter')).toBe(false);
    });

    it('extrahiert den Rollenschlüssel korrekt', () => {
      expect(getUnitRoleKey('Group::Stufe::Stufenleiter')).toBe('Stufenleiter');
      expect(getUnitRoleKey('Group::Pfadi::Einheitsleitung')).toBe('Einheitsleitung');
      expect(getUnitRoleKey('Leader')).toBe('Leader');
    });

    it('klassifiziert Leitende, Teilnehmende und Andere', () => {
      // Cevi
      expect(classifyUnitRole('Group::Stufe::Stufenleiter', 'CEVI')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Stufe::Gruppenleiter', 'CEVI')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Stufe::Teilnehmer', 'CEVI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Stufe::Coach', 'CEVI')).toBe('ANDERE');

      // Pfadi
      expect(classifyUnitRole('Group::Pfadi::Einheitsleitung', 'PFADI')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Woelfe::Mitleitung', 'PFADI')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Pfadi::Leitpfadi', 'PFADI')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Pfadi::Pfadi', 'PFADI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Woelfe::Wolf', 'PFADI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Biber::Biber', 'PFADI')).toBe('TEILNEHMER');

      // Jubla
      expect(classifyUnitRole('Group::ChildGroup::Leader', 'JUBLA')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Flock::Guide', 'JUBLA')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::ChildGroup::Child', 'JUBLA')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Flock::Coach', 'JUBLA')).toBe('ANDERE');
    });
  });
});
