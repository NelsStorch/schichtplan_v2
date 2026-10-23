/**
 * Zuordnung von Cevi.DB-Rollen und -Feldern zu Funktionen im Schichtplan.
 *
 * Alles hier ist Konfiguration: Vorgaben stehen unten, jede Liste lässt sich ohne Codeänderung
 * über die Umgebung (`.env` auf dem Server) überschreiben. Listen sind kommagetrennt.
 * Die Rollen stammen aus `roles[].role_class` des Cevi.DB-Profils (z. B. `Group::Jungschar::Abteilungsleiter`).
 *
 * Wird bei jedem Aufruf neu gelesen (nicht beim Import), damit `.env`-Werte von dotenv sicher gelten.
 */

function list(value: string | undefined, fallback: readonly string[]): string[] {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [...fallback];
}

export interface CeviDbConfig {
  /**
   * Profilfeld mit der Gruppen-ID der Ortsgruppe. Daraus folgt die Abteilung
   * (`departments.ceviDbGroupId`), der Personen beim Login automatisch zugeordnet werden.
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

export function cevidbConfig(): CeviDbConfig {
  return {
    ortsgruppeField: process.env.CEVIDB_ORTSGRUPPE_FIELD?.trim() || 'ortsgruppe_id',
    departmentLeaderRoleClasses: list(process.env.CEVIDB_DEPARTMENT_LEADER_ROLES, [
      'Group::Jungschar::Abteilungsleiter',
      'Group::Jungschar::Abteilungsleiterin',
      'Group::Abteilung::Abteilungsleiter',
      'Group::Abteilung::Abteilungsleiterin',
      'Group::Ortsgruppe::Abteilungsleiter',
      'Group::Ortsgruppe::Abteilungsleiterin',
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
