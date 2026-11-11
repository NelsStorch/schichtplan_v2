export type OrganizationSlug = 'cevi' | 'pfadi' | 'jubla' | 'verein';
export type OrganizationType = 'CEVI' | 'PFADI' | 'JUBLA' | 'OTHER';

export interface OrganizationConfig {
  slug: OrganizationSlug;
  dbType: OrganizationType;
  name: string;
  orgName: string;
  domain: string;
  targetGroup: string;
  unitTerm: string;
  unitTermPlural: string;
  nicknameTerm: string;
  authProviderName: string;
  authProviderShort: string;
  primaryColor: string;
  logoUrl: string;
  metaDescription: string;
  heroHeadlineHighlight: string;
}

export const ORGANIZATIONS: Record<OrganizationSlug, OrganizationConfig> = {
  cevi: {
    slug: 'cevi',
    dbType: 'CEVI',
    name: 'Cevi Schichtplan',
    orgName: 'Cevi',
    domain: 'cevi-schichtplan.ch',
    targetGroup: 'Cevi-Abteilungen',
    unitTerm: 'Abteilung',
    unitTermPlural: 'Abteilungen',
    nicknameTerm: 'Cevi-Name',
    authProviderName: 'Cevi.DB (Hitobito)',
    authProviderShort: 'Cevi.DB',
    primaryColor: '#e11d48',
    logoUrl: '/images/cevi-logo.svg',
    metaDescription:
      'Kostenlose Helferliste online für Chilbi, Lager und Anlässe von Cevi-Abteilungen. Helfer*innen tragen sich per Link ein, ohne App und ohne Passwort.',
    heroHeadlineHighlight: 'für Cevi-Abteilungen',
  },
  pfadi: {
    slug: 'pfadi',
    dbType: 'PFADI',
    name: 'Pfadi Schichtplan',
    orgName: 'Pfadi',
    domain: 'pfadi-schichtplan.ch',
    targetGroup: 'Pfadi-Abteilungen',
    unitTerm: 'Abteilung',
    unitTermPlural: 'Abteilungen',
    nicknameTerm: 'Pfadiname',
    authProviderName: 'PBS MiData (Hitobito)',
    authProviderShort: 'PBS MiData',
    primaryColor: '#64284b',
    logoUrl: '/images/pfadi-logo.svg',
    metaDescription:
      'Kostenlose Helferliste online für Pfingstlager, SoLa und Anlässe von Pfadi-Abteilungen. Helfer*innen tragen sich per Link ein, ohne App und ohne Passwort.',
    heroHeadlineHighlight: 'für Pfadi-Abteilungen',
  },
  jubla: {
    slug: 'jubla',
    dbType: 'JUBLA',
    name: 'Jubla Schichtplan',
    orgName: 'Jubla',
    domain: 'jubla-schichtplan.ch',
    targetGroup: 'Jubla-Scharen',
    unitTerm: 'Schar',
    unitTermPlural: 'Scharen',
    nicknameTerm: 'Leitername',
    authProviderName: 'Jubla-Datenbank (Hitobito)',
    authProviderShort: 'Jubla-DB',
    primaryColor: '#283583',
    logoUrl: '/images/jubla-logo.svg',
    metaDescription:
      'Kostenlose Helferliste online für Lager, Scharanlässe und Feste von Jubla-Scharen. Helfer*innen tragen sich per Link ein, ohne App und ohne Passwort.',
    heroHeadlineHighlight: 'für Jubla-Scharen',
  },
  verein: {
    slug: 'verein',
    dbType: 'OTHER',
    name: 'Vereins Schichtplan',
    orgName: 'Verein',
    domain: 'vereins-schichtplan.ch',
    targetGroup: 'Vereine & Festkomitees',
    unitTerm: 'Verein',
    unitTermPlural: 'Vereine',
    nicknameTerm: 'Spitzname',
    authProviderName: 'E-Mail & Passwort',
    authProviderShort: 'E-Mail',
    primaryColor: '#2563eb',
    logoUrl: '/images/verein-logo.svg',
    metaDescription:
      'Kostenlose Helferliste online für Vereinsfeste, Turniere und Anlässe aller Art. Helfer*innen tragen sich per Link ein, ohne App und ohne Passwort.',
    heroHeadlineHighlight: 'für Vereine & Feste',
  },
};

/**
 * Ermittelt den Verbands-Slug aus einem Hostnamen oder Slug.
 * Fallback ist immer 'cevi'.
 */
export function getOrganizationSlugFromHost(hostnameOrSlug?: string | null): OrganizationSlug {
  if (!hostnameOrSlug) return 'cevi';
  let clean = hostnameOrSlug.toLowerCase().trim();
  // Ganze URLs (z. B. return_to) auf den Hostnamen reduzieren
  if (clean.includes('://')) {
    try {
      clean = new URL(clean).hostname;
    } catch {
      return 'cevi';
    }
  }
  clean = clean.split(',')[0].trim().split(':')[0].replace(/\.$/, '');

  if (clean === 'pfadi') return 'pfadi';
  if (clean === 'jubla') return 'jubla';
  if (clean === 'verein' || clean === 'other') return 'verein';
  if (clean === 'cevi') return 'cevi';

  // Nur über das Domain-Ende: «pfadi-schichtplan-fans.vereins-schichtplan.ch» ist ein Verein, keine Pfadi
  for (const org of Object.values(ORGANIZATIONS)) {
    if (clean === org.domain || clean.endsWith(`.${org.domain}`)) return org.slug;
  }

  return 'cevi';
}

/**
 * Liefert die Konfiguration für eine Organisation (Cevi, Pfadi, Jubla oder Verein).
 */
export function getOrganization(hostnameOrSlug?: string | null): OrganizationConfig {
  const slug = getOrganizationSlugFromHost(hostnameOrSlug);
  return ORGANIZATIONS[slug] ?? ORGANIZATIONS.cevi;
}

/**
 * Ermittelt den Datenbank-Enum-Wert (`OrganizationType`) aus einem Hostnamen oder Slug.
 */
export function getOrganizationTypeFromHost(hostnameOrSlug?: string | null): OrganizationType {
  return getOrganization(hostnameOrSlug).dbType;
}

/**
 * Liefert die Organisations-Konfiguration anhand des Datenbank-Enum-Werts (`OrganizationType`).
 */
export function getOrganizationByDbType(dbType?: string | null): OrganizationConfig {
  switch (dbType?.toUpperCase()) {
    case 'PFADI':
      return ORGANIZATIONS.pfadi;
    case 'JUBLA':
      return ORGANIZATIONS.jubla;
    case 'OTHER':
    case 'VEREIN':
      return ORGANIZATIONS.verein;
    default:
      return ORGANIZATIONS.cevi;
  }
}
