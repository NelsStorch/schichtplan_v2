import { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { parseCeviDbGroupId } from '../services/cevidb.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  LoginSchema,
  RegisterHelperSchema,
  CeviNameQuickLoginSchema,
  safeReturnTo,
} from '@schichtplan/shared';

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
  reply.setCookie('token', token, {
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
function loginErrorUrl(code: 'cevidb_unavailable' | 'cevidb_denied' | 'cevidb_failed', returnTo: string) {
  const base = process.env.NODE_ENV === 'production' ? `https://login.${rootDomain()}` : '';
  return `${base}/?error=${code}&return_to=${encodeURIComponent(returnTo)}`;
}

/**
 * Cevi.DB-Personen-IDs (kommagetrennt, z. B. "12211,3456"), die beim Cevi.DB-Login automatisch
 * globale Admins werden. Befördert nur, entzieht die Rolle nie wieder (das geht über die DB).
 */
function bootstrapAdminCeviDbIds(): Set<number> {
  const ids = (process.env.GLOBAL_ADMIN_CEVIDB_IDS || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return new Set(ids);
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
  reply.clearCookie('token', {
    path: '/',
    domain,
  });
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

      const returnTo = cleanReturnTo(
        request.query.returnTo,
        request.tenant ? `${protocol}://${request.tenant.slug}.${host}` : '/'
      );

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
      authUrl.searchParams.set('scope', 'email name with_roles');
      authUrl.searchParams.set('state', stateEncoded);

      return reply.redirect(authUrl.toString());
    }
  );

  // 2. Cevi.DB OAuth Callback
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/cevidb/callback',
    async (request, reply) => {
      const { code, state, error } = request.query;

      let returnTo = '/';
      let tenantSlug: string | null = null;

      try {
        if (state) {
          const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
          returnTo = cleanReturnTo(parsedState.returnTo);
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
          grantedScopes: tokenData.scope || 'email name with_roles',
          tokenType: tokenData.token_type || 'Bearer',
          expiresIn: tokenData.expires_in,
        };
      } catch (err) {
        fastify.log.error(err, 'Cevi.DB nicht erreichbar');
        return reply.redirect(loginErrorUrl('cevidb_failed', returnTo));
      }

      // Sicherstellen, dass DB-Spalten ceviDbData / ceviDbSyncedAt existieren
      try {
        await fastify.prisma.$executeRawUnsafe(`
          ALTER TABLE "users"
          ADD COLUMN IF NOT EXISTS "ceviDbData" JSONB,
          ADD COLUMN IF NOT EXISTS "ceviDbSyncedAt" TIMESTAMP(3);
        `);
      } catch {
        // Ignorieren falls Berechtigung fehlt oder Tabelle bereits angepasst
      }

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

      // Benutzer in DB finden oder erstellen
      let user = await fastify.prisma.user.findFirst({
        where: {
          OR: [{ ceviDbId }, { email }],
        },
      });

      if (!user) {
        user = await fastify.prisma.user.create({
          data: {
            email,
            ceviDbId,
            firstName,
            lastName,
            ceviName,
            birthDate,
            ceviDbData: profile,
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
            ceviDbData: profile,
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

      // Die eigene Abteilung kommt aus Cevi.DB: Ortsgruppe der Person -> Abteilung mit gleicher ceviDbGroupId
      const ortsgruppeId = parseCeviDbGroupId(profile.ortsgruppe_id);
      if (ortsgruppeId !== null) {
        const homeDepartment = await fastify.prisma.department.findUnique({
          where: { ceviDbGroupId: ortsgruppeId },
          select: { id: true },
        });
        if (homeDepartment) {
          await ensureHelperMembership(fastify.prisma, homeDepartment.id, user.id);
        }
      }

      // Kommt die Person von einer Abteilungs-Subdomain, dort ebenfalls als Helfer eintragen
      if (tenantSlug) {
        const department = await fastify.prisma.department.findUnique({
          where: { slug: tenantSlug },
          select: { id: true },
        });
        if (department) {
          await ensureHelperMembership(fastify.prisma, department.id, user.id);
        }
      }

      const token = fastify.jwt.sign({
        id: user.id,
        email: user.email || `${user.id}@cevi-schichtplan.ch`,
        isGlobalAdmin: user.isGlobalAdmin,
      });

      reply.clearCookie('cevidb_oauth_state', { path: '/' });
      setAuthCookie(reply, token);

      return reply.redirect(returnTo);
    }
  );

  // 3. Cevi-Name Schnell-Login (Passwortlos für Chilbi / Helfer)
  fastify.post('/api/auth/ceviname-login', async (request, reply) => {
    const parse = CeviNameQuickLoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const { ceviName, firstName, lastName, birthDate, phone, departmentSlug, returnTo } =
      parse.data;
    const cleanCeviName = ceviName.trim();

    // Suche existierenden Benutzer anhand des Cevi-Namens
    let user = await fastify.prisma.user.findFirst({
      where: {
        ceviName: {
          equals: cleanCeviName,
          mode: 'insensitive',
        },
      },
    });

    if (user) {
      // Falls der Account passwortgeschützt ist, verlange das Passwort
      if (user.passwordHash) {
        return reply.status(403).send({
          error:
            `Der Cevi-Name "${cleanCeviName}" gehört einem registrierten Leiter-Account. Bitte melde dich mit Passwort oder Cevi.DB an.`,
          requiresPassword: true,
        });
      }

      // Aktualisiere Geburtsdatum oder Telefon falls nachgereicht
      let parsedBirthDate: Date | null = user.birthDate;
      if (!parsedBirthDate && birthDate) {
        const bDate = new Date(birthDate);
        if (!isNaN(bDate.getTime())) parsedBirthDate = bDate;
      }

      user = await fastify.prisma.user.update({
        where: { id: user.id },
        data: {
          birthDate: parsedBirthDate,
          phone: phone || user.phone,
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
        },
      });
    } else {
      // Neuer Helfer wird passwortlos angelegt
      let parsedBirthDate: Date | null = null;
      if (birthDate) {
        const bDate = new Date(birthDate);
        if (!isNaN(bDate.getTime())) parsedBirthDate = bDate;
      }

      user = await fastify.prisma.user.create({
        data: {
          ceviName: cleanCeviName,
          firstName: firstName?.trim() || cleanCeviName,
          lastName: lastName?.trim() || '(Helfer)',
          birthDate: parsedBirthDate,
          phone: phone?.trim() || null,
        },
      });
    }

    // Falls Abteilungs-Kontext vorhanden, als Helfer verknüpfen
    const targetDeptSlug = departmentSlug || request.tenant?.slug;
    if (targetDeptSlug) {
      const department = await fastify.prisma.department.findUnique({
        where: { slug: targetDeptSlug },
      });

      if (department) {
        const existingMember = await fastify.prisma.departmentMember.findUnique({
          where: {
            departmentId_userId: {
              departmentId: department.id,
              userId: user.id,
            },
          },
        });

        if (!existingMember) {
          await fastify.prisma.departmentMember.create({
            data: {
              departmentId: department.id,
              userId: user.id,
              role: 'HELPER',
            },
          });
        }
      }
    }

    // Token erstellen und Wildcard-Cookie setzen
    const token = fastify.jwt.sign({
      id: user.id,
      email:
        user.email ||
        `${cleanCeviName.toLowerCase().replace(/[^a-z0-9]/g, '')}@guest.cevi-schichtplan.ch`,
      isGlobalAdmin: user.isGlobalAdmin,
    });

    setAuthCookie(reply, token);

    return {
      token,
      redirectUrl: cleanReturnTo(returnTo),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ceviName: user.ceviName,
        phone: user.phone,
        birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : null,
        isGlobalAdmin: user.isGlobalAdmin,
      },
    };
  });

  // 4. Normales Login mit Passwort
  fastify.post('/api/auth/login', async (request, reply) => {
    const parse = LoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const { email, password } = parse.data;
    const user = await fastify.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          include: { department: true },
        },
      },
    });

    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.status(401).send({ error: 'E-Mail oder Passwort falsch' });
    }

    const token = fastify.jwt.sign({
      id: user.id,
      email: user.email || `${user.id}@cevi-schichtplan.ch`,
      isGlobalAdmin: user.isGlobalAdmin,
    });

    setAuthCookie(reply, token);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ceviName: user.ceviName,
        phone: user.phone,
        birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : null,
        isGlobalAdmin: user.isGlobalAdmin,
      },
    };
  });

  // 5. Helfer registrieren mit Passwort
  fastify.post('/api/auth/register-helper', async (request, reply) => {
    const parse = RegisterHelperSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const { email, password, firstName, lastName, ceviName, phone } = parse.data;
    const existing = await fastify.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Diese E-Mail ist bereits registriert' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await fastify.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        ceviName: ceviName || null,
        phone: phone || null,
      },
    });

    if (request.tenant) {
      await fastify.prisma.departmentMember.create({
        data: {
          departmentId: request.tenant.id,
          userId: user.id,
          role: 'HELPER',
        },
      });
    }

    const token = fastify.jwt.sign({
      id: user.id,
      email: user.email,
      isGlobalAdmin: false,
    });

    setAuthCookie(reply, token);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ceviName: user.ceviName,
        phone: user.phone,
        birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : null,
        isGlobalAdmin: false,
      },
    };
  });

  // 6. Profil des aktuellen Users abfragen
  fastify.get(
    '/api/auth/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        include: {
          memberships: {
            where: request.tenant ? { departmentId: request.tenant.id } : undefined,
            include: { department: true },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
      }

      const currentMembership = request.tenant
        ? user.memberships.find((m) => m.departmentId === request.tenant!.id)
        : null;

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ceviName: user.ceviName,
        phone: user.phone,
        birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : null,
        isGlobalAdmin: user.isGlobalAdmin,
        departmentRole: currentMembership ? currentMembership.role : null,
        ceviDbId: user.ceviDbId,
        ceviDbSyncedAt: user.ceviDbSyncedAt ? user.ceviDbSyncedAt.toISOString() : null,
        hasCeviDb: Boolean(user.ceviDbId),
      };
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
        return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
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
  fastify.post('/api/auth/logout', async (_request, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });
};

export default authRoutes;
