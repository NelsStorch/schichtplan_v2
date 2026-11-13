import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { isVerifiedHomeSource } from '../../services/eventAccess.js';
import { ceviDbRoleGroupIds, deriveCeviDbFields } from '../../services/hitobito.js';
import { refreshCeviDbGroups } from '../../services/hitobitoGroups.js';
import {
  storeCeviDbFields,
  resolveCeviDbPlacement,
  syncCeviDbHomeDepartment,
} from '../../services/homeDepartment.js';
import {
  RATE_LIMIT_ERROR,
  tooManyRequests,
} from '../../services/nicknameLogin.js';
import { mergeCeviNameProfilesInto } from '../../services/mergeProfiles.js';
import { trackUsage } from '../../services/usageStats.js';
import { syncCeviDbLeadership } from '../../services/departmentLeaders.js';
import { hitobitoCircuitBreaker } from '../../services/hitobitoCircuitBreaker.js';
import { needsSecondFactor, setChallengeCookie } from '../../services/twoFactor.js';

import {
  getOrganizationSlugFromHost,
  getOrganizationByDbType,
  getHitobitoConfig,
  type OrganizationType,
} from '@schichtplan/shared';

import {
  MAX_LINK_ATTEMPTS,
  setAuthCookie,
  cleanReturnTo,
  loginErrorUrl,
  defaultDestination,
  bootstrapAdminCeviDbIds,
  getCeviDbRedirectUri,
  loginPageUrl,
  PENDING_LINK_COOKIE,
  PENDING_LINK_TTL_SECONDS,
  pendingLinks,
  createPendingLink,
  readPendingLink,
  ensureHelperMembership,
  CEVIDB_REQUEST_TIMEOUT_MS,
  trackCeviDbFailure,
  trackHitobitoSuccess,
} from '../../services/authSession.js';


