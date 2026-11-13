import { ORGANIZATIONS, getOrganizationByDbType, type OrganizationType } from '@schichtplan/shared';

/** Verbände in fester Reihenfolge, wie sie im Admin-Portal erscheinen */
export const ORGANIZATION_TYPES: readonly OrganizationType[] = ['CEVI', 'PFADI', 'JUBLA', 'OTHER'];

/** Verbandsfilter des Admin-Portals: alle oder ein bestimmter Verband */
export type OrgFilter = OrganizationType | 'ALL';

/** Kurzname im Admin: Cevi, Pfadi, Jubla, Vereine */
export function organizationLabel(type: OrganizationType | null | undefined, plural = false): string {
  const org = getOrganizationByDbType(type ?? 'CEVI');
  if (org.dbType === 'OTHER') return plural ? 'Vereine' : 'Verein';
  return org.orgName;
}

/** Name der Mitglieder-Datenbank (Cevi.DB, PBS MiData, Jubla-DB). Vereine haben keine. */
export function providerLabel(type: OrganizationType | null | undefined): string | null {
  const org = getOrganizationByDbType(type ?? 'CEVI');
  return org.dbType === 'OTHER' ? null : org.authProviderShort;
}

/** Verbände mit Hitobito-Anmeldung (für den Admin-Bereich nötig) */
export const HITOBITO_ORGANIZATIONS = Object.values(ORGANIZATIONS).filter((o) => o.dbType !== 'OTHER');

/** Alle Mitglieder-Datenbanken als Text: «Cevi.DB, PBS MiData oder Jubla-DB» */
export const HITOBITO_PROVIDERS_TEXT = (() => {
  const names = HITOBITO_ORGANIZATIONS.map((o) => o.authProviderShort);
  return `${names.slice(0, -1).join(', ')} oder ${names[names.length - 1]}`;
})();

const FILTER_KEY = 'admin.orgFilter';

/** Zuletzt gewählter Verbandsfilter (nur Komfort, darf fehlen) */
export function loadOrgFilter(): OrgFilter {
  try {
    const value = window.localStorage.getItem(FILTER_KEY);
    if (value && (value === 'ALL' || (ORGANIZATION_TYPES as readonly string[]).includes(value))) {
      return value as OrgFilter;
    }
  } catch {
    // Speicher gesperrt (privates Fenster): Standard
  }
  return 'ALL';
}

export function saveOrgFilter(value: OrgFilter) {
  try {
    window.localStorage.setItem(FILTER_KEY, value);
  } catch {
    // ohne Speicher gilt der Filter nur bis zum Neuladen
  }
}

/** Gehört die Abteilung zum gewählten Verband? Ältere Einträge ohne Feld gelten als Cevi. */
export const matchesOrg = (organization: OrganizationType | null | undefined, filter: OrgFilter) =>
  filter === 'ALL' || (organization ?? 'CEVI') === filter;
