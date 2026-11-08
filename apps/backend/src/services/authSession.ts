import { FastifyInstance, FastifyReply } from 'fastify';
import crypto from 'crypto';
import {
  safeReturnTo,
  type UserDto,
} from '@schichtplan/shared';
import { AUTH_COOKIE_NAME } from '../plugins/jwt.js';
import {
  toUserStufeDto,
} from '../services/homeDepartment.js';
import {
  isCeviNameProfile,
} from '../services/ceviNameLogin.js';
import { trackUsage } from '../services/usageStats.js';
import { accessFrom } from '../services/permissions.js';
import { createRateLimiter } from '../services/rateLimit.js';

/** Passwort-Login: höchstens 30 Fehlversuche pro IP in 10 Minuten, 10 pro E-Mail in 15 Minuten */
export const loginFailuresByIp = createRateLimiter(10 * 60 * 1000, 30);
export const loginFailuresByEmail = createRateLimiter(15 * 60 * 1000, 10);
/** Registrieren / Bestätigungsmail anfordern: höchstens 10 pro IP und Stunde (gegen Mail-Bomben) */
export const mailRequestsByIp = createRateLimiter(60 * 60 * 1000, 10);
/** Hinweis «Du hast schon ein Konto»: höchstens einer pro Adresse und Stunde */
export const accountExistsMailsByEmail = createRateLimiter(60 * 60 * 1000, 1);
/** Falsche Passwörter beim Verknüpfen: nach 5 ist die Verknüpfung weg */
export const MAX_LINK_ATTEMPTS = 5;

export function getCookieDomain(): string | undefined {
  if (process.env.COOKIE_DOMAIN) {
    return process.env.COOKIE_DOMAIN;
  }
  if (process.env.NODE_ENV === 'production') {
    const domain = process.env.DOMAIN || 'cevi-schichtplan.ch';
    return `.${domain}`;
  }
  return undefined; // Localhost / Dev
}

export function setAuthCookie(reply: FastifyReply, token: string) {
  const domain = getCookieDomain();
  reply.setCookie(AUTH_COOKIE_NAME, token, {
    path: '/',
    domain,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 Tage
  });
}

// Eigene Domain (auch Staging), auf die nach dem Login weitergeleitet werden darf
export function rootDomain(): string {
  return (process.env.COOKIE_DOMAIN || process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
}

export function cleanReturnTo(value: unknown, fallback = '/'): string {
  return safeReturnTo(value, rootDomain(), {
    allowLocalhost: process.env.NODE_ENV !== 'production',
    fallback,
  });
}

/** Zurück zur Login-Seite mit Fehlercode, statt rohes JSON im Browser anzuzeigen. */
export function loginErrorUrl(
  code: 'cevidb_unavailable' | 'cevidb_denied' | 'cevidb_failed' | 'cevidb_email_taken',
  returnTo: string | null
) {
  const base = process.env.NODE_ENV === 'production' ? `https://login.${rootDomain()}` : '';
  return `${base}/?error=${code}${returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : ''}`;
}

/**
 * Ziel nach dem Login, wenn keines angegeben ist: die eigene Abteilung, sonst die Landingpage.
 * (Früher ging es auf "/" der Login-Seite zurück, die dann wieder das Login zeigte.)
 */
export function defaultDestination(homeDepartmentSlug: string | null): string {
  if (process.env.NODE_ENV !== 'production') {
    return homeDepartmentSlug ? `http://${homeDepartmentSlug}.localhost:3000/` : 'http://localhost:3001/';
  }
  return homeDepartmentSlug ? `https://${homeDepartmentSlug}.${rootDomain()}/` : `https://${rootDomain()}/`;
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
 * Basis-URL für das zentrale Login-Portal (login.<domain>). Nur aus der Konfiguration, nie aus dem
 * Host-Header: Die Adresse landet in E-Mails (Passwort-Reset, Bestätigung) und Weiterleitungen.
 * Lokal (ausserhalb von Produktion) LOGIN_PORTAL_URL oder der Next-Dev-Server auf Port 3002.
 */
export function getLoginPortalBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV !== 'production') return (env.LOGIN_PORTAL_URL || 'http://localhost:3002').replace(/\/$/, '');
  const domain = (env.COOKIE_DOMAIN || env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
  return `https://login.${domain}`;
}

/** Redirect-URI für Cevi.DB-OAuth: CEVIDB_REDIRECT_URI, sonst der Callback auf dem Login-Portal */
export function getCeviDbRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  return env.CEVIDB_REDIRECT_URI || `${getLoginPortalBaseUrl(env)}/api/auth/cevidb/callback`;
}

/** Login-Seite (login.<domain>), z. B. für die Abfrage der Abteilung nach dem Cevi.DB-Login */
export function loginPageUrl(path: string, returnTo: string) {
  const base = process.env.NODE_ENV === 'production' ? `https://login.${rootDomain()}` : '';
  return returnTo ? `${base}${path}?return_to=${encodeURIComponent(returnTo)}` : `${base}${path}`;
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
      homeDepartment: { select: { id: true, name: true, slug: true } },
      stufen: { include: { stufe: { select: { name: true, departmentId: true, sortOrder: true } } } },
      _count: { select: { pushSubscriptions: true } },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    ceviName: user.ceviName,
    phone: user.phone,
    birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : null,
    isGlobalAdmin: user.isGlobalAdmin,
    departmentRole: user.memberships[0] ? (user.memberships[0].role === 'ADMIN' ? 'ADMIN' : 'HELPER') : null,
    departmentPermissions: tenantId ? [...accessFrom(user.memberships[0], user.isGlobalAdmin).permissions] : [],
    ceviDbId: user.ceviDbId,
    ceviDbSyncedAt: user.ceviDbSyncedAt ? user.ceviDbSyncedAt.toISOString() : null,
    hasCeviDb: Boolean(user.ceviDbId),
    hasPassword: Boolean(user.passwordHash),
    emailVerified: user.emailVerified,
    canSelfDelete: Boolean(user.ceviDbId !== null || user.passwordHash !== null),
    homeDepartment: user.homeDepartment,
    homeDepartmentFromCeviDb: user.homeDepartmentSource === 'CEVIDB',
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

export function clearAuthCookie(reply: FastifyReply) {
  const domain = getCookieDomain();
  reply.clearCookie(AUTH_COOKIE_NAME, {
    path: '/',
    domain,
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

/** Cevi.DB nicht erreichbar oder Antwort unbrauchbar (für die Statistik) */
export function trackCeviDbFailure() {
  trackUsage('EXTERNAL', { dim: 'CEVIDB_ERROR' });
  trackUsage('LOGIN_FAILED', { dim: 'CEVIDB_ERROR' });
}
