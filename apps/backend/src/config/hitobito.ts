/**
 * Zuordnung von Hitobito-Rollen (Cevi.DB, PBS MiData, Jubla-DB) und -Feldern zu Funktionen im Schichtplan.
 *
 * Alles hier ist Konfiguration: Vorgaben stehen unten, jede Liste lässt sich ohne Codeänderung
 * über die Umgebung (`.env` auf dem Server) überschreiben. Listen sind kommagetrennt.
 * Die Rollen stammen aus `roles[].role_class` des Hitobito-Profils (z. B. `Group::Jungschar::Abteilungsleiter`).
 *
 * Wird bei jedem Aufruf neu gelesen (nicht beim Import), damit `.env`-Werte von dotenv sicher gelten.
 */
import { CEVI_REGIONAL_LEADER_ROLE_CLASSES } from '@schichtplan/shared';

function list(value: string | undefined, fallback: readonly string[]): string[] {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [...fallback];
}

export interface HitobitoConfig {
  /**
   * OAuth-Scopes beim Login. `groups` braucht die Gruppen-API für die Gruppenstruktur (Jungschar, Ortsgruppe).
   * Muss in der Cevi.DB bei der Applikation freigeschaltet sein. Env: CEVIDB_OAUTH_SCOPES
   */
  oauthScopes: string;

  /**
   * Profilfeld mit der Gruppen-ID der Ortsgruppe. Daraus folgt die Abteilung
   * (`departments.ceviDbGroupId` bzw. `hitobitoGroupId`), der Personen beim Login automatisch zugeordnet werden.
   * Env: CEVIDB_ORTSGRUPPE_FIELD
   */
  ortsgruppeField: string;

  /**
   * Rollen (`role_class`), die als Abteilungsleitung gelten: Wer sie hat, darf für die eigene
   * Ortsgruppe eine Abteilung (Subdomain) anlegen. Env: CEVIDB_DEPARTMENT_LEADER_ROLES
   */
  departmentLeaderRoleClasses: string[];

  /**
   * Rollen, deren `role_class` mit diesem Präfix beginnt, gehören zu einer Stufe.
   * Die Gruppe der Rolle ist die Stufe (z. B. «Hiskia»). Env: CEVIDB_STUFE_ROLE_PREFIX
   */
  stufeRoleClassPrefix: string;

  /**
   * Rollen innerhalb einer Stufe (letzter Teil der `role_class`), die als Leitung gelten.
   * Alle anderen Rollen der Stufe zählen als Mitglied der Stufe, bleiben aber «Andere».
   * Env: CEVIDB_STUFE_LEADER_ROLES
   */
  stufeLeaderRoles: string[];

  /** Rollen innerhalb einer Stufe, die als Teilnehmer*in gelten. Env: CEVIDB_STUFE_PARTICIPANT_ROLES */
  stufeParticipantRoles: string[];
}

export type CeviDbConfig = HitobitoConfig;

export function hitobitoConfig(): HitobitoConfig {
  return {
    oauthScopes: process.env.CEVIDB_OAUTH_SCOPES?.trim() || 'email name with_roles groups',
    ortsgruppeField: process.env.CEVIDB_ORTSGRUPPE_FIELD?.trim() || 'ortsgruppe_id',
    departmentLeaderRoleClasses: list(process.env.CEVIDB_DEPARTMENT_LEADER_ROLES, [
      'Group::Jungschar::Abteilungsleiter',
      'Group::Jungschar::Abteilungsleiterin',
      'Group::Abteilung::Abteilungsleiter',
      'Group::Abteilung::Abteilungsleiterin',
      'Group::Ortsgruppe::Abteilungsleiter',
      'Group::Ortsgruppe::Abteilungsleiterin',
      // Mitgliederorganisation und Sektion (Regionen): eigener Schichtplan für ihre Ebene
      ...CEVI_REGIONAL_LEADER_ROLE_CLASSES,
    ]),
    stufeRoleClassPrefix: process.env.CEVIDB_STUFE_ROLE_PREFIX?.trim() || 'Group::Stufe::',
    stufeLeaderRoles: list(process.env.CEVIDB_STUFE_LEADER_ROLES, [
      'Gruppenleiter',
      'Gruppenleiterin',
      'Stufenleiter',
      'Stufenleiterin',
      'Stufenleitung',
      'Gruppenleitung',
    ]),
    stufeParticipantRoles: list(process.env.CEVIDB_STUFE_PARTICIPANT_ROLES, ['Teilnehmer', 'Teilnehmerin']),
  };
}

export const cevidbConfig = hitobitoConfig;
