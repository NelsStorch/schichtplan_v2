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
  /** Leitung der Einheit in der Anrede des Hilfe-Centers (z. B. «Abteilungsleitung») */
  leadTerm: string;
  /** Endung der Umgebungsvariablen für den Mailversand (SMTP_USER_<ENV_SUFFIX>) */
  envSuffix: string;
  authProviderName: string;
  authProviderShort: string;
  primaryColor: string;
  /** Akzentfarbe für Text auf hellem bzw. dunklem Grund (Hilfe-Center), je mit ausreichendem Kontrast */
  accentInkLight: string;
  accentInkDark: string;
  logoUrl: string;
  /** Optionaler Hinweis, dass das Projekt unabhängig vom Verband ist (Footer, Login) */
  independentNotice?: string;
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
    leadTerm: 'Abteilungsleitung',
    envSuffix: 'CEVI',
    authProviderName: 'Cevi.DB (Hitobito)',
    authProviderShort: 'Cevi.DB',
    primaryColor: '#e11d48',
    accentInkLight: '#be123c',
    accentInkDark: '#fb7185',
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
    leadTerm: 'Abteilungsleitung',
    envSuffix: 'PFADI',
    authProviderName: 'PBS MiData (Hitobito)',
    authProviderShort: 'PBS MiData',
    // Bewusst eigenes Erscheinungsbild (Tannengrün/Orange/Marineblau, eigenes Zeichen aus Kalender, Uhr und
    // Zahnrad): kein PBS-Logo, keine PBS-Farbe und kein PBS-Favicon, damit die Seite nicht als offizielle
    // PBS-Anwendung wirkt.
    primaryColor: '#20553e',
    accentInkLight: '#20553e',
    accentInkDark: '#5dbb8a',
    logoUrl: '/images/pfadi-schichtplan-logo.svg',
    independentNotice: 'Unabhängiges Projekt, nicht von der Pfadibewegung Schweiz (PBS) betrieben oder herausgegeben.',
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
    leadTerm: 'Scharleitung',
    envSuffix: 'JUBLA',
    authProviderName: 'Jubla-Datenbank (Hitobito)',
    authProviderShort: 'Jubla-DB',
    primaryColor: '#283583',
    accentInkLight: '#283583',
    accentInkDark: '#66b1e2',
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
    leadTerm: 'Vereinsleitung / Vorstand',
    envSuffix: 'VEREIN',
    authProviderName: 'E-Mail & Passwort',
    authProviderShort: 'E-Mail',
    primaryColor: '#2563eb',
    accentInkLight: '#1d4ed8',
    accentInkDark: '#93c5fd',
    logoUrl: '/images/verein-logo.svg',
    metaDescription:
      'Kostenlose Helferliste online für Vereinsfeste, Turniere und Anlässe aller Art. Helfer*innen tragen sich per Link ein, ohne App und ohne Passwort.',
    heroHeadlineHighlight: 'für Vereine & Feste',
  },
};

/** Alle Verbandsdomains (cevi-, pfadi-, jubla-, vereins-schichtplan.ch): einzige Quelle für Listen im Code */
export const ORGANIZATION_DOMAINS: readonly string[] = Object.values(ORGANIZATIONS).map((o) => o.domain);

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

  // Lokale Entwicklung oder Test-Hosts ohne Verbandsdomain (z. B. pfadi.localhost oder illnau.pfadi.localhost):
  // erst die Verbände mit eigener Kennung, dann Cevi
  for (const org of Object.values(ORGANIZATIONS)) {
    if (org.slug !== 'cevi' && clean.includes(org.slug)) return org.slug;
  }

  return 'cevi';
}

/**
 * Verband der Domain, auf der der Browser gerade ist (ohne Fenster: Cevi).
 * Nur in Ereignis-Handlern und Effekten verwenden. Beim Rendern fehlt auf dem Server der Host, dann ergäbe
 * das Cevi und React korrigiert Link-Attribute bei der Hydration nicht: dort `useOrganization()` aus
 * `@schichtplan/ui` bzw. `getOrganization(host)` mit dem Host der Anfrage nehmen.
 */
export function getBrowserOrganization(): OrganizationConfig {
  return getOrganization(typeof window !== 'undefined' ? window.location.host : undefined);
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
