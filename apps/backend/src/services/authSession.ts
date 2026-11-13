import { FastifyInstance, FastifyReply } from 'fastify';
import crypto from 'crypto';
import {
  safeReturnTo,
  getRootDomain,
  getOrganization,
  ORGANIZATIONS,
  type UserDto,
  type OrganizationType,
} from '@schichtplan/shared';
import { AUTH_COOKIE_NAME } from '../plugins/jwt.js';
import {
  toUserStufeDto,
} from '../services/homeDepartment.js';
import {
  isCeviNameProfile,
} from '../services/nicknameLogin.js';
import { trackUsage } from '../services/usageStats.js';
import { accessFrom } from '../services/permissions.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { isTwoFactorConfigured } from '../services/twoFactor.js';

/** Passwort-Login: höchstens 30 Fehlversuche pro IP in 10 Minuten, 10 pro E-Mail in 15 Minuten */
export const loginFailuresByIp = createRateLimiter(10 * 60 * 1000, 30);
export const loginFailuresByEmail = createRateLimiter(15 * 60 * 1000, 10);
/** Registrieren / Bestätigungsmail anfordern: höchstens 10 pro IP und Stunde (gegen Mail-Bomben) */
export const mailRequestsByIp = createRateLimiter(60 * 60 * 1000, 10);
/** Hinweis «Du hast schon ein Konto»: höchstens einer pro Adresse und Stunde */
export const accountExistsMailsByEmail = createRateLimiter(60 * 60 * 1000, 1);
/** Falsche Passwörter beim Verknüpfen: nach 5 ist die Verknüpfung weg */
export const MAX_LINK_ATTEMPTS = 5;

