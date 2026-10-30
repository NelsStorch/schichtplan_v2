import { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  LoginSchema,
  RegisterHelperSchema,
  VerifyEmailSchema,
  ResendVerificationSchema,
  CeviNameQuickLoginSchema,
  CeviNameRegisterSchema,
  PLACEHOLDER_LAST_NAME,
  SetHomeDepartmentSchema,
  UpdateProfileSchema,
  safeReturnTo,
  type UserDto,
} from '@schichtplan/shared';
import { AUTH_COOKIE_NAME } from '../plugins/jwt.js';
import { ceviDbRoleGroupIds, deriveCeviDbFields } from '../services/cevidb.js';
import { refreshCeviDbGroups } from '../services/cevidbGroups.js';
import { cevidbConfig } from '../config/cevidb.js';
import {
  autoCreateCeviDbDepartmentStufen,
  storeCeviDbFields,
  resolveCeviDbPlacement,
  syncCeviDbHomeDepartment,
  syncCeviDbStufen,
  toUserStufeDto,
} from '../services/homeDepartment.js';
import { applyProfileUpdate } from '../services/profileUpdate.js';
import { sendAccountExistsEmail, sendVerificationEmail } from '../services/email.js';
import {
  RATE_LIMIT_ERROR,
  findCeviNameMatches,
  isCeviNameProfile,
  pickCeviNameMatch,
  ceviNameAttemptsBlocked,
  recordCeviNameMiss,
  tooManyRequests,
} from '../services/ceviNameLogin.js';
import { mergeCeviNameProfilesInto } from '../services/mergeProfiles.js';
import { trackUsage } from '../services/usageStats.js';
import { withoutCeviDbAddress } from '../services/profile.js';
import { syncCeviDbLeadership } from '../services/departmentLeaders.js';
import { accessFrom } from '../services/permissions.js';
import { createRateLimiter } from '../services/rateLimit.js';

/** Passwort-Login: höchstens 30 Fehlversuche pro IP in 10 Minuten, 10 pro E-Mail in 15 Minuten */
const loginFailuresByIp = createRateLimiter(10 * 60 * 1000, 30);
const loginFailuresByEmail = createRateLimiter(15 * 60 * 1000, 10);
/** Registrieren / Bestätigungsmail anfordern: höchstens 10 pro IP und Stunde (gegen Mail-Bomben) */
const mailRequestsByIp = createRateLimiter(60 * 60 * 1000, 10);
/** Hinweis «Du hast schon ein Konto»: höchstens einer pro Adresse und Stunde */
const accountExistsMailsByEmail = createRateLimiter(60 * 60 * 1000, 1);
/** Falsche Passwörter beim Verknüpfen: nach 5 ist die Verknüpfung weg */
const MAX_LINK_ATTEMPTS = 5;

function getCookieDomain(): string | undefined {
  if (process.env.COOKIE_DOMAIN) {
    return process.env.COOKIE_DOMAIN;
  }
  if (process.env.NODE_ENV === 'production') {
    const domain = process.env.DOMAIN || 'cevi-schichtplan.ch';
    return `.${domain}`;
  }
  return undefined; // Localhost / Dev
}

