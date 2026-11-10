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

  const host = hostname.toLowerCase();
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
 * Link auf eine Abteilungs-Subdomain (z. B. illnau.cevi-schichtplan.ch oder illnau.dev.cevi-schichtplan.ch).
 */
export function getDepartmentUrl(slug: string, path = '/'): string {
  if (typeof window === 'undefined') return `/${slug}${path}`;
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
    return `http://${slug}.localhost:3000${path}`;
  }
  const root = getRootDomain(hostname);
  return `${protocol}//${slug}.${root}${path}`;
}

/** Landingpage (cevi-schichtplan.ch bzw. lokal Port 3001) */
export function getLandingUrl(path = '/'): string {
  if (typeof window === 'undefined') return path;
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
    return `http://localhost:3001${path}`;
  }
  return `${protocol}//${getRootDomain(hostname)}${path}`;
}

/**
 * Link ins Hilfe-Center, z. B. helpUrl('/ok/zugang/'). Bewusst immer die Produktiv-Hilfe:
 * Die Inhalte sind für alle Umgebungen gleich, und eine feste URL vermeidet Hydration-Unterschiede.
 */
export const HELP_URL = 'https://hilfe.cevi-schichtplan.ch';

export function helpUrl(path = '/'): string {
  return `${HELP_URL}${path}`;
}

/**
 * Link zum Status-Portal (Uptime Kuma). Wie Hilfe und Datenschutz fest auf Produktion.
 */
export const STATUS_URL = 'https://status.cevi-schichtplan.ch';

export function statusUrl(path = '/'): string {
  return `${STATUS_URL}${path}`;
}

/** Datenschutzerklärung auf der Landingpage, wie die Hilfe fest auf Produktion (gilt für alle Subdomains) */
export const PRIVACY_URL = 'https://cevi-schichtplan.ch/datenschutz';

/** Ziel nach dem Login ohne return_to: eigene Abteilung, sonst Landingpage (nie zurück aufs Login). */
export function getDefaultDestination(homeDepartmentSlug?: string | null): string {
  return homeDepartmentSlug ? getDepartmentUrl(homeDepartmentSlug) : getLandingUrl();
}