interface HitobitoProviderConfig {
  type: OrganizationType;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

function getHitobitoConfigFor(orgSlugOrHost?: string | null): HitobitoProviderConfig {
  const orgSlug = getOrganizationSlugFromHost(orgSlugOrHost);
  if (orgSlug === 'pfadi') {
    return {
      type: 'PFADI',
      baseUrl: process.env.MIDATA_BASE_URL || 'https://db.scout.ch',
      // Kein Rückfall auf die Cevi.DB-Zugangsdaten: sonst ginge das Cevi-Secret an eine fremde Hitobito-Instanz
      clientId: process.env.MIDATA_CLIENT_ID || '',
      clientSecret: process.env.MIDATA_CLIENT_SECRET || '',
    };
  }
  if (orgSlug === 'jubla') {
    return {
      type: 'JUBLA',
      baseUrl: process.env.JUBLADB_BASE_URL || 'https://db.jubla.ch',
      clientId: process.env.JUBLADB_CLIENT_ID || '',
      clientSecret: process.env.JUBLADB_CLIENT_SECRET || '',
    };
  }
  return {
    type: 'CEVI',
    baseUrl: process.env.CEVIDB_BASE_URL || 'https://db.cevi.ch',
    clientId: process.env.CEVIDB_CLIENT_ID || '',
    clientSecret: process.env.CEVIDB_CLIENT_SECRET || '',
  };
}

/** Verbände mit Hitobito-Login (Vereine melden sich mit E-Mail und Passwort an) */
const HITOBITO_PROVIDERS: readonly unknown[] = ['CEVI', 'PFADI', 'JUBLA'];

/** Anmeldung über Hitobito (Cevi.DB, PBS MiData, Jubla-DB), inkl. Verknüpfen mit einem bestehenden Passwort-Konto */
const hitobitoAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Cevi.DB OAuth Login Redirect
  fastify.get<{ Querystring: { returnTo?: string; tenantSlug?: string; org?: string } }>(
    '/api/auth/cevidb/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Cevi.DB OAuth-Login starten',
        description: 'Leitet den Browser zur Authentifizierung an die Cevi.DB (Hitobito) weiter.',
        querystring: z.object({
          returnTo: z.string().optional().describe('Ziel-URL nach erfolgreicher Anmeldung'),
          tenantSlug: z.string().optional().describe('Subdomain der Abteilung'),
          org: z.string().optional().describe('Verbands-Kürzel (cevi, pfadi, jubla)'),
        }),
      },
    },
    async (request, reply) => {
      const reqHost = request.hostname;
      const targetOrg = request.query.org || reqHost || request.query.returnTo;
      const providerConfig = getHitobitoConfigFor(targetOrg);
      const redirectUri = getCeviDbRedirectUri(process.env, reqHost);

      // Ohne Ziel bestimmt der Callback die Weiterleitung (eigene Abteilung oder Landingpage)
      const returnTo = request.query.returnTo
        ? cleanReturnTo(request.query.returnTo, '/', reqHost)
        : request.tenant
          ? defaultDestination(request.tenant.slug, reqHost, request.tenant.organization)
          : null;

      if (!providerConfig.clientId) {
        fastify.log.error(`${providerConfig.type} OAuth ist nicht konfiguriert (CLIENT_ID fehlt in der Umgebung)`);
        return reply.redirect(loginErrorUrl('cevidb_unavailable', returnTo, reqHost, providerConfig.type));
      }

      // Bei aktiver Störung von Hitobito gar nicht erst weiterleiten, sondern sofort Ausweich-Login anbieten
      if (hitobitoCircuitBreaker.isOpen(providerConfig.type)) {
        fastify.log.warn(`${providerConfig.type} Circuit Breaker ist aktiv (Hitobito temporär nicht erreichbar)`);
        return reply.redirect(loginErrorUrl('cevidb_unavailable', returnTo, reqHost, providerConfig.type));
      }

      const stateObj = {
        token: crypto.randomBytes(16).toString('hex'),
        returnTo,
        tenantSlug: request.query.tenantSlug || request.tenant?.slug || null,
        provider: providerConfig.type,
      };

      const stateEncoded = Buffer.from(JSON.stringify(stateObj)).toString('base64url');

      reply.setCookie('cevidb_oauth_state', stateEncoded, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10, // 10 Minuten
      });

      const authUrl = new URL(`${providerConfig.baseUrl}/oauth/authorize`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', providerConfig.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', getHitobitoConfig(providerConfig.type).oauthScopes);
      authUrl.searchParams.set('state', stateEncoded);

      return reply.redirect(authUrl.toString());
    }
  );

  // 2. Cevi.DB OAuth Callback
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/cevidb/callback',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Cevi.DB OAuth Callback',
        description: 'OAuth-Rücksprungadresse der Cevi.DB. Tauscht den Authorization Code gegen Tokens und initialisiert die Benutzersitzung.',
        querystring: z.object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { code, state, error } = request.query;

      // null = kein Ziel angegeben (direkt auf der Login-Seite angemeldet)
      let returnTo: string | null = null;
      let tenantSlug: string | null = null;
      let providerType: OrganizationType = 'CEVI';

      try {
        if (state) {
          const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
          returnTo = parsedState.returnTo ? cleanReturnTo(parsedState.returnTo, '/', request.hostname) : null;
          tenantSlug = typeof parsedState.tenantSlug === 'string' ? parsedState.tenantSlug : null;
          if (HITOBITO_PROVIDERS.includes(parsedState.provider)) providerType = parsedState.provider;
        }
      } catch {
        // Fallback default
      }

      const providerConfig = getHitobitoConfigFor(providerType);
      const redirectUri = getCeviDbRedirectUri(process.env, request.hostname);

      // Abbruch durch die Person auf Hitobito (z. B. Zugriff verweigert)
      if (error) {
        return reply.redirect(loginErrorUrl('cevidb_denied', returnTo, request.hostname, providerConfig.type));
      }

      // state muss zum Cookie aus /cevidb/login passen, sonst könnte ein fremder Code untergeschoben werden
      if (!code || !state || state !== request.cookies.cevidb_oauth_state) {
        fastify.log.warn('Hitobito Callback ohne gültigen Code oder state');
        return reply.redirect(loginErrorUrl('cevidb_failed', returnTo, request.hostname, providerConfig.type));
      }

      // Ohne eigene Zugangsdaten des Verbands nichts an dessen Hitobito schicken
      if (!providerConfig.clientId || !providerConfig.clientSecret) {
        fastify.log.error(`${providerConfig.type} OAuth ist nicht konfiguriert (CLIENT_ID/SECRET fehlt)`);
        return reply.redirect(loginErrorUrl('cevidb_unavailable', returnTo, request.hostname, providerConfig.type));
      }

      let profile: any;
      try {
        // Code gegen Token tauschen
        const tokenRes = await fetch(`${providerConfig.baseUrl}/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: providerConfig.clientId,
            client_secret: providerConfig.clientSecret,
            redirect_uri: redirectUri,
            code,
          }),
          signal: AbortSignal.timeout(CEVIDB_REQUEST_TIMEOUT_MS),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          fastify.log.error(`${providerConfig.type} Token-Abruf fehlgeschlagen: ${errText}`);
          // Nur Serverfehler zählen als Störung; 4xx (z. B. abgelaufener Code) liegt nicht an Hitobito
          if (tokenRes.status >= 500) hitobitoCircuitBreaker.recordFailure(providerConfig.type);
          trackCeviDbFailure(providerConfig.type);
          return reply.redirect(loginErrorUrl('cevidb_failed', returnTo, request.hostname, providerConfig.type));
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
        const profileRes = await fetch(`${providerConfig.baseUrl}/oauth/profile`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Scope': 'with_roles',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(CEVIDB_REQUEST_TIMEOUT_MS),
        });

        if (!profileRes.ok) {
          fastify.log.error(`${providerConfig.type} Profilabruf fehlgeschlagen`);
          if (profileRes.status >= 500) hitobitoCircuitBreaker.recordFailure(providerConfig.type);
          trackCeviDbFailure(providerConfig.type);
          return reply.redirect(loginErrorUrl('cevidb_failed', returnTo, request.hostname, providerConfig.type));
        }

        profile = await profileRes.json();

        // Falls OIDC aktiv ist, versuche zusätzlich Userinfo für allfällige extra Felder abzurufen
        try {
          const userinfoRes = await fetch(`${providerConfig.baseUrl}/oauth/userinfo`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(CEVIDB_REQUEST_TIMEOUT_MS),
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
          grantedScopes: tokenData.scope || getHitobitoConfig(providerConfig.type).oauthScopes,
          tokenType: tokenData.token_type || 'Bearer',
          expiresIn: tokenData.expires_in,
        };

        // Gruppenstruktur zu den Rollen: hier, weil das Token nur jetzt da ist (wird nicht gespeichert).
        // Wichtig: Leiter-Gruppen und Stamm-Gruppe zuerst auffrischen, damit die Abteilungserstellung verlässlich funktioniert.
        const previewDerived = deriveCeviDbFields(profile, providerConfig.type);
        const prioritizedGroupIds = [
          ...previewDerived.leaderGroupIds,
          ...(previewDerived.ortsgruppeId ? [previewDerived.ortsgruppeId] : []),
          ...(previewDerived.primaryGroupId ? [previewDerived.primaryGroupId] : []),
          ...ceviDbRoleGroupIds(profile),
        ];

        await refreshCeviDbGroups(fastify.prisma, fastify.log, {
          baseUrl: providerConfig.baseUrl,
          accessToken,
          grantedScopes: profile._meta.grantedScopes,
          groupIds: prioritizedGroupIds,
          provider: providerConfig.type,
        });

        hitobitoCircuitBreaker.recordSuccess(providerConfig.type);
      } catch (err) {
        fastify.log.error(err, `${providerConfig.type} nicht erreichbar`);
        hitobitoCircuitBreaker.recordFailure(providerConfig.type);
        trackCeviDbFailure(providerConfig.type);
        return reply.redirect(loginErrorUrl('cevidb_failed', returnTo, request.hostname, providerConfig.type));
      }

      trackHitobitoSuccess(providerConfig.type);
      reply.clearCookie('cevidb_oauth_state', { path: '/' });
      return reply.redirect(await finishCeviDbLogin(reply, profile, returnTo, tenantSlug, undefined, providerConfig.type));
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
    linkConfirmedUserId?: string,
    targetProvider: OrganizationType = 'CEVI'
  ): Promise<string> {
    const ceviDbId = profile.id;
    const providerId = String(profile.id);
    const provider = targetProvider;
    const org = getOrganizationByDbType(provider);
    const email = (profile.email || `${provider.toLowerCase()}_${providerId}@${org.domain}`).toLowerCase();
    const firstName = profile.first_name || profile.given_name || 'Mitglied';
    const lastName = profile.last_name || profile.family_name || '';
    const nickname = profile.nickname || null;

    let birthDate: Date | null = null;
    if (profile.birthday) {
      const parsedBirthday = new Date(profile.birthday);
      if (!isNaN(parsedBirthday.getTime())) {
        birthDate = parsedBirthday;
      }
    }

    const now = new Date();

    // Benutzer finden: zuerst über die Provider-ID, sonst über die E-Mail (E-Mails sind eindeutig)
    let user = await fastify.prisma.user.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
    if (!user) {
      let byEmail = await fastify.prisma.user.findUnique({ where: { email } });
      if (byEmail && !byEmail.emailVerified && byEmail.id !== linkConfirmedUserId) {
        // Unbestätigte Adresse (Registrierung ohne Bestätigung oder selbst ins Profil geschrieben):
        // Sie gehört nicht nachweislich diesem Konto. Der Provider bestätigt sie, das andere Konto verliert sie.
        // Sonst könnte jemand mit fremder E-Mail ein Konto vorbereiten und es so übernehmen oder sperren.
        await fastify.prisma.$transaction([
          fastify.prisma.emailVerificationToken.deleteMany({ where: { userId: byEmail.id } }),
          fastify.prisma.user.update({ where: { id: byEmail.id }, data: { email: null } }),
        ]);
        fastify.log.warn({ userId: byEmail.id, ceviDbId }, `${provider}-Login: unbestätigte E-Mail von anderem Konto gelöst`);
        byEmail = null;
      }
      if (byEmail && byEmail.providerId !== null) {
        // E-Mail gehört schon zu einer anderen Person des Providers: nicht überschreiben
        fastify.log.warn({ userId: byEmail.id, ceviDbId }, `${provider}-Login: E-Mail gehört zu anderem Provider-Konto`);
        return loginErrorUrl('cevidb_email_taken', returnTo, reply.request?.hostname, provider);
      }
      if (byEmail?.passwordHash && byEmail.id !== linkConfirmedUserId) {
        // Passwort-Konto mit gleicher E-Mail: erst nach Passwort verknüpfen (login.<domain>/konto-verknuepfen)
        const token = createPendingLink({ profile, returnTo, tenantSlug, userId: byEmail.id, provider });
        reply.setCookie(PENDING_LINK_COOKIE, token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: PENDING_LINK_TTL_SECONDS,
        });
        return loginPageUrl('/konto-verknuepfen', returnTo ?? '', reply.request?.hostname);
      }
      user = byEmail;
    }

    // Hitobito ist die Quelle: Was dort steht, ersetzt die lokalen Werte bei jedem Login.
    if (!user) {
      trackUsage('REGISTER', { dim: provider === 'CEVI' ? 'cevidb' : 'hitobito' });
      user = await fastify.prisma.user.create({
        data: {
          email,
          provider,
          providerId,
          firstName,
          lastName,
          nickname,
          birthDate,
          emailVerified: true,
          emailVerifiedAt: now,
          providerSyncedAt: now,
        },
      });
    } else {
      user = await fastify.prisma.user.update({
        where: { id: user.id },
        data: {
          provider,
          providerId,
          nickname: nickname || user.nickname,
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
          birthDate: birthDate || user.birthDate,
          ...(await ceviDbEmailUpdate(user, profile.email)),
          emailVerified: true,
          emailVerifiedAt: user.emailVerifiedAt || now,
          providerSyncedAt: now,
        },
      });
    }

    if (provider === 'CEVI' && !user.isGlobalAdmin && typeof ceviDbId === 'number' && bootstrapAdminCeviDbIds().has(ceviDbId)) {
      user = await fastify.prisma.user.update({
        where: { id: user.id },
        data: { isGlobalAdmin: true },
      });
      fastify.log.info({ userId: user.id, ceviDbId }, 'Cevi.DB-Person zum globalen Admin befördert');
    }

    // Was der Schichtplan aus Hitobito (Cevi, Pfadi, Jubla) braucht, in eigene Spalten schreiben.
    // Die eigene Abteilung und die Stufen kommen aus den Rollen und der Gruppenstruktur.
    const derived = deriveCeviDbFields(profile, provider);
    const placement = await resolveCeviDbPlacement(fastify.prisma, derived, user.homeDepartmentId, provider);
    await storeCeviDbFields(fastify.prisma, user.id, derived, placement);
    const homeDepartment = await syncCeviDbHomeDepartment(fastify.prisma, user, placement, provider);
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
        where: { organization_slug: { organization: provider, slug: tenantSlug } },
        select: { id: true },
      });
      if (department) {
        tenantDepartmentId = department.id;
        await ensureHelperMembership(fastify.prisma, department.id, user.id);
      }
    }

    // Frühere Cevi-Name-Profile derselben Person (Name, Geburtsdatum, Abteilung) ins Konto übernehmen.
    // Nur in Abteilungen, die Cevi.DB über die Rollen belegt (oder die Abteilungsleitung bestätigt hat):
    // Cevi-Name, Geburtsdatum, `ortsgruppe_id` und die Abteilung beim Login (tenantSlug) kann die Person
    // selbst wählen. Sonst liesse sich so ein fremdes Cevi-Name-Profil samt Schichten dauerhaft übernehmen.
    // Ein Fehler hier darf den Login nicht verhindern.
    try {
      const home = await fastify.prisma.user.findUnique({
        where: { id: user.id },
        select: { homeDepartmentId: true, homeDepartmentSource: true },
      });
      const mergeDepartmentIds = [
        ...placement.departmentIds,
        ...(home?.homeDepartmentId && isVerifiedHomeSource(home.homeDepartmentSource) ? [home.homeDepartmentId] : []),
      ];
      const merged = await mergeCeviNameProfilesInto(fastify.prisma, user, mergeDepartmentIds);
      if (merged > 0) {
        fastify.log.info({ userId: user.id, merged }, 'Cevi-Name-Profile ins Cevi.DB-Konto übernommen');
        trackUsage('PROFILE_MERGE', { n: merged, departmentId: homeDepartment?.id ?? tenantDepartmentId });
        user = await fastify.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      }
    } catch (err) {
      fastify.log.error({ err, userId: user.id }, 'Cevi-Name-Profile konnten nicht übernommen werden');
    }

    const amr = provider === 'CEVI' ? 'cevidb' : 'hitobito';

    // Ohne Ziel: Abteilungsseite, sonst Landingpage (nicht zurück auf die Login-Seite)
    const target = returnTo ?? defaultDestination(homeDepartment?.slug ?? null, reply.request?.hostname, homeDepartment?.organization ?? provider);

    let redirectUrl = target;
    // Abteilungsleitung, deren Ortsgruppe noch keinen Schichtplan hat: Abteilung anlegen anbieten
    if (!homeDepartment && derived.isDepartmentLeader && derived.ortsgruppeId !== null) {
      redirectUrl = loginPageUrl('/abteilung-erstellen', target, reply.request?.hostname);
    } else if (!homeDepartment) {
      // Ohne passende Abteilung im Schichtplan: Abteilung und Stufe einmal nachfragen (auch nach einem Abteilungswechsel)
      const setup = await fastify.prisma.user.findUnique({ where: { id: user.id }, select: { departmentSetupAt: true } });
      if (!setup?.departmentSetupAt) redirectUrl = loginPageUrl('/abteilung', target, reply.request?.hostname);
    }

    // Zwei-Faktor: beim Verbands-Login nur, wenn die Person es so eingestellt hat. Beim Verknüpfen
    // wurde eben das Passwort des Kontos verwendet: dann gilt die Regel für den Passwort-Login.
    if (needsSecondFactor(user, linkConfirmedUserId ? 'password' : 'provider')) {
      setChallengeCookie(reply, { uid: user.id, amr, next: redirectUrl });
      return loginPageUrl('/zwei-faktor', returnTo ?? '', reply.request?.hostname);
    }

    const token = fastify.signAuthToken({
      id: user.id,
      email: user.email || `${user.id}@${getOrganizationByDbType(provider).domain}`,
      isGlobalAdmin: user.isGlobalAdmin,
      amr,
    });

    setAuthCookie(reply, token);
    trackUsage('LOGIN', { dim: amr, departmentId: homeDepartment?.id ?? tenantDepartmentId });
    return redirectUrl;
  }

  // 2b. Cevi.DB mit bestehendem Passwort-Konto (gleiche E-Mail) verknüpfen: nur mit dessen Passwort.
  //     Ohne Passwort kein Login, denn zwei Konten mit derselben E-Mail gibt es nicht.
  fastify.get(
    '/api/auth/cevidb/link',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Status einer offenen Cevi.DB-Verknüpfung abrufen',
        description: 'Liefert E-Mail und Name eines Kontos, das mit einem Cevi.DB-Profil verknüpft werden soll.',
      },
    },
    async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const link = readPendingLink(request.cookies[PENDING_LINK_COOKIE]);
    if (!link) return reply.status(404).send({ error: 'Keine offene Verknüpfung. Melde dich nochmals mit Cevi.DB an.' });
    const user = await fastify.prisma.user.findUnique({
      where: { id: link.userId },
      select: { email: true, nickname: true, firstName: true },
    });
    if (!user) return reply.status(404).send({ error: 'Das Konto gibt es nicht mehr.' });
    return { email: user.email, name: user.nickname || user.firstName, returnTo: link.returnTo };
  });

  fastify.post(
    '/api/auth/cevidb/link',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Cevi.DB-Konto mit Passwort bestätigen und verknüpfen',
        description: 'Bestätigt die Kontoverknüpfung mit dem bisherigen Kontopasswort.',
        body: z.object({
          password: z.string().describe('Passwort des bestehenden Kontos'),
        }),
      },
    },
    async (request, reply) => {
    if (tooManyRequests(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR });
    }
    const token = request.cookies[PENDING_LINK_COOKIE];
    const link = readPendingLink(token);
    if (!link) return reply.status(404).send({ error: 'Die Verknüpfung ist abgelaufen. Melde dich nochmals mit Cevi.DB an.' });

    const password = typeof (request.body as any)?.password === 'string' ? (request.body as any).password : '';
    const user = await fastify.prisma.user.findUnique({ where: { id: link.userId } });
    // Der Vergleich läuft immer über bcrypt; ein leeres Passwort oder fehlender Hash zählt nur als Fehlversuch
    const passwordOk = user?.passwordHash ? (await bcrypt.compare(password, user.passwordHash)) && password.length > 0 : false;
    if (!user || !passwordOk) {
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
    const redirectUrl = await finishCeviDbLogin(reply, link.profile, link.returnTo, link.tenantSlug, user.id, link.provider || 'CEVI');
    fastify.log.info({ userId: user.id }, 'Passwort-Konto mit Provider verknüpft');
    trackUsage('ACCOUNT_LINK');
    return { redirectUrl };
  });

  fastify.delete(
    '/api/auth/cevidb/link',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Offene Cevi.DB-Verknüpfung verwerfen',
        description: 'Bricht den Verknüpfungsvorgang zwischen Cevi.DB und bestehendem Passwortkonto ab.',
      },
    },
    async (request, reply) => {
    const token = request.cookies[PENDING_LINK_COOKIE];
    if (token) pendingLinks.delete(token);
    reply.clearCookie(PENDING_LINK_COOKIE, { path: '/' });
    return { ok: true };
  });
};

export { hitobitoAuthRoutes };
export const ceviDbAuthRoutes = hitobitoAuthRoutes;
export default hitobitoAuthRoutes;