function setAuthCookie(reply: FastifyReply, token: string) {
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
function rootDomain(): string {
  return (process.env.COOKIE_DOMAIN || process.env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
}

function cleanReturnTo(value: unknown, fallback = '/'): string {
  return safeReturnTo(value, rootDomain(), {
    allowLocalhost: process.env.NODE_ENV !== 'production',
    fallback,
  });
}

/** Zurück zur Login-Seite mit Fehlercode, statt rohes JSON im Browser anzuzeigen. */
function loginErrorUrl(
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
function defaultDestination(homeDepartmentSlug: string | null): string {
  if (process.env.NODE_ENV !== 'production') {
    return homeDepartmentSlug ? `http://${homeDepartmentSlug}.localhost:3000/` : 'http://localhost:3001/';
  }
  return homeDepartmentSlug ? `https://${homeDepartmentSlug}.${rootDomain()}/` : `https://${rootDomain()}/`;
}

/**
 * Cevi.DB-Personen-IDs (kommagetrennt, z. B. "12211,3456"), die beim Cevi.DB-Login automatisch
 * globale Admins werden. Befördert nur, entzieht die Rolle nie wieder (das geht über die DB).
 */
function bootstrapAdminCeviDbIds(): Set<number> {
  const ids = (process.env.GLOBAL_ADMIN_CEVIDB_IDS || '')
    .split(',')
    .map((part) => Number(part.replace(/['"]/g, '').trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return new Set(ids);
}

/** Basis-URL für das zentrale Login-Portal (login.<domain>) */
export function getLoginPortalBaseUrl(requestHost?: string): string {
  if (process.env.NODE_ENV !== 'production' || (requestHost && requestHost.includes('localhost'))) {
    return 'http://localhost:3002';
  }
  const domain = (
    process.env.COOKIE_DOMAIN ||
    process.env.DOMAIN_DEV ||
    process.env.DOMAIN ||
    'cevi-schichtplan.ch'
  ).replace(/^\./, '');
  return `https://login.${domain}`;
}

/** Login-Seite (login.<domain>), z. B. für die Abfrage der Abteilung nach dem Cevi.DB-Login */
function loginPageUrl(path: string, returnTo: string) {
  const base = process.env.NODE_ENV === 'production' ? `https://login.${rootDomain()}` : '';
  return returnTo ? `${base}${path}?return_to=${encodeURIComponent(returnTo)}` : `${base}${path}`;
}

/* ------------------------------------------------------------------ Konto verknüpfen */

/**
 * Cevi.DB-Login, der auf ein Passwort-Konto mit gleicher E-Mail trifft, wartet hier, bis die Person
 * ihr Passwort bestätigt (oder abbricht). Im Speicher reicht: läuft nach 15 Minuten ab, und ein
 * Neustart heisst nur, dass sich die Person nochmals mit Cevi.DB anmeldet.
 */
const PENDING_LINK_COOKIE = 'cevidb_link';
const PENDING_LINK_TTL_SECONDS = 15 * 60;
interface PendingLink {
  profile: any;
  returnTo: string | null;
  tenantSlug: string | null;
  userId: string;
  expires: number;
  failedAttempts: number;
}
const pendingLinks = new Map<string, PendingLink>();

function createPendingLink(link: Omit<PendingLink, 'expires' | 'failedAttempts'>): string {
  const now = Date.now();
  for (const [key, value] of pendingLinks) if (value.expires < now) pendingLinks.delete(key);
  const token = crypto.randomBytes(24).toString('base64url');
  pendingLinks.set(token, { ...link, expires: now + PENDING_LINK_TTL_SECONDS * 1000, failedAttempts: 0 });
  return token;
}

function readPendingLink(token: string | undefined): PendingLink | null {
  if (!token) return null;
  const link = pendingLinks.get(token);
  if (!link || link.expires < Date.now()) {
    pendingLinks.delete(token ?? '');
    return null;
  }
  return link;
}

/** Profil der angemeldeten Person inkl. Heimabteilung und Stufen (GET /api/auth/me) */
async function loadUserDto(
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
    pushSubscriptionCount: user._count?.pushSubscriptions ?? 0,
  };
}

/** Trägt die Person als Helfer ein. Eine bestehende Mitgliedschaft (und ihre Rolle) bleibt unverändert. */
async function ensureHelperMembership(
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

function clearAuthCookie(reply: FastifyReply) {
  const domain = getCookieDomain();
  reply.clearCookie(AUTH_COOKIE_NAME, {
    path: '/',
    domain,
  });
}

/** Antwort auf eine Registrierung, gleich ob das Konto neu ist oder die E-Mail schon eines hat */
function registrationAccepted(email: string) {
  return {
    success: true,
    requiresVerification: true,
    email,
    message: 'Bitte überprüfe dein Postfach: Wir haben dir eine E-Mail geschickt, um dich anzumelden.',
  };
}

/** Cevi.DB nicht erreichbar oder Antwort unbrauchbar (für die Statistik) */
function trackCeviDbFailure() {
  trackUsage('EXTERNAL', { dim: 'CEVIDB_ERROR' });
  trackUsage('LOGIN_FAILED', { dim: 'CEVIDB_ERROR' });
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const CEVIDB_BASE_URL = process.env.CEVIDB_BASE_URL || 'https://db.cevi.ch';
  const CEVIDB_CLIENT_ID = process.env.CEVIDB_CLIENT_ID || '';
  const CEVIDB_CLIENT_SECRET = process.env.CEVIDB_CLIENT_SECRET || '';

  // 1. Cevi.DB OAuth Login Redirect
  fastify.get<{ Querystring: { returnTo?: string; tenantSlug?: string } }>(
    '/api/auth/cevidb/login',
    async (request, reply) => {
      const host = request.headers.host || 'cevi-schichtplan.ch';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const redirectUri =
        process.env.CEVIDB_REDIRECT_URI || `${protocol}://${host}/api/auth/cevidb/callback`;

      // Ohne Ziel bestimmt der Callback die Weiterleitung (eigene Abteilung oder Landingpage)
      const returnTo = request.query.returnTo
        ? cleanReturnTo(request.query.returnTo)
        : request.tenant
          ? `${protocol}://${request.tenant.slug}.${host}`
          : null;

      if (!CEVIDB_CLIENT_ID) {
        fastify.log.error('Cevi.DB OAuth ist nicht konfiguriert (CEVIDB_CLIENT_ID fehlt in der Umgebung)');
        return reply.redirect(loginErrorUrl('cevidb_unavailable', returnTo));
      }

      const stateObj = {
        token: crypto.randomBytes(16).toString('hex'),
        returnTo,
        tenantSlug: request.query.tenantSlug || request.tenant?.slug || null,
      };

      const stateEncoded = Buffer.from(JSON.stringify(stateObj)).toString('base64url');

      reply.setCookie('cevidb_oauth_state', stateEncoded, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10, // 10 Minuten
      });

      const authUrl = new URL(`${CEVIDB_BASE_URL}/oauth/authorize`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', CEVIDB_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', cevidbConfig().oauthScopes);
      authUrl.searchParams.set('state', stateEncoded);

      return reply.redirect(authUrl.toString());
    }
  );

  // 2. Cevi.DB OAuth Callback
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/cevidb/callback',
    async (request, reply) => {
      const { code, state, error } = request.query;

      // null = kein Ziel angegeben (direkt auf der Login-Seite angemeldet)
      let returnTo: string | null = null;
      let tenantSlug: string | null = null;

      try {
        if (state) {
          const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
          returnTo = parsedState.returnTo ? cleanReturnTo(parsedState.returnTo) : null;
          tenantSlug = parsedState.tenantSlug || null;
        }
      } catch (err) {
        // Fallback default
      }

      // Abbruch durch die Person auf Cevi.DB (z. B. Zugriff verweigert)
      if (error) {
        return reply.redirect(loginErrorUrl('cevidb_denied', returnTo));
      }

      // state muss zum Cookie aus /cevidb/login passen, sonst könnte ein fremder Code untergeschoben werden
      if (!code || !state || state !== request.cookies.cevidb_oauth_state) {
        fastify.log.warn('Cevi.DB Callback ohne gültigen Code oder state');
        return reply.redirect(loginErrorUrl('cevidb_failed', returnTo));
      }

      const host = request.headers.host || 'cevi-schichtplan.ch';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const redirectUri =
        process.env.CEVIDB_REDIRECT_URI || `${protocol}://${host}/api/auth/cevidb/callback`;

      let profile: any;
      try {
        // Code gegen Token tauschen
        const tokenRes = await fetch(`${CEVIDB_BASE_URL}/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CEVIDB_CLIENT_ID,
            client_secret: CEVIDB_CLIENT_SECRET,
            redirect_uri: redirectUri,
            code,
          }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          fastify.log.error(`Cevi.DB Token-Abruf fehlgeschlagen: ${errText}`);
          trackCeviDbFailure();
          return reply.redirect(loginErrorUrl('cevidb_failed', returnTo));
        }

        const tokenData = (await tokenRes.json()) as {
          access_token: string;
          token_type?: string;
          expires_in?: number;
          refresh_token?: string;
          scope?: string;
        };
        const accessToken = tokenData.access_token;

        // Profil abrufen
        const profileRes = await fetch(`${CEVIDB_BASE_URL}/oauth/profile`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Scope': 'with_roles',
            Accept: 'application/json',
          },
        });

        if (!profileRes.ok) {
          fastify.log.error('Cevi.DB Profilabruf fehlgeschlagen');
          trackCeviDbFailure();
          return reply.redirect(loginErrorUrl('cevidb_failed', returnTo));
        }

        profile = await profileRes.json();

        // Falls OIDC aktiv ist, versuche zusätzlich Userinfo für allfällige extra Felder abzurufen
        try {
          const userinfoRes = await fetch(`${CEVIDB_BASE_URL}/oauth/userinfo`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          });
          if (userinfoRes.ok) {
            const userinfo = await userinfoRes.json();
            profile._userInfo = userinfo;
          }
        } catch {
          // optional
        }

        profile._meta = {
          fetchedAt: new Date().toISOString(),
          grantedScopes: tokenData.scope || cevidbConfig().oauthScopes,
          tokenType: tokenData.token_type || 'Bearer',
          expiresIn: tokenData.expires_in,
        };

        // Gruppenstruktur zu den Rollen: hier, weil das Token nur jetzt da ist (wird nicht gespeichert)
        await refreshCeviDbGroups(fastify.prisma, fastify.log, {
          baseUrl: CEVIDB_BASE_URL,
          accessToken,
          grantedScopes: profile._meta.grantedScopes,
          groupIds: ceviDbRoleGroupIds(profile),
        });
      } catch (err) {
        fastify.log.error(err, 'Cevi.DB nicht erreichbar');
        trackCeviDbFailure();
        return reply.redirect(loginErrorUrl('cevidb_failed', returnTo));
      }

      trackUsage('EXTERNAL', { dim: 'CEVIDB_OK' });
      reply.clearCookie('cevidb_oauth_state', { path: '/' });
      return reply.redirect(await finishCeviDbLogin(reply, profile, returnTo, tenantSlug));
    }
  );

  /**
   * Neue E-Mail aus Cevi.DB für ein bestehendes Konto übernehmen, wenn sie sich geändert hat und keinem
   * anderen Konto gehört. Unbestätigt bei einem anderen Konto: dort lösen (wie beim ersten Login).
   */
  async function ceviDbEmailUpdate(
    user: { id: string; email: string | null },
    profileEmail: unknown
  ): Promise<{ email?: string }> {
    if (typeof profileEmail !== 'string' || !profileEmail.trim()) return {};
    const email = profileEmail.trim().toLowerCase();
    if (email === user.email) return {};
    const other = await fastify.prisma.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
    if (other && other.id !== user.id) {
      if (other.emailVerified) {
        fastify.log.warn({ userId: user.id, otherId: other.id }, 'Cevi.DB-E-Mail gehört schon einem anderen Konto');
        return {};
      }
      await fastify.prisma.$transaction([
        fastify.prisma.emailVerificationToken.deleteMany({ where: { userId: other.id } }),
        fastify.prisma.user.update({ where: { id: other.id }, data: { email: null } }),
      ]);
    }
    return { email };
  }

  /**
   * Zweiter Teil des Cevi.DB-Logins (auch nach «Konto verknüpfen»): Konto finden oder anlegen,
   * Angaben übernehmen, Cookie setzen. Gibt das Weiterleitungsziel zurück.
   * `linkConfirmedUserId`: Passwort-Konto mit gleicher E-Mail, dessen Passwort eben bestätigt wurde.
   */
  async function finishCeviDbLogin(
    reply: FastifyReply,
    profile: any,
    returnTo: string | null,
    tenantSlug: string | null,
    linkConfirmedUserId?: string
  ): Promise<string> {
    const ceviDbId = profile.id;
    const email = (profile.email || `cevidb_${ceviDbId}@cevi-schichtplan.ch`).toLowerCase();
    const firstName = profile.first_name || profile.given_name || 'Cevianer*in';
    const lastName = profile.last_name || profile.family_name || '';
    const ceviName = profile.nickname || null;

    let birthDate: Date | null = null;
    if (profile.birthday) {
      const parsedBirthday = new Date(profile.birthday);
      if (!isNaN(parsedBirthday.getTime())) {
        birthDate = parsedBirthday;
      }
    }

    const now = new Date();

    // Benutzer finden: zuerst über die Cevi.DB-ID, sonst über die E-Mail (E-Mails sind eindeutig)
    let user = await fastify.prisma.user.findUnique({ where: { ceviDbId } });
    if (!user) {
      let byEmail = await fastify.prisma.user.findUnique({ where: { email } });
      if (byEmail && !byEmail.emailVerified && byEmail.id !== linkConfirmedUserId) {
        // Unbestätigte Adresse (Registrierung ohne Bestätigung oder selbst ins Profil geschrieben):
        // Sie gehört nicht nachweislich diesem Konto. Cevi.DB bestätigt sie, das andere Konto verliert sie.
        // Sonst könnte jemand mit fremder E-Mail ein Konto vorbereiten und es so übernehmen oder sperren.
        await fastify.prisma.$transaction([
          fastify.prisma.emailVerificationToken.deleteMany({ where: { userId: byEmail.id } }),
          fastify.prisma.user.update({ where: { id: byEmail.id }, data: { email: null } }),
        ]);
        fastify.log.warn({ userId: byEmail.id, ceviDbId }, 'Cevi.DB-Login: unbestätigte E-Mail von anderem Konto gelöst');
        byEmail = null;
      }
      if (byEmail && byEmail.ceviDbId !== null) {
        // E-Mail gehört schon zu einer anderen Cevi.DB-Person: nicht überschreiben
        fastify.log.warn({ userId: byEmail.id, ceviDbId }, 'Cevi.DB-Login: E-Mail gehört zu anderem Cevi.DB-Konto');
        return loginErrorUrl('cevidb_email_taken', returnTo);
      }
      if (byEmail && byEmail.passwordHash && byEmail.id !== linkConfirmedUserId) {
        // Passwort-Konto mit gleicher E-Mail: erst nach Passwort verknüpfen (login.<domain>/konto-verknuepfen)
        const token = createPendingLink({ profile, returnTo, tenantSlug, userId: byEmail.id });
        reply.setCookie(PENDING_LINK_COOKIE, token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: PENDING_LINK_TTL_SECONDS,
        });
        return loginPageUrl('/konto-verknuepfen', returnTo ?? '');
      }
      user = byEmail;
    }

    // Cevi.DB ist die Quelle: Was dort steht, ersetzt die lokalen Werte bei jedem Login. Die Adresse
    // übernehmen wir bewusst nicht (Datensparsamkeit; wer sie braucht, fragt beim Anlass danach). Die
    // Handynummer liefert Cevi.DB nicht (Scope `with_roles` hat keine Telefonnummern).
    if (!user) {
      trackUsage('REGISTER', { dim: 'cevidb' });
      user = await fastify.prisma.user.create({
        data: {
          email,
          ceviDbId,
          firstName,
          lastName,
          ceviName,
          birthDate,
          emailVerified: true,
          emailVerifiedAt: now,
          ceviDbData: withoutCeviDbAddress(profile),
          ceviDbSyncedAt: now,
        },
      });
    } else {
      user = await fastify.prisma.user.update({
        where: { id: user.id },
        data: {
          ceviDbId,
          ceviName: ceviName || user.ceviName,
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
          birthDate: birthDate || user.birthDate,
          ...(await ceviDbEmailUpdate(user, profile.email)),
          emailVerified: true,
          emailVerifiedAt: user.emailVerifiedAt || now,
          ceviDbData: withoutCeviDbAddress(profile),
          ceviDbSyncedAt: now,
        },
      });
    }

    if (!user.isGlobalAdmin && typeof ceviDbId === 'number' && bootstrapAdminCeviDbIds().has(ceviDbId)) {
      user = await fastify.prisma.user.update({
        where: { id: user.id },
        data: { isGlobalAdmin: true },
      });
      fastify.log.info({ userId: user.id, ceviDbId }, 'Cevi.DB-Person zum globalen Admin befördert');
    }

    // Was der Schichtplan aus Cevi.DB braucht, in eigene Spalten schreiben (ceviDbData wird nie gelesen).
    // Die eigene Abteilung und die Stufen kommen aus den Rollen und der Cevi.DB-Gruppenstruktur.
    const derived = deriveCeviDbFields(profile);
    const placement = await resolveCeviDbPlacement(fastify.prisma, derived, user.homeDepartmentId);
    await storeCeviDbFields(fastify.prisma, user.id, derived, placement);
    const homeDepartment = await syncCeviDbHomeDepartment(fastify.prisma, user, placement);
    // Abteilungsleitung vergeben bzw. entziehen (nie die letzte einer Abteilung), in weiteren Abteilungen mit Rollen eintragen
    await syncCeviDbLeadership(
      fastify.prisma,
      fastify.log,
      user.id,
      homeDepartment?.id ?? null,
      placement.leaderDepartmentIds,
      placement.departmentIds
    );

    // Kommt die Person von einer Abteilungs-Subdomain, dort ohne Rechte eintragen (Leitung nur in der Heimabteilung)
    let tenantDepartmentId: string | null = null;
    if (tenantSlug) {
      const department = await fastify.prisma.department.findUnique({
        where: { slug: tenantSlug },
        select: { id: true },
      });
      if (department) {
        tenantDepartmentId = department.id;
        await ensureHelperMembership(fastify.prisma, department.id, user.id);
      }
    }

    // Frühere Cevi-Name-Profile derselben Person (Name, Geburtsdatum, Abteilung) ins Konto übernehmen.
    // Ein Fehler hier darf den Login nicht verhindern.
    try {
      const merged = await mergeCeviNameProfilesInto(
        fastify.prisma,
        user,
        [homeDepartment?.id, tenantDepartmentId].filter((id): id is string => Boolean(id))
      );
      if (merged > 0) {
        fastify.log.info({ userId: user.id, merged }, 'Cevi-Name-Profile ins Cevi.DB-Konto übernommen');
        trackUsage('PROFILE_MERGE', { n: merged, departmentId: homeDepartment?.id ?? tenantDepartmentId });
        user = await fastify.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      }
    } catch (err) {
      fastify.log.error({ err, userId: user.id }, 'Cevi-Name-Profile konnten nicht übernommen werden');
    }

    const token = fastify.signAuthToken({
      id: user.id,
      email: user.email || `${user.id}@cevi-schichtplan.ch`,
      isGlobalAdmin: user.isGlobalAdmin,
      amr: 'cevidb',
    });

    setAuthCookie(reply, token);
    trackUsage('LOGIN', { dim: 'cevidb', departmentId: homeDepartment?.id ?? tenantDepartmentId });

    // Ohne Ziel: Abteilungsseite, sonst Landingpage (nicht zurück auf die Login-Seite)
    const target = returnTo ?? defaultDestination(homeDepartment?.slug ?? null);

    // Abteilungsleitung, deren Ortsgruppe noch keinen Schichtplan hat: Abteilung anlegen anbieten
    if (!homeDepartment && derived.isDepartmentLeader && derived.ortsgruppeId !== null) {
      return loginPageUrl('/abteilung-erstellen', target);
    }
    // Ohne passende Abteilung im Schichtplan: Abteilung und Stufe einmal nachfragen (auch nach einem Abteilungswechsel)
    if (!homeDepartment) {
      const setup = await fastify.prisma.user.findUnique({ where: { id: user.id }, select: { departmentSetupAt: true } });
      if (!setup?.departmentSetupAt) return loginPageUrl('/abteilung', target);
    }
    return target;
  }

  // 2b. Cevi.DB mit bestehendem Passwort-Konto (gleiche E-Mail) verknüpfen: nur mit dessen Passwort.
  //     Ohne Passwort kein Login, denn zwei Konten mit derselben E-Mail gibt es nicht.
  fastify.get('/api/auth/cevidb/link', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const link = readPendingLink(request.cookies[PENDING_LINK_COOKIE]);
    if (!link) return reply.status(404).send({ error: 'Keine offene Verknüpfung. Melde dich nochmals mit Cevi.DB an.' });
    const user = await fastify.prisma.user.findUnique({
      where: { id: link.userId },
      select: { email: true, ceviName: true, firstName: true },
    });
    if (!user) return reply.status(404).send({ error: 'Das Konto gibt es nicht mehr.' });
    return { email: user.email, name: user.ceviName || user.firstName, returnTo: link.returnTo };
  });

  fastify.post('/api/auth/cevidb/link', async (request, reply) => {
    if (tooManyRequests(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR });
    }
    const token = request.cookies[PENDING_LINK_COOKIE];
    const link = readPendingLink(token);
    if (!link) return reply.status(404).send({ error: 'Die Verknüpfung ist abgelaufen. Melde dich nochmals mit Cevi.DB an.' });

    const password = typeof (request.body as any)?.password === 'string' ? (request.body as any).password : '';
    const user = await fastify.prisma.user.findUnique({ where: { id: link.userId } });
    if (!user || !user.passwordHash || !password || !(await bcrypt.compare(password, user.passwordHash))) {
      link.failedAttempts++;
      if (link.failedAttempts >= MAX_LINK_ATTEMPTS) {
        pendingLinks.delete(token!);
        reply.clearCookie(PENDING_LINK_COOKIE, { path: '/' });
        return reply
          .status(429)
          .send({ error: 'Zu viele falsche Passwörter. Melde dich nochmals mit Cevi.DB an.', code: 'RATE_LIMITED' });
      }
      return reply.status(401).send({ error: 'Das Passwort stimmt nicht.' });
    }

    pendingLinks.delete(token!);
    reply.clearCookie(PENDING_LINK_COOKIE, { path: '/' });
    const redirectUrl = await finishCeviDbLogin(reply, link.profile, link.returnTo, link.tenantSlug, user.id);
    fastify.log.info({ userId: user.id }, 'Passwort-Konto mit Cevi.DB verknüpft');
    trackUsage('ACCOUNT_LINK');
    return { redirectUrl };
  });

  fastify.delete('/api/auth/cevidb/link', async (request, reply) => {
    const token = request.cookies[PENDING_LINK_COOKIE];
    if (token) pendingLinks.delete(token);
    reply.clearCookie(PENDING_LINK_COOKIE, { path: '/' });
    return { ok: true };
  });

  // 3. Cevi-Name-Login (ohne Passwort, nur an einer Abteilung)
  //    Cevi-Name + Geburtsdatum + Abteilung bestimmen das Profil. Nur reine Cevi-Name-Profile ohne
  //    Rechte lassen sich so anmelden; Cevi.DB- und Passwort-Konten verlangen ihren eigenen Login.
  //    Findet sich niemand, bietet das Login-Portal die Registrierung an (ceviname-register).
  fastify.post('/api/auth/ceviname-login', async (request, reply) => {
    if (tooManyRequests(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const parse = CeviNameQuickLoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }
    const { departmentSlug, ceviName, birthDate, returnTo } = parse.data;

    const department = await fastify.prisma.department.findUnique({
      where: { slug: departmentSlug.toLowerCase() },
      select: { id: true, name: true },
    });
    if (!department) {
      return reply.status(404).send({ error: 'Diese Abteilung gibt es nicht.' });
    }

    // Sperre vor der Suche: Auch ein richtiges Geburtsdatum kommt während der Sperre nicht durch
    if (ceviNameAttemptsBlocked(department.id, ceviName)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const matches = await findCeviNameMatches(fastify.prisma, department.id, ceviName, birthDate);
    const result = pickCeviNameMatch(matches);
    if (result.kind !== 'LOGIN') recordCeviNameMiss(department.id, ceviName);
    if (result.kind === 'USE_CEVIDB') {
      trackUsage('LOGIN_FAILED', { dim: 'CEVINAME_USE_CEVIDB', departmentId: department.id });
      return reply.status(403).send({
        code: 'USE_CEVIDB',
        error: 'Zu diesem Cevi-Namen gibt es ein Konto mit Cevi.DB. Melde dich bitte mit Cevi.DB an.',
      });
    }
    if (result.kind === 'USE_PASSWORD') {
      trackUsage('LOGIN_FAILED', { dim: 'CEVINAME_USE_PASSWORD', departmentId: department.id });
      return reply.status(403).send({
        code: 'USE_PASSWORD',
        error: 'Zu diesem Cevi-Namen gibt es ein geschütztes Konto. Melde dich bitte mit E-Mail und Passwort an.',
      });
    }
    if (result.kind === 'NONE') {
      trackUsage('LOGIN_FAILED', { dim: 'CEVINAME_NOT_FOUND', departmentId: department.id });
      return reply.status(404).send({
        code: 'NOT_FOUND',
        error: `Bei ${department.name} gibt es noch kein Profil mit diesem Cevi-Namen und Geburtsdatum.`,
      });
    }

    await ensureHelperMembership(fastify.prisma, department.id, result.userId);
    const user = await fastify.prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    trackUsage('LOGIN', { dim: 'ceviname', departmentId: department.id });
    return signInCeviNameProfile(reply, user, returnTo);
  });

  // 3b. Neues Cevi-Name-Profil an einer Abteilung (nach einem Login ohne Treffer)
  fastify.post('/api/auth/ceviname-register', async (request, reply) => {
    if (tooManyRequests(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const parse = CeviNameRegisterSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }
    const { departmentSlug, ceviName, birthDate, firstName, lastName, phone, stufen, returnTo } = parse.data;

    const department = await fastify.prisma.department.findUnique({
      where: { slug: departmentSlug.toLowerCase() },
      select: { id: true, name: true },
    });
    if (!department) {
      return reply.status(404).send({ error: 'Diese Abteilung gibt es nicht.' });
    }

    // Gleicher Cevi-Name und gleiches Geburtsdatum in derselben Abteilung gibt es nur einmal.
    // Die Antwort verrät, ob Name und Geburtsdatum passen: gleiche Bremse wie beim Login.
    if (ceviNameAttemptsBlocked(department.id, ceviName)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const matches = await findCeviNameMatches(fastify.prisma, department.id, ceviName, birthDate);
    if (matches.length > 0) {
      recordCeviNameMiss(department.id, ceviName);
      const result = pickCeviNameMatch(matches);
      return reply.status(409).send({
        code: result.kind === 'USE_CEVIDB' ? 'USE_CEVIDB' : result.kind === 'USE_PASSWORD' ? 'USE_PASSWORD' : 'EXISTS',
        error:
          result.kind === 'LOGIN'
            ? 'Dieses Profil gibt es schon. Melde dich mit Cevi-Name und Geburtsdatum an.'
            : 'Zu diesem Cevi-Namen und Geburtsdatum gibt es schon ein Konto. Melde dich damit an.',
      });
    }

    const stufeIds = [...new Set(stufen.map((s) => s.stufeId))];
    if (stufeIds.length) {
      const found = await fastify.prisma.departmentStufe.count({
        where: { id: { in: stufeIds }, departmentId: department.id },
      });
      if (found !== stufeIds.length) {
        return reply.status(400).send({ error: 'Eine Stufe gehört nicht zu dieser Abteilung' });
      }
    }

    const cleanCeviName = ceviName.trim();
    const user = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          ceviName: cleanCeviName,
          firstName: firstName?.trim() || cleanCeviName,
          lastName: lastName?.trim() || null,
          birthDate: new Date(`${birthDate}T00:00:00Z`),
          phone: phone?.trim() || null,
          homeDepartmentId: department.id,
          homeDepartmentSource: 'SELF',
          departmentSetupAt: new Date(),
        },
      });
      await tx.departmentMember.create({
        data: { departmentId: department.id, userId: created.id, role: 'HELPER' },
      });
      const unique = new Map(stufen.map((s) => [s.stufeId, s.role]));
      if (unique.size) {
        await tx.userStufe.createMany({
          data: [...unique].map(([stufeId, role]) => ({ userId: created.id, stufeId, role, source: 'SELF' })),
        });
      }
      return created;
    });

    fastify.log.info({ userId: user.id, departmentId: department.id }, 'Cevi-Name-Profil angelegt');
    trackUsage('REGISTER', { dim: 'ceviname', departmentId: department.id });
    trackUsage('LOGIN', { dim: 'ceviname', departmentId: department.id });
    return signInCeviNameProfile(reply, user, returnTo);
  });

  /** Cookie setzen und Profil zurückgeben (Login und Registrierung mit Cevi-Name) */
  async function signInCeviNameProfile(
    reply: FastifyReply,
    user: { id: string; email: string | null; ceviName: string | null; isGlobalAdmin: boolean },
    returnTo: string | undefined
  ) {
    const token = fastify.signAuthToken({
      id: user.id,
      email:
        user.email ||
        `${(user.ceviName ?? 'helfer').toLowerCase().replace(/[^a-z0-9]/g, '')}@guest.cevi-schichtplan.ch`,
      isGlobalAdmin: user.isGlobalAdmin,
      amr: 'ceviname',
    });
    setAuthCookie(reply, token);
    return {
      redirectUrl: cleanReturnTo(returnTo),
      user: await loadUserDto(fastify.prisma, user.id, null),
    };
  }

  // 4. Normales Login mit Passwort
  fastify.post('/api/auth/login', async (request, reply) => {
    const parse = LoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const { email, password } = parse.data;
    // Gegen das Durchprobieren von Passwörtern: Fehlversuche pro IP und pro Konto bremsen
    const emailKey = email.trim().toLowerCase();
    if (loginFailuresByIp.isBlocked(request.ip) || loginFailuresByEmail.isBlocked(emailKey)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const user = await fastify.prisma.user.findUnique({
      where: { email: emailKey },
      select: { id: true, email: true, passwordHash: true, emailVerified: true, isGlobalAdmin: true },
    });

    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      loginFailuresByIp.hit(request.ip);
      loginFailuresByEmail.hit(emailKey);
      trackUsage('LOGIN_FAILED', { dim: 'PASSWORD_WRONG', departmentId: request.tenant?.id });
      return reply.status(401).send({ error: 'E-Mail oder Passwort falsch' });
    }
    loginFailuresByEmail.reset(emailKey);

    // E-Mail-Bestätigung erzwingen
    if (!user.emailVerified) {
      return reply.status(403).send({
        error: 'Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir einen Bestätigungslink gesendet.',
        requiresVerification: true,
        email: user.email,
      });
    }

    const token = fastify.signAuthToken({
      id: user.id,
      email: user.email || `${user.id}@cevi-schichtplan.ch`,
      isGlobalAdmin: user.isGlobalAdmin,
      amr: 'password',
    });

    setAuthCookie(reply, token);
    trackUsage('LOGIN', { dim: 'password', departmentId: request.tenant?.id });

    // Das Token steht nur im httpOnly-Cookie, nicht in der Antwort (für Skripte unerreichbar)
    return {
      user: await loadUserDto(fastify.prisma, user.id, request.tenant?.id ?? null),
    };
  });

  // 5. Helfer registrieren mit Passwort (erfordert E-Mail-Bestätigung)
  fastify.post('/api/auth/register-helper', async (request, reply) => {
    if (mailRequestsByIp.hit(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const parse = RegisterHelperSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const { email, password, firstName, lastName, ceviName, phone } = parse.data;
    const cleanEmail = email.toLowerCase().trim();
    const existing = await fastify.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    // Auch ohne Passwort nicht übernehmen: Ein bestehendes Konto (z. B. Cevi-Name-Profil mit selbst
    // eingetragener E-Mail) bekäme sonst von irgendwem ein Passwort und fremde Namen.
    // Die Antwort ist dieselbe wie bei einem neuen Konto: sonst liesse sich durchprobieren, wer ein Konto
    // hat. Die Person mit dieser Adresse bekommt stattdessen einen Hinweis per Mail.
    if (existing) {
      const loginPortalUrl = getLoginPortalBaseUrl(request.headers.host);
      if (!accountExistsMailsByEmail.hit(cleanEmail)) await sendAccountExistsEmail({
        to: cleanEmail,
        name: existing.ceviName || existing.firstName,
        loginUrl: `${loginPortalUrl}/`,
        resetUrl: `${loginPortalUrl}/passwort-vergessen`,
      });
      return registrationAccepted(cleanEmail);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await fastify.prisma.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        firstName,
        lastName: lastName?.trim() || null,
        ceviName: ceviName || null,
        phone: phone || null,
        emailVerified: false,
        emailVerifiedAt: null,
      },
    });

    if (request.tenant) {
      await ensureHelperMembership(fastify.prisma, request.tenant.id, user.id);
    }
    trackUsage('REGISTER', { dim: 'password', departmentId: request.tenant?.id });

    // Token erzeugen & altes löschen
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await fastify.prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });
    await fastify.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: verificationToken,
        email: cleanEmail,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 Stunden
      },
    });

    // Bestätigungs-E-Mail versenden
    const loginPortalUrl = getLoginPortalBaseUrl(request.headers.host);
    const verificationUrl = `${loginPortalUrl}/verify-email?token=${verificationToken}`;
    await sendVerificationEmail({
      to: cleanEmail,
      name: user.ceviName || user.firstName,
      verificationUrl,
    });

    // Absichtlich KEIN Auth-Cookie setzen, damit die E-Mail zuerst verifiziert werden muss
    return registrationAccepted(cleanEmail);
  });

  // 5a. Bestätigungs-E-Mail erneut anfordern
  fastify.post('/api/auth/resend-verification', async (request, reply) => {
    if (mailRequestsByIp.hit(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const parse = ResendVerificationSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const cleanEmail = parse.data.email.toLowerCase().trim();
    const user = await fastify.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    // Immer dieselbe Antwort: Ob es ein Konto gibt, ob es schon bestätigt ist oder eben ein Link ging,
    // soll sich hier nicht abfragen lassen
    const genericAnswer = {
      success: true,
      message: 'Falls es zu dieser E-Mail ein unbestätigtes Konto gibt, haben wir einen neuen Bestätigungslink gesendet.',
    };
    if (!user || user.emailVerified) return genericAnswer;

    const recentToken = await fastify.prisma.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) },
      },
    });
    if (recentToken) return genericAnswer;

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await fastify.prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });
    await fastify.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: verificationToken,
        email: cleanEmail,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const loginPortalUrl = getLoginPortalBaseUrl(request.headers.host);
    const verificationUrl = `${loginPortalUrl}/verify-email?token=${verificationToken}`;
    await sendVerificationEmail({
      to: cleanEmail,
      name: user.ceviName || user.firstName,
      verificationUrl,
    });

    return genericAnswer;
  });

  // 5b. E-Mail-Adresse mit Token bestätigen (POST für UI & API)
  fastify.post('/api/auth/verify-email', async (request, reply) => {
    const parse = VerifyEmailSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const { token } = parse.data;
    const tokenRecord = await fastify.prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!tokenRecord) {
      return reply.status(400).send({
        error: 'Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet.',
      });
    }

    if (tokenRecord.expiresAt < new Date()) {
      await fastify.prisma.emailVerificationToken.delete({ where: { id: tokenRecord.id } });
      return reply.status(400).send({
        error: 'Dieser Bestätigungslink ist abgelaufen. Bitte fordere einen neuen an.',
        expired: true,
        email: tokenRecord.email,
      });
    }

    const updatedUser = await fastify.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: tokenRecord.userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
          email: tokenRecord.email,
        },
      });
      await tx.emailVerificationToken.deleteMany({
        where: { userId: tokenRecord.userId },
      });
      return u;
    });

    trackUsage('EMAIL_VERIFIED');

    // Bewusst kein automatisches Login: Wer die Mail bekommt, hat das Konto nicht unbedingt angelegt
    // (jemand kann ein Konto mit fremder E-Mail vorbereiten). Anmelden geht nur mit dem eigenen Passwort.
    return {
      success: true,
      message: 'E-Mail-Adresse bestätigt. Melde dich jetzt mit deinem Passwort an.',
      email: updatedUser.email,
      name: updatedUser.ceviName || updatedUser.firstName,
    };
  });

  // 5c. Direkter Link-Klick aus E-Mail (leitet auf Next.js Verify-Page weiter)
  fastify.get<{ Querystring: { token?: string } }>(
    '/api/auth/verify-email',
    async (request, reply) => {
      const token = request.query.token;
      const loginBase = getLoginPortalBaseUrl(request.headers.host);
      if (!token) {
        return reply.redirect(`${loginBase}/verify-email?error=missing_token`);
      }
      return reply.redirect(`${loginBase}/verify-email?token=${encodeURIComponent(token)}`);
    }
  );

  // 6. Profil des aktuellen Users abfragen
  fastify.get(
    '/api/auth/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const user = await loadUserDto(fastify.prisma, request.user.id, request.tenant?.id ?? null);
      if (!user) {
        return reply.status(404).send({ error: 'Person nicht gefunden' });
      }
      return user;
    }
  );

  // 6a. Eigene Profilangaben ergänzen (Handynummer, Adresse, ...)
  fastify.patch(
    '/api/auth/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parse = UpdateProfileSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }
      const result = await applyProfileUpdate(fastify.prisma, request.user.id, parse.data);
      if ('error' in result) return reply.status(result.status).send({ error: result.error });
      return loadUserDto(fastify.prisma, request.user.id, request.tenant?.id ?? null);
    }
  );

  // 6c. Eigenes Konto komplett löschen (nur für Accounts mit Cevi.DB oder Passwort)
  fastify.delete(
    '/api/auth/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.id;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          ceviName: true,
          ceviDbId: true,
          passwordHash: true,
          isGlobalAdmin: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'Person nicht gefunden' });
      }

      // Nur Accounts über Cevi.DB oder Passwort dürfen sich selbst löschen
      if (user.ceviDbId === null && !user.passwordHash) {
        return reply.status(403).send({
          error: 'Nur Konten mit Cevi.DB oder Passwort können sich selbst löschen.',
        });
      }

      // Schutz: Der letzte globale Administrator kann sich nicht selbst löschen
      if (user.isGlobalAdmin) {
        const adminCount = await fastify.prisma.user.count({ where: { isGlobalAdmin: true } });
        if (adminCount <= 1) {
          return reply.status(400).send({
            error: 'Du bist die letzte Plattform-Administration und kannst dein Konto nicht löschen.',
          });
        }
      }

      await fastify.prisma.$transaction(async (tx) => {
        // EventAccessLinks entkoppeln, falls dieser User gebunden war
        await tx.eventAccessLink.updateMany({
          where: { boundUserId: userId },
          data: { boundUserId: null },
        });

        // EventDeregistrations und EventAccessLinks createdById auf null setzen
        await tx.eventDeregistration.updateMany({
          where: { createdById: userId },
          data: { createdById: null },
        });

        await tx.eventAccessLink.updateMany({
          where: { createdById: userId },
          data: { createdById: null },
        });

        // Benutzer löschen (kaskadiert zu ShiftSignups, DepartmentMembers, UserStufen, UserCeviDbStufen, EventOrganizers, EventAnswers, EventAccessGrants, EventDeregistrations)
        await tx.user.delete({
          where: { id: userId },
        });
      });

      clearAuthCookie(reply);
      trackUsage('ACCOUNT_DELETE');

      const userDisplayName = user.ceviName
        ? `${user.ceviName} (${user.firstName} ${user.lastName})`
        : `${user.firstName} ${user.lastName}`;

      request.log.info(
        { userId, email: user.email, name: userDisplayName, ceviDbId: user.ceviDbId, hasPassword: Boolean(user.passwordHash) },
        'Person hat ihr Konto selbst gelöscht'
      );

      return { success: true, message: 'Dein Konto wurde erfolgreich gelöscht.' };
    }
  );

  // 6b. Heimabteilung und Stufen angeben (departmentId null = keine Abteilung).
  // Kommt die Abteilung aus Cevi.DB, bleibt sie fest; Stufen aus Cevi.DB ebenfalls.
  fastify.put(
    '/api/auth/me/department',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parse = SetHomeDepartmentSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }
      const userId = request.user.id;
      const current = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { homeDepartmentId: true, homeDepartmentSource: true, ceviDbId: true },
      });
      if (!current) return reply.status(404).send({ error: 'Person nicht gefunden' });

      const fromCeviDb = current.homeDepartmentSource === 'CEVIDB';
      const departmentId = fromCeviDb ? current.homeDepartmentId : parse.data.departmentId;

      if (departmentId && !fromCeviDb) {
        const exists = await fastify.prisma.department.count({ where: { id: departmentId } });
        if (!exists) return reply.status(400).send({ error: 'Diese Abteilung gibt es nicht' });
      }

      const wanted = departmentId ? parse.data.stufen : [];
      const stufen = wanted.length
        ? await fastify.prisma.departmentStufe.findMany({
            where: { id: { in: wanted.map((s) => s.stufeId) }, departmentId: departmentId ?? undefined },
            select: { id: true },
          })
        : [];
      if (stufen.length !== new Set(wanted.map((s) => s.stufeId)).size) {
        return reply.status(400).send({ error: 'Eine Stufe gehört nicht zu dieser Abteilung' });
      }

      await fastify.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            homeDepartmentId: departmentId,
            homeDepartmentSource: departmentId ? (fromCeviDb ? 'CEVIDB' : 'SELF') : null,
            departmentSetupAt: new Date(),
          },
        });
        // Selbst angegebene Stufen ersetzen; Stufen aus Cevi.DB bleiben
        const ceviDbStufen = await tx.userStufe.findMany({
          where: { userId, source: 'CEVIDB' },
          select: { stufeId: true },
        });
        const locked = new Set(ceviDbStufen.map((s) => s.stufeId));
        await tx.userStufe.deleteMany({ where: { userId, source: 'SELF' } });
        const selfStufen = wanted.filter((s) => !locked.has(s.stufeId));
        if (selfStufen.length) {
          await tx.userStufe.createMany({
            data: selfStufen.map((s) => ({ userId, stufeId: s.stufeId, role: s.role, source: 'SELF' })),
            skipDuplicates: true,
          });
        }
      });

      if (departmentId) {
        if (current.ceviDbId !== null) {
          await autoCreateCeviDbDepartmentStufen(fastify.prisma, departmentId, userId);
          await syncCeviDbStufen(fastify.prisma, userId);
        }
        await ensureHelperMembership(fastify.prisma, departmentId, userId);
      }
      return loadUserDto(fastify.prisma, userId, request.tenant?.id ?? null);
    }
  );

  // 6b. Cevi.DB Rohdaten / Debug-Profil (Streng geschützt: NUR globale Admins in der DB)
  fastify.get<{ Querystring: { userId?: string } }>(
    '/api/auth/cevidb/debug-profile',
    { preHandler: [fastify.requireGlobalAdmin] },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');

      // Admin kann eigenes Profil oder das Profil eines beliebigen anderen Benutzers ansehen
      const targetUserId = request.query.userId?.trim() || request.user.id;

      const user = await fastify.prisma.user.findUnique({
        where: { id: targetUserId },
      });

      if (!user) {
        return reply.status(404).send({ error: 'Person nicht gefunden' });
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          ceviName: user.ceviName,
          phone: user.phone,
          birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : null,
          isGlobalAdmin: user.isGlobalAdmin,
          ceviDbId: user.ceviDbId,
          ceviDbSyncedAt: user.ceviDbSyncedAt ? user.ceviDbSyncedAt.toISOString() : null,
          hasCeviDb: Boolean(user.ceviDbId),
        },
        hasCeviDb: Boolean(user.ceviDbId),
        ceviDbData: user.ceviDbData ?? null,
      };
    }
  );

  // 6c. Liste aller Benutzer mit Cevi.DB Profil (NUR globale Admins)
  fastify.get(
    '/api/auth/cevidb/users',
    { preHandler: [fastify.requireGlobalAdmin] },
    async (_request, reply) => {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');

      const users = await fastify.prisma.user.findMany({
        where: {
          ceviDbId: { not: null },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          ceviName: true,
          email: true,
          ceviDbId: true,
          isGlobalAdmin: true,
          ceviDbSyncedAt: true,
        },
        orderBy: [{ ceviName: 'asc' }, { firstName: 'asc' }],
      });

      return {
        users: users.map((u) => ({
          ...u,
          ceviDbSyncedAt: u.ceviDbSyncedAt ? u.ceviDbSyncedAt.toISOString() : null,
        })),
      };
    }
  );

  // 7. Logout
  fastify.post('/api/auth/logout', async (request, reply) => {
    // Token serverseitig sperren: ein kopiertes Cookie hilft nach dem Abmelden nichts mehr
    await fastify.revokeAuthToken(request);
    clearAuthCookie(reply);
    return { ok: true };
  });
};

export default authRoutes;
