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
import { deriveCeviDbFields, hitobitoRoleKind, hitobitoRoles } from './hitobito.js';

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
        defaultBaseUrl: 'https://db.scout.ch',
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
      expect(isDepartmentLeaderRole('Group::Ortsgruppe::AdministratorCeviDB', 'CEVI')).toBe(false);
      // Regionen: Mitgliederorganisation und Sektion, ohne reine Datenpflege-Rollen
      expect(isDepartmentLeaderRole('Group::MitgliederorganisationGeschaeftsstelle::Geschaeftsleiter', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::MitgliederorganisationVorstand::Praesidium', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Sektion::Administrator', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Mitgliederorganisation::Administrator', 'CEVI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::MitgliederorganisationGeschaeftsstelle::AdminOrtsgruppen', 'CEVI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::Stufe::Stufenleiter', 'CEVI')).toBe(false);
    });

    it('erkennt Pfadi-Leitungsrollen (hitobito_pbs), auch Regions- und Kantonsleitung', () => {
      expect(isDepartmentLeaderRole('Group::Abteilung::Abteilungsleitung', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::AbteilungsleitungStv', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::Sekretariat', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Region::Regionalleitung', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Kantonalverband::Kantonsleitung', 'PFADI')).toBe(true);
      // Präsidium darf in MiData nur lesen
      expect(isDepartmentLeaderRole('Group::Abteilung::Praesidium', 'PFADI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::Abteilung::VizePraesidium', 'PFADI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::Pfadi::Einheitsleitung', 'PFADI')).toBe(false);
    });

    it('erkennt Jubla-Leitungsrollen (Scharleitung, Lagerleitung, Regional- und Kantonsleitung)', () => {
      expect(isDepartmentLeaderRole('Group::Flock::Leader', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Flock::CampLeader', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::RegionalBoard::Leader', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::StateBoard::Leader', 'JUBLA')).toBe(true);
      // Präses darf in der Jubla-DB nur lesen
      expect(isDepartmentLeaderRole('Group::Flock::President', 'JUBLA')).toBe(false);
      expect(isDepartmentLeaderRole('Group::RegionalBoard::Member', 'JUBLA')).toBe(false);
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
      // Leitpfadi und Leitwolf sind Kinder mit einer Gruppenleitung innerhalb der Stufe
      expect(classifyUnitRole('Group::Pfadi::Leitpfadi', 'PFADI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Woelfe::Leitwolf', 'PFADI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Pfadi::Pfadi', 'PFADI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Woelfe::Wolf', 'PFADI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Biber::Biber', 'PFADI')).toBe('TEILNEHMER');

      // Jubla
      expect(classifyUnitRole('Group::ChildGroup::Leader', 'JUBLA')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Flock::Guide', 'JUBLA')).toBe('ANDERE');
      expect(classifyUnitRole('Group::ChildGroup::Child', 'JUBLA')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Flock::Coach', 'JUBLA')).toBe('ANDERE');
    });
  });

  describe('Profil-Auswertung mit deriveCeviDbFields (Pfadi & Jubla)', () => {
    it('wertet Pfadi-Profil korrekt aus (Abteilungsleitung & Wölfe)', () => {
      const pfadiProfile = {
        first_name: 'Fiona',
        last_name: 'Muster',
        nickname: 'Chinchilla',
        email: 'chinchilla@pfadi-beispiel.ch',
        primary_group_id: 502,
        roles: [
          { role_class: 'Group::Abteilung::Abteilungsleitung', group_id: 501, group_name: 'Pfadi Uster' },
          { role_class: 'Group::Woelfe::Einheitsleitung', group_id: 502, group_name: 'Meute Rikki-Tikki' },
        ],
      };

      const derived = deriveCeviDbFields(pfadiProfile, 'PFADI');
      expect(derived.isDepartmentLeader).toBe(true);
      expect(derived.ortsgruppeId).toBe(501);
      expect(derived.leaderGroupIds).toContain(501);
      expect(derived.stufen).toHaveLength(1);
      expect(derived.stufen[0]).toMatchObject({
        groupId: 502,
        groupName: 'Meute Rikki-Tikki',
        kind: 'LEITUNG',
        isPrimary: true,
      });
    });

    it('wertet Jubla-Profil korrekt aus (Scharleitung & Kindergruppe)', () => {
      const jublaProfile = {
        first_name: 'Lukas',
        last_name: 'Keller',
        nickname: 'Panda',
        email: 'panda@jubla-beispiel.ch',
        primary_group_id: 602,
        roles: [
          { role_class: 'Group::Flock::Leader', group_id: 601, group_name: 'Jubla Sursee' },
          { role_class: 'Group::ChildGroup::Leader', group_id: 602, group_name: 'Gruppe Tiger' },
        ],
      };

      const derived = deriveCeviDbFields(jublaProfile, 'JUBLA');
      expect(derived.isDepartmentLeader).toBe(true);
      expect(derived.ortsgruppeId).toBe(601);
      expect(derived.leaderGroupIds).toContain(601);
      expect(derived.stufen).toHaveLength(1);
      expect(derived.stufen[0]).toMatchObject({
        groupId: 602,
        groupName: 'Gruppe Tiger',
        kind: 'LEITUNG',
        isPrimary: true,
      });
    });
  });

  describe('Rollen-Snapshot für die Berechtigungs-Diagnose', () => {
    it('speichert nur Rollentyp und Gruppe, ohne Duplikate und weitere Profilfelder', () => {
      const roles = hitobitoRoles({
        email: 'x@example.ch',
        address: 'Geheimweg 1',
        roles: [
          { role_class: 'Group::Jungschar::Abteilungsleiter', role_name: 'Abteilungsleiter', group_id: '161', group_name: 'JS Illnau', extra: 'x' },
          { role_class: 'Group::Jungschar::Abteilungsleiter', group_id: 161, group_name: 'JS Illnau' },
          { role_class: 'Group::Vorstand::Mitglied', group_name: 'Vorstand' },
          { group_id: 5 },
          'kaputt',
        ],
      });
      expect(roles).toEqual([
        { roleClass: 'Group::Jungschar::Abteilungsleiter', roleName: 'Abteilungsleiter', groupId: 161, groupName: 'JS Illnau' },
        { roleClass: 'Group::Vorstand::Mitglied', roleName: null, groupId: null, groupName: 'Vorstand' },
      ]);
      expect(hitobitoRoles(null)).toEqual([]);
    });

    it('ist Teil der abgeleiteten Felder', () => {
      const derived = deriveCeviDbFields({ roles: [{ role_class: 'Group::Flock::Leader', group_id: 601 }] }, 'JUBLA');
      expect(derived.roles).toEqual([{ roleClass: 'Group::Flock::Leader', roleName: null, groupId: 601, groupName: null }]);
    });

    it('wertet Rollen pro Verband aus (Cevi, Pfadi, Jubla)', () => {
      // Cevi
      expect(hitobitoRoleKind('Group::Jungschar::Abteilungsleiter', 'CEVI')).toBe('DEPARTMENT_LEADER');
      expect(hitobitoRoleKind('Group::Stufe::Stufenleiter', 'CEVI')).toBe('LEITUNG');
      expect(hitobitoRoleKind('Group::Stufe::Teilnehmer', 'CEVI')).toBe('TEILNEHMER');
      expect(hitobitoRoleKind('Group::Vorstand::Mitglied', 'CEVI')).toBe('NONE');
      // Pfadi
      expect(hitobitoRoleKind('Group::Abteilung::Abteilungsleitung', 'PFADI')).toBe('DEPARTMENT_LEADER');
      expect(hitobitoRoleKind('Group::Woelfe::Einheitsleitung', 'PFADI')).toBe('LEITUNG');
      expect(hitobitoRoleKind('Group::Pfadi::Pfadi', 'PFADI')).toBe('TEILNEHMER');
      expect(hitobitoRoleKind('Group::Abteilung::Coach', 'PFADI')).toBe('NONE');
      // Jubla
      expect(hitobitoRoleKind('Group::Flock::Leader', 'JUBLA')).toBe('DEPARTMENT_LEADER');
      expect(hitobitoRoleKind('Group::ChildGroup::Leader', 'JUBLA')).toBe('LEITUNG');
      expect(hitobitoRoleKind('Group::ChildGroup::Child', 'JUBLA')).toBe('TEILNEHMER');
      expect(hitobitoRoleKind('Group::Flock::Coach', 'JUBLA')).toBe('NONE');
    });
  });
});
