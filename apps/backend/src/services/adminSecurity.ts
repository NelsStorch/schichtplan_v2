/**
 * Zusätzliche Hürden für die Schnittstelle der globalen Admins (Admin-Portal).
 *
 * Das Login-Cookie gilt für alle Subdomains, und Traefik leitet `/api` auf jeder Subdomain ans Backend.
 * Ohne diese Prüfungen könnte ein Skript auf einer Abteilungsseite oder auf Dev (`*.dev.`) mit dem
 * Cookie einer eingeloggten Admin-Person Admin-Aktionen auslösen.
 */

/** Wie man sich angemeldet hat (steht im Token als `amr`) */
export type LoginMethodClaim = 'cevidb' | 'hitobito' | 'password' | 'ceviname' | 'nickname';

export interface AdminSecurityConfig {
  rootDomain: string;
  /** Lokal: localhost und *.localhost zulassen */
  allowLocalhost: boolean;
  /** Höchstalter der Anmeldung in Sekunden */
  maxSessionAgeSeconds: number;
  /** Nur Anmeldungen über Cevi.DB zählen (Produktion) */
  requireCeviDbLogin: boolean;
}

export function adminSecurityConfig(env: NodeJS.ProcessEnv = process.env): AdminSecurityConfig {
  const production = env.NODE_ENV === 'production';
  const hours = Number(env.ADMIN_SESSION_MAX_HOURS);
  return {
    rootDomain: (env.COOKIE_DOMAIN || env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '').toLowerCase(),
    allowLocalhost: !production,
    maxSessionAgeSeconds: Math.round((Number.isFinite(hours) && hours > 0 ? hours : 12) * 3600),
    requireCeviDbLogin: env.ADMIN_REQUIRE_CEVIDB_LOGIN ? env.ADMIN_REQUIRE_CEVIDB_LOGIN === 'true' : production,
  };
}

const isLocalHost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');

/** Hostname ohne Port, klein geschrieben */
function bareHost(value: string | undefined): string {
  return (value ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

export type AdminRequestProblem = 'HOST' | 'CROSS_ORIGIN';

/**
 * Darf diese Anfrage überhaupt an die Admin-Schnittstelle? Nur auf `admin.`
 * und nur von derselben Seite (kein Aufruf von einer anderen Subdomain, auch nicht von Dev).
 */
export function adminRequestProblem(
  headers: { host?: string; origin?: string; secFetchSite?: string },
  config: Pick<AdminSecurityConfig, 'rootDomain' | 'allowLocalhost'>
): AdminRequestProblem | null {
  const host = bareHost(headers.host);
  const allowedHosts = [`admin.${config.rootDomain}`];
  if (!allowedHosts.includes(host) && !(config.allowLocalhost && isLocalHost(host))) return 'HOST';

  // Browser schicken Sec-Fetch-Site mit: alles ausser «same-origin» (oder «none» = direkt eingetippt) ablehnen
  const site = headers.secFetchSite?.toLowerCase();
  if (site && site !== 'same-origin' && site !== 'none') return 'CROSS_ORIGIN';

  if (headers.origin && headers.origin !== 'null') {
    let originHost: string;
    try {
      originHost = new URL(headers.origin).hostname.toLowerCase();
    } catch {
      return 'CROSS_ORIGIN';
    }
    // Lokal läuft das Portal auf einem anderen Port als das Backend (Next-Proxy), der Hostname reicht
    if (originHost !== host) return 'CROSS_ORIGIN';
  } else if (headers.origin === 'null') {
    return 'CROSS_ORIGIN';
  }
  return null;
}

export type AdminSessionProblem = 'STALE' | 'NOT_CEVIDB';

/** Ist die Anmeldung frisch genug und (in Produktion) über Cevi.DB erfolgt? */
export function adminSessionProblem(
  token: { iat?: number; amr?: string },
  config: Pick<AdminSecurityConfig, 'maxSessionAgeSeconds' | 'requireCeviDbLogin'>,
  nowSeconds = Math.floor(Date.now() / 1000)
): AdminSessionProblem | null {
  if (config.requireCeviDbLogin && token.amr !== 'cevidb' && token.amr !== 'hitobito') return 'NOT_CEVIDB';
  if (token.iat === undefined || nowSeconds - token.iat > config.maxSessionAgeSeconds) return 'STALE';
  return null;
}

/**
 * Cevi.DB-Personen-IDs (kommagetrennt, z. B. "12211,3456"), die als globale Admins berechtigt sind.
 * Bereinigt Anführungszeichen und Whitespace sicher. Befördert nur, entzieht die Rolle nie wieder.
 */
export function bootstrapAdminCeviDbIds(env: NodeJS.ProcessEnv = process.env): Set<number> {
  const ids = (env.GLOBAL_ADMIN_CEVIDB_IDS || '')
    .split(',')
    .map((part) => Number(part.replace(/['"]/g, '').trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return new Set(ids);
}
