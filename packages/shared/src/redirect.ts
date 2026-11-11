import { getOrganization, type OrganizationType } from './organizations.js';

// Platzhalter-Basis, um relative Pfade so aufzulösen, wie es der Browser tut
const RELATIVE_BASE = 'https://relative.invalid';

/**
 * Bereinigt ein Weiterleitungsziel nach dem Login (`return_to`), damit das Login nicht als
 * offener Redirect auf fremde Seiten missbraucht werden kann.
 *
 * Erlaubt sind relative Pfade sowie URLs auf `rootDomain` und deren Subdomains
 * (optional zusätzlich localhost für die Entwicklung). Alles andere ergibt `fallback`.
 */
export function safeReturnTo(
  value: unknown,
  rootDomain: string,
  { allowLocalhost = false, fallback = '/' }: { allowLocalhost?: boolean; fallback?: string } = {}
): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;

  let url: URL;
  try {
    // Auflösen statt Präfixe vergleichen: fängt auch `//host`, `/\host` und Tabs/Zeilenumbrüche ab
    url = new URL(value, RELATIVE_BASE);
  } catch {
    return fallback;
  }

  if (url.origin === RELATIVE_BASE) return `${url.pathname}${url.search}${url.hash}`;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;

  const host = url.hostname.toLowerCase();
  const root = rootDomain.replace(/^\./, '').toLowerCase();
  const isOwnDomain = host === root || host.endsWith(`.${root}`);
  // *.localhost für lokale Abteilungs-Subdomains (z. B. illnau.localhost:3000)
  const isLocal = allowLocalhost && (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost'));

  if (isOwnDomain && url.protocol === 'https:') return url.toString();
  if (isLocal) return url.toString();
  return fallback;
}

/**
 * Ermittelt die Basis-Domain (Root Domain) aus dem aktuellen Hostnamen.
 * Berücksichtigt auch Staging/Dev-Umgebungen wie dev.cevi-schichtplan.ch.
 */
export function getRootDomain(hostname?: string): string {
  if (!hostname) {
    if (typeof window !== 'undefined') {
      hostname = window.location.hostname;
    } else {
      return 'cevi-schichtplan.ch';
    }
  }

  const host = hostname.toLowerCase().split(',')[0].trim().replace(/:\d+$/, '');
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) {
    return 'localhost';
  }

  // Erkennung von dev-Umgebungen (z. B. dev.cevi-schichtplan.ch, login.dev.pfadi-schichtplan.ch)
  const devMatch = host.match(/(?:^|\.)(dev\.[a-z0-9-]+\.[a-z]+)$/);
  if (devMatch) {
    return devMatch[1];
  }

  // Standard für cevi-schichtplan.ch und sonstige 2-Level-Domains
  const parts = host.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : host;
}

/**
 * Erzeugt die zentrale SSO-Login-URL (login.<rootDomain>) für den aktuellen Kontext.
 */
export function getLoginUrl(targetUrl?: string, path = '/'): string {
  if (typeof window === 'undefined') return '/login';
  const { hostname, protocol, href } = window.location;
  const target = encodeURIComponent(targetUrl || href);
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
    return `http://localhost:3002${path}?return_to=${target}`;
  }
  const root = getRootDomain(hostname);
  return `${protocol}//login.${root}${path}?return_to=${target}`;
}

/** Seite im Login-Portal, auf der man Abteilung und Stufen angibt (mit Rücksprung) */
export function getDepartmentSetupUrl(targetUrl?: string): string {
  return getLoginUrl(targetUrl, '/abteilung');
}

/**
 * Link auf eine Abteilungs-Subdomain (z. B. illnau.cevi-schichtplan.ch oder illnau.dev.pfadi-schichtplan.ch).
 * Unterstützt optional die Organisation oder Verbandsdomain für domänenübergreifende Links (z. B. aus dem Admin-Portal).
 */
export function getDepartmentUrl(slug: string, path = '/', domainOrOrg?: OrganizationType | string): string {
  const cleanPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined' && !domainOrOrg) return `/${slug}${cleanPath}`;
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
    return `http://${slug}.localhost:3000${cleanPath}`;
  }
  let root = domainOrOrg ? getOrganization(domainOrOrg).domain : getRootDomain(hostname);
  if (hostname && (hostname.startsWith('dev.') || hostname.includes('.dev.')) && !root.startsWith('dev.')) {
    root = `dev.${root}`;
  }
  return `${protocol}//${slug}.${root}${cleanPath}`;
}

/** Landingpage (cevi-schichtplan.ch bzw. lokal Port 3001) */
export function getLandingUrl(path = '/', host?: string): string {
  const cleanPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  const currentHost = host || (typeof window !== 'undefined' ? window.location.host : '');
  if (!currentHost) return cleanPath || '/';
  const hostname = currentHost.split(':')[0].trim().toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
    return `http://localhost:3001${cleanPath}`;
  }
  const root = getRootDomain(hostname);
  return `https://${root}${cleanPath}`;
}

/**
 * Link ins Hilfe-Center, z. B. helpUrl('/ok/zugang/').
 * Unterstützt dynamisch die Verbands-Domain (z. B. hilfe.pfadi-schichtplan.ch).
 */
export function helpUrl(path = '/', host?: string): string {
  const currentHost = host || (typeof window !== 'undefined' ? window.location.host : '');
  const rawRoot = currentHost ? getRootDomain(currentHost).replace(/^dev\./, '') : 'cevi-schichtplan.ch';
  const root = rawRoot === 'localhost' ? getOrganization(currentHost).domain : rawRoot;
  const cleanPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `https://hilfe.${root}${cleanPath}`;
}

/**
 * Link zum Status-Portal (Uptime Kuma). Unterstützt dynamisch die Verbands-Domain (z. B. status.vereins-schichtplan.ch).
 */
export function statusUrl(path = '/', host?: string): string {
  const currentHost = host || (typeof window !== 'undefined' ? window.location.host : '');
  const rawRoot = currentHost ? getRootDomain(currentHost).replace(/^dev\./, '') : 'cevi-schichtplan.ch';
  const root = rawRoot === 'localhost' ? getOrganization(currentHost).domain : rawRoot;
  const cleanPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `https://status.${root}${cleanPath}`;
}

/** Datenschutzerklärung auf der Landingpage der jeweiligen Verbandsdomain (ohne Host: cevi-schichtplan.ch) */
export function privacyUrl(host?: string): string {
  const currentHost = host || (typeof window !== 'undefined' ? window.location.host : '');
  const root = currentHost ? getRootDomain(currentHost) : 'cevi-schichtplan.ch';
  if (root === 'localhost') return 'http://localhost:3001/datenschutz';
  return `https://${root}/datenschutz`;
}

/** Startseite des zentralen Logins der Verbandsdomain (z. B. https://login.pfadi-schichtplan.ch), ohne Rücksprung-Parameter */
export function loginBaseUrl(host?: string): string {
  const currentHost = host || (typeof window !== 'undefined' ? window.location.host : '');
  const root = currentHost ? getRootDomain(currentHost) : 'cevi-schichtplan.ch';
  if (root === 'localhost') return 'http://localhost:3002';
  return `https://login.${root}`;
}

/** Ziel nach dem Login ohne return_to: eigene Abteilung, sonst Landingpage (nie zurück aufs Login). */
export function getDefaultDestination(homeDepartmentSlug?: string | null, domainOrOrg?: OrganizationType | string): string {
  return homeDepartmentSlug ? getDepartmentUrl(homeDepartmentSlug, '/', domainOrOrg) : getLandingUrl('/', typeof domainOrOrg === 'string' ? domainOrOrg : undefined);
}