export function getCookieDomain(hostname?: string): string | undefined {
  if (process.env.NODE_ENV !== 'production' && (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost'))) {
    return undefined; // Localhost / Dev
  }

  if (hostname) {
    const root = getRootDomain(hostname);
    if (root && root !== 'localhost' && isPlatformRootDomain(root)) {
      return `.${root}`;
    }
  }

  if (process.env.COOKIE_DOMAIN) {
    return process.env.COOKIE_DOMAIN;
  }
  if (process.env.NODE_ENV === 'production') {
    const domain = (process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
    return `.${domain}`;
  }
  return undefined; // Localhost / Dev
}

export function setAuthCookie(reply: FastifyReply, token: string) {
  const domain = getCookieDomain(reply.request?.hostname);
  reply.setCookie(AUTH_COOKIE_NAME, token, {
    path: '/',
    domain,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 Tage
  });
}

export function clearAuthCookie(reply: FastifyReply) {
  const domain = getCookieDomain(reply.request?.hostname);
  reply.clearCookie(AUTH_COOKIE_NAME, {
    path: '/',
    domain,
  });
}

/** Domain aus der Umgebung (COOKIE_DOMAIN/DOMAIN), ohne führenden Punkt */
function envRootDomain(env: NodeJS.ProcessEnv = process.env): string {
  return (env.COOKIE_DOMAIN || env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '').toLowerCase();
}

/**
 * Ist das eine eigene Domain der Plattform (cevi-/pfadi-/jubla-/vereins-schichtplan.ch, deren dev.-Umgebung
 * oder die Domain aus der Umgebung)? Nur solche Domains dürfen aus dem Host-Header übernommen werden:
 * Sie landen in E-Mail-Links (Passwort-Reset mit Token), Cookies und Weiterleitungen.
 */
export function isPlatformRootDomain(root: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const clean = root.toLowerCase();
  if (clean === envRootDomain(env)) return true;
  return Object.values(ORGANIZATIONS).some((org) => clean === org.domain || clean === `dev.${org.domain}`);
}

/**
 * Eigene Domain (auch Staging), auf die nach dem Login weitergeleitet werden darf.
 * Aus dem Host nur, wenn es eine Domain der Plattform ist; lokal «localhost»; sonst die Domain aus der Umgebung.
 */
export function rootDomain(reqHost?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (reqHost) {
    const cleanHost = reqHost.toLowerCase().split(',')[0].trim().replace(/:\d+$/, '');
    const root = getRootDomain(cleanHost);
    if (root === 'localhost') return env.NODE_ENV === 'production' ? envRootDomain(env) : 'localhost';
    if (root && isPlatformRootDomain(root, env)) return root;
  }
  return envRootDomain(env);
}

export function cleanReturnTo(value: unknown, fallback = '/', reqHost?: string): string {
  return safeReturnTo(value, rootDomain(reqHost), {
    allowLocalhost: process.env.NODE_ENV !== 'production',
    fallback,
  });
}

/** Zurück zur Login-Seite mit Fehlercode, statt rohes JSON im Browser anzuzeigen. */
export function loginErrorUrl(
  code: 'cevidb_unavailable' | 'cevidb_denied' | 'cevidb_failed' | 'cevidb_email_taken',
  returnTo: string | null,
  reqHost?: string,
  organization?: OrganizationType | string
) {
  const base = getLoginPortalBaseUrl(process.env, reqHost, organization);
  return `${base}/?error=${code}${returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : ''}`;
}

/**
 * Ziel nach dem Login, wenn keines angegeben ist: die eigene Abteilung, sonst die Landingpage.
 * (Früher ging es auf "/" der Login-Seite zurück, die dann wieder das Login zeigte.)
 */
export function defaultDestination(
  homeDepartmentSlug: string | null,
  reqHost?: string,
  domainOrOrg?: OrganizationType | string
): string {
  if (process.env.NODE_ENV !== 'production' && (!reqHost || rootDomain(reqHost) === 'localhost')) {
    return homeDepartmentSlug ? `http://${homeDepartmentSlug}.localhost:3000/` : 'http://localhost:3001/';
  }
  let root = domainOrOrg ? getOrganization(domainOrOrg).domain : rootDomain(reqHost);
  if (reqHost && (reqHost.startsWith('dev.') || reqHost.includes('.dev.')) && !root.startsWith('dev.')) {
    root = `dev.${root}`;
  }
  return homeDepartmentSlug ? `https://${homeDepartmentSlug}.${root}/` : `https://${root}/`;
}

/**
 * Cevi.DB-Personen-IDs (kommagetrennt, z. B. "12211,3456"), die beim Cevi.DB-Login automatisch
 * globale Admins werden. Befördert nur, entzieht die Rolle nie wieder (das geht über die DB).
 */
export function bootstrapAdminCeviDbIds(): Set<number> {
  const ids = (process.env.GLOBAL_ADMIN_CEVIDB_IDS || '')
    .split(',')
    .map((part) => Number(part.replace(/['"]/g, '').trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return new Set(ids);
}

/**
 * Basis-URL für das zentrale Login-Portal (login.<domain>).
 * Wenn reqHost übergeben wird (z. B. "dev.vereins-schichtplan.ch", "login.dev.vereins-schichtplan.ch", "vereins-schichtplan.ch"):
 * Root-Domain ermitteln: rootDomain(reqHost).
 * In Produktion sowie Staging: https://login.${rootDomain(reqHost)} zurückgeben!
 * WICHTIG: env.LOGIN_PORTAL_URL darf NICHT domain-übergreifend Anfragen von anderen Verbänden kapern.
 * Wenn reqHost übergeben wurde und nicht zu env.LOGIN_PORTAL_URL passt (oder env.LOGIN_PORTAL_URL cevi
 * enthält, aber reqHost verein/pfadi/jubla ist), muss zwingend https://login.${rootDomain(reqHost)} verwendet werden!
 */
export function getLoginPortalBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  reqHost?: string,
  domainOrOrg?: OrganizationType | string
): string {
  let root = domainOrOrg
    ? getOrganization(domainOrOrg).domain
    : reqHost
    ? rootDomain(reqHost, env)
    : null;

  if (reqHost && root && root !== 'localhost') {
    const cleanHost = reqHost.toLowerCase().split(',')[0].trim().replace(/:\d+$/, '');
    if ((cleanHost.startsWith('dev.') || cleanHost.includes('.dev.')) && !root.startsWith('dev.')) {
      root = `dev.${root}`;
    }
    if (env.LOGIN_PORTAL_URL) {
      try {
        const parsed = new URL(env.LOGIN_PORTAL_URL);
        const portalRoot = getRootDomain(parsed.hostname);
        if (portalRoot === root) {
          return env.LOGIN_PORTAL_URL.replace(/\/$/, '');
        }
      } catch {
        // ungültige LOGIN_PORTAL_URL
      }
    }
    return `https://login.${root}`;
  }

  if (root && root !== 'localhost' && env.NODE_ENV === 'production') {
    return `https://login.${root}`;
  }

  if (env.NODE_ENV !== 'production') {
    return (env.LOGIN_PORTAL_URL || 'http://localhost:3002').replace(/\/$/, '');
  }
  const domain = (env.COOKIE_DOMAIN || env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
  return `https://login.${domain}`;
}

/** Redirect-URI für Cevi.DB-OAuth: CEVIDB_REDIRECT_URI, sonst der Callback auf dem Login-Portal */
export function getCeviDbRedirectUri(env: NodeJS.ProcessEnv = process.env, reqHost?: string): string {
  if (reqHost && env.CEVIDB_REDIRECT_URI) {
    try {
      const parsed = new URL(env.CEVIDB_REDIRECT_URI);
      const uriRoot = getRootDomain(parsed.hostname);
      const reqRoot = rootDomain(reqHost);
      if (uriRoot === reqRoot) {
        return env.CEVIDB_REDIRECT_URI;
      }
    } catch {
      // ungültige URI
    }
  } else if (!reqHost && env.CEVIDB_REDIRECT_URI) {
    return env.CEVIDB_REDIRECT_URI;
  }
  return `${getLoginPortalBaseUrl(env, reqHost)}/api/auth/cevidb/callback`;
}

/** Login-Seite (login.<domain>), z. B. für die Abfrage der Abteilung nach dem Cevi.DB-Login */
export function loginPageUrl(path: string, returnTo: string, reqHost?: string) {
  const base = getLoginPortalBaseUrl(process.env, reqHost);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return returnTo ? `${base}${cleanPath}?return_to=${encodeURIComponent(returnTo)}` : `${base}${cleanPath}`;
}

/* ------------------------------------------------------------------ Konto verknüpfen */

/**
 * Cevi.DB-Login, der auf ein Passwort-Konto mit gleicher E-Mail trifft, wartet hier, bis die Person
 * ihr Passwort bestätigt (oder abbricht). Im Speicher reicht: läuft nach 15 Minuten ab, und ein
 * Neustart heisst nur, dass sich die Person nochmals mit Cevi.DB anmeldet.
 */
export const PENDING_LINK_COOKIE = 'cevidb_link';
export const PENDING_LINK_TTL_SECONDS = 15 * 60;
/** Hängt die Cevi.DB, landet der Login lieber auf der Fehlerseite als minutenlang in der Warteschleife */
export const CEVIDB_REQUEST_TIMEOUT_MS = 10_000;
export interface PendingLink {
  profile: any;
  returnTo: string | null;
  tenantSlug: string | null;
  userId: string;
  expires: number;
  failedAttempts: number;
  provider?: OrganizationType;
}
export const pendingLinks = new Map<string, PendingLink>();

export function createPendingLink(link: Omit<PendingLink, 'expires' | 'failedAttempts'>): string {
  const now = Date.now();
  for (const [key, value] of pendingLinks) if (value.expires < now) pendingLinks.delete(key);
  const token = crypto.randomBytes(24).toString('base64url');
  pendingLinks.set(token, { ...link, expires: now + PENDING_LINK_TTL_SECONDS * 1000, failedAttempts: 0 });
  return token;
}

export function readPendingLink(token: string | undefined): PendingLink | null {
  if (!token) return null;
  const link = pendingLinks.get(token);
  if (!link || link.expires < Date.now()) {
    pendingLinks.delete(token ?? '');
    return null;
  }
  return link;
}

/** Profil der angemeldeten Person inkl. Heimabteilung und Stufen (GET /api/auth/me) */
export async function loadUserDto(
  prisma: FastifyInstance['prisma'],
  userId: string,
  tenantId: string | null
): Promise<UserDto | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: tenantId ? { where: { departmentId: tenantId } } : { take: 0 },
      homeDepartment: { select: { id: true, name: true, slug: true, organization: true } },
      stufen: { include: { stufe: { select: { name: true, departmentId: true, sortOrder: true } } } },
      _count: { select: { pushSubscriptions: true, twoFactorRecoveryCodes: { where: { usedAt: null } } } },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    provider: user.provider,
    providerId: user.providerId,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname,
    ceviName: user.nickname,
    phone: user.phone,
    birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : null,
    isGlobalAdmin: user.isGlobalAdmin,
    departmentRole: user.memberships[0] ? (user.memberships[0].role === 'ADMIN' ? 'ADMIN' : 'HELPER') : null,
    departmentPermissions: tenantId ? [...accessFrom(user.memberships[0], user.isGlobalAdmin).permissions] : [],
    ceviDbId: user.providerId && /^\d+$/.test(user.providerId) ? Number(user.providerId) : null,
    providerSyncedAt: user.providerSyncedAt ? user.providerSyncedAt.toISOString() : null,
    ceviDbSyncedAt: user.providerSyncedAt ? user.providerSyncedAt.toISOString() : null,
    hasProviderAuth: Boolean(user.providerId),
    hasCeviDb: Boolean(user.providerId && user.provider === 'CEVI'),
    hasPassword: Boolean(user.passwordHash),
    twoFactor: {
      available: Boolean(user.passwordHash || user.providerId),
      configured: isTwoFactorConfigured(),
      enabled: Boolean(user.totpEnabledAt),
      enabledAt: user.totpEnabledAt ? user.totpEnabledAt.toISOString() : null,
      onProviderLogin: Boolean(user.totpEnabledAt && user.totpOnProviderLogin),
      recoveryCodesLeft: user.totpEnabledAt ? user._count.twoFactorRecoveryCodes : 0,
    },
    emailVerified: user.emailVerified,
    canSelfDelete: Boolean(user.providerId !== null || user.passwordHash !== null),
    homeDepartment: user.homeDepartment,
    homeDepartmentFromCeviDb: user.homeDepartmentSource === 'CEVIDB',
    homeDepartmentFromProvider: user.homeDepartmentSource === 'CEVIDB',
    homeDepartmentSource: user.homeDepartmentSource,
    ortsgruppeId: user.ortsgruppeId,
    ceviDbOrtsgruppeId: user.ortsgruppeId,
    ortsgruppeName: user.ortsgruppeName,
    ceviDbOrtsgruppeName: user.ortsgruppeName,
    departmentLeader: user.departmentLeader,
    ceviDbDepartmentLeader: user.departmentLeader,
    leaderGroupName: user.leaderGroupName,
    ceviDbLeaderGroupName: user.leaderGroupName,
    leaderGroupIds: user.leaderGroupIds,
    ceviDbLeaderGroupIds: user.leaderGroupIds,
    jungscharIds: user.jungscharIds,
    ceviDbJungscharIds: user.jungscharIds,
    stufen: user.stufen
      .sort((a, b) => a.stufe.sortOrder - b.stufe.sortOrder || a.stufe.name.localeCompare(b.stufe.name, 'de'))
      .map(toUserStufeDto),
    needsDepartmentSetup: user.departmentSetupAt === null,
    isCeviNameProfile: isCeviNameProfile(user),
    shiftReminders: user.shiftRemindersEnabled,
    emailReminderMinutes: user.emailReminderMinutes ?? [1440],
    pushReminders: user.pushRemindersEnabled ?? true,
    pushReminderMinutes: user.pushReminderMinutes ?? [60, 1440],
    pushNotifyReplacement: user.pushNotifyReplacement ?? true,
    pushNotifyMessages: user.pushNotifyMessages ?? true,
    emailNotifyCateringTokens: user.emailNotifyCateringTokens ?? true,
    pushNotifyCateringTokens: user.pushNotifyCateringTokens ?? true,
    emailNotifyReplacement: user.emailNotifyReplacement ?? true,
    emailNotifyMessages: user.emailNotifyMessages ?? true,
    pushSubscriptionCount: user._count?.pushSubscriptions ?? 0,
  };
}

/** Trägt die Person als Helfer ein. Eine bestehende Mitgliedschaft (und ihre Rolle) bleibt unverändert. */
export async function ensureHelperMembership(
  prisma: FastifyInstance['prisma'],
  departmentId: string,
  userId: string
) {
  await prisma.departmentMember.upsert({
    where: { departmentId_userId: { departmentId, userId } },
    update: {},
    create: { departmentId, userId, role: 'HELPER' },
  });
}


/** Antwort auf eine Registrierung, gleich ob das Konto neu ist oder die E-Mail schon eines hat */
export function registrationAccepted(email: string) {
  return {
    success: true,
    requiresVerification: true,
    email,
    message: 'Bitte überprüfe dein Postfach: Wir haben dir eine E-Mail geschickt, um dich anzumelden.',
  };
}

/** Statistik-Kennung der Hitobito-Datenbank eines Verbands (Cevi.DB, PBS MiData, Jubla-DB) */
export function hitobitoStatsKey(provider: string | null | undefined): 'CEVIDB' | 'MIDATA' | 'JUBLADB' {
  if (provider === 'PFADI') return 'MIDATA';
  if (provider === 'JUBLA') return 'JUBLADB';
  return 'CEVIDB';
}

/** Anmeldung über Hitobito geklappt (für «Externe Dienste» in der Statistik) */
export function trackHitobitoSuccess(provider: string | null | undefined) {
  trackUsage('EXTERNAL', { dim: `${hitobitoStatsKey(provider)}_OK` });
}

/** Hitobito (Cevi.DB, PBS MiData, Jubla-DB) nicht erreichbar oder Antwort unbrauchbar (für die Statistik) */
export function trackCeviDbFailure(provider?: string | null) {
  trackUsage('EXTERNAL', { dim: `${hitobitoStatsKey(provider)}_ERROR` });
  trackUsage('LOGIN_FAILED', { dim: 'CEVIDB_ERROR' });
}
