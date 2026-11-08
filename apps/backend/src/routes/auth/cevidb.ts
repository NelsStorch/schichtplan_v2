import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { isVerifiedHomeSource } from '../../services/eventAccess.js';
import { ceviDbRoleGroupIds, deriveCeviDbFields } from '../../services/cevidb.js';
import { refreshCeviDbGroups } from '../../services/cevidbGroups.js';
import { cevidbConfig } from '../../config/cevidb.js';
import {
  storeCeviDbFields,
  resolveCeviDbPlacement,
  syncCeviDbHomeDepartment,
} from '../../services/homeDepartment.js';
import {
  RATE_LIMIT_ERROR,
  tooManyRequests,
} from '../../services/ceviNameLogin.js';
import { mergeCeviNameProfilesInto } from '../../services/mergeProfiles.js';
import { trackUsage } from '../../services/usageStats.js';
import { syncCeviDbLeadership } from '../../services/departmentLeaders.js';

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
  CEVIDB_REQUEST_TIMEOUT_MS,
  pendingLinks,
  createPendingLink,
  readPendingLink,
  ensureHelperMembership,
  trackCeviDbFailure,
} from '../../services/authSession.js';


/** Anmeldung über Cevi.DB (OAuth), inkl. Verknüpfen mit einem bestehenden Passwort-Konto */
const ceviDbAuthRoutes: FastifyPluginAsync = async (fastify) => {
  const CEVIDB_BASE_URL = process.env.CEVIDB_BASE_URL || 'https://db.cevi.ch';
  const CEVIDB_CLIENT_ID = process.env.CEVIDB_CLIENT_ID || '';
  const CEVIDB_CLIENT_SECRET = process.env.CEVIDB_CLIENT_SECRET || '';

  // 1. Cevi.DB OAuth Login Redirect
  fastify.get<{ Querystring: { returnTo?: string; tenantSlug?: string } }>(
    '/api/auth/cevidb/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Cevi.DB OAuth-Login starten',
        description: 'Leitet den Browser zur Authentifizierung an die Cevi.DB (Hitobito) weiter.',
        querystring: z.object({
          returnTo: z.string().optional().describe('Ziel-URL nach erfolgreicher Anmeldung'),
          tenantSlug: z.string().optional().describe('Subdomain der Abteilung'),
        }),
      },
    },
    async (request, reply) => {
      // Aus der Konfiguration, nicht aus dem Host-Header
      const redirectUri = getCeviDbRedirectUri();

      // Ohne Ziel bestimmt der Callback die Weiterleitung (eigene Abteilung oder Landingpage)
      const returnTo = request.query.returnTo
        ? cleanReturnTo(request.query.returnTo)
        : request.tenant
          ? defaultDestination(request.tenant.slug)
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

      // Aus der Konfiguration, nicht aus dem Host-Header
      const redirectUri = getCeviDbRedirectUri();

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
          signal: AbortSignal.timeout(CEVIDB_REQUEST_TIMEOUT_MS),
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
          signal: AbortSignal.timeout(CEVIDB_REQUEST_TIMEOUT_MS),
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

    // Was der Schichtplan aus Cevi.DB braucht, in eigene Spalten schreiben (das Rohprofil wird nicht gespeichert).
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
      select: { email: true, ceviName: true, firstName: true },
    });
    if (!user) return reply.status(404).send({ error: 'Das Konto gibt es nicht mehr.' });
    return { email: user.email, name: user.ceviName || user.firstName, returnTo: link.returnTo };
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

export default ceviDbAuthRoutes;
