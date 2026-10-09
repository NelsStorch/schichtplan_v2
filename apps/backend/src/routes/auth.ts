import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { LoginSchema, RegisterHelperSchema } from '@schichtplan/shared';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const CEVIDB_BASE_URL = process.env.CEVIDB_BASE_URL || 'https://db.cevi.ch';
  const CEVIDB_CLIENT_ID = process.env.CEVIDB_CLIENT_ID || '';
  const CEVIDB_CLIENT_SECRET = process.env.CEVIDB_CLIENT_SECRET || '';

  // 1. Cevi.DB OAuth Login Redirect
  fastify.get<{ Querystring: { returnTo?: string } }>('/api/auth/cevidb/login', async (request, reply) => {
    if (!CEVIDB_CLIENT_ID) {
      return reply.status(503).send({
        error: 'Cevi.DB OAuth ist noch nicht konfiguriert (CEVIDB_CLIENT_ID fehlt in der Umgebung)',
      });
    }

    const host = request.headers.host || 'cevi-schichtplan.ch';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = process.env.CEVIDB_REDIRECT_URI || `${protocol}://${host}/api/auth/cevidb/callback`;

    const stateObj = {
      token: crypto.randomBytes(16).toString('hex'),
      returnTo: request.query.returnTo || (request.tenant ? `https://${request.tenant.slug}.${host}` : '/'),
      tenantSlug: request.tenant?.slug || null,
    };

    const stateEncoded = Buffer.from(JSON.stringify(stateObj)).toString('base64url');

    reply.setCookie('cevidb_oauth_state', stateEncoded, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
    });

    const authUrl = new URL(`${CEVIDB_BASE_URL}/oauth/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CEVIDB_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'email name with_roles');
    authUrl.searchParams.set('state', stateEncoded);

    return reply.redirect(authUrl.toString());
  });

  // 2. Cevi.DB OAuth Callback
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/cevidb/callback',
    async (request, reply) => {
      const { code, state, error } = request.query;

      if (error || !code) {
        return reply.status(400).send({ error: error || 'OAuth-Code fehlt' });
      }

      const host = request.headers.host || 'cevi-schichtplan.ch';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const redirectUri = process.env.CEVIDB_REDIRECT_URI || `${protocol}://${host}/api/auth/cevidb/callback`;

      let returnTo = '/';
      let tenantSlug: string | null = null;

      try {
        if (state) {
          const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
          returnTo = parsedState.returnTo || '/';
          tenantSlug = parsedState.tenantSlug || null;
        }
      } catch (err) {
        // Fallback to default
      }

      // Exchange Code for Access Token
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
        return reply.status(502).send({ error: 'Token-Abruf bei Cevi.DB fehlgeschlagen' });
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Profil aus Cevi.DB abfragen
      const profileRes = await fetch(`${CEVIDB_BASE_URL}/oauth/profile`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Scope': 'with_roles',
          Accept: 'application/json',
        },
      });

      if (!profileRes.ok) {
        fastify.log.error('Cevi.DB Profilabruf fehlgeschlagen');
        return reply.status(502).send({ error: 'Profilabruf bei Cevi.DB fehlgeschlagen' });
      }

      const profile = await profileRes.json();
      const ceviDbId = profile.id;
      const email = (profile.email || `cevidb_${ceviDbId}@cevi-schichtplan.ch`).toLowerCase();
      const firstName = profile.first_name || profile.given_name || 'Cevianer*in';
      const lastName = profile.last_name || profile.family_name || '';
      const ceviName = profile.nickname || null;

      // User in DB suchen oder anlegen
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
          },
        });
      } else {
        // Update Cevi-Name und ID falls noch nicht verknüpft
        user = await fastify.prisma.user.update({
          where: { id: user.id },
          data: {
            ceviDbId,
            ceviName: ceviName || user.ceviName,
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
          },
        });
      }

      // Falls spezifische Abteilung vorhanden, als HELPER verknüpfen falls neu
      if (tenantSlug) {
        const department = await fastify.prisma.department.findUnique({
          where: { slug: tenantSlug },
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

      // JWT erstellen und Cookie setzen
      const token = fastify.jwt.sign({
        id: user.id,
        email: user.email,
        isGlobalAdmin: user.isGlobalAdmin,
      });

      reply.clearCookie('cevidb_oauth_state', { path: '/' });
      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 Tage
      });

      return reply.redirect(returnTo);
    }
  );

  // 3. Google OAuth Login Redirect
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

  fastify.get<{ Querystring: { returnTo?: string } }>('/api/auth/google/login', async (request, reply) => {
    if (!GOOGLE_CLIENT_ID) {
      return reply.status(503).send({
        error: 'Google Login ist noch nicht konfiguriert (GOOGLE_CLIENT_ID fehlt in der Umgebung)',
      });
    }

    const host = request.headers.host || 'cevi-schichtplan.ch';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;

    const stateObj = {
      token: crypto.randomBytes(16).toString('hex'),
      returnTo: request.query.returnTo || (request.tenant ? `https://${request.tenant.slug}.${host}` : '/'),
      tenantSlug: request.tenant?.slug || null,
    };

    const stateEncoded = Buffer.from(JSON.stringify(stateObj)).toString('base64url');

    reply.setCookie('google_oauth_state', stateEncoded, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
    });

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', stateEncoded);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'select_account');

    return reply.redirect(authUrl.toString());
  });

  // 4. Google OAuth Callback
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/google/callback',
    async (request, reply) => {
      const { code, state, error } = request.query;

      if (error || !code) {
        return reply.status(400).send({ error: error || 'OAuth-Code fehlt' });
      }

      const host = request.headers.host || 'cevi-schichtplan.ch';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;

      let returnTo = '/';
      let tenantSlug: string | null = null;

      try {
        if (state) {
          const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
          returnTo = parsedState.returnTo || '/';
          tenantSlug = parsedState.tenantSlug || null;
        }
      } catch (err) {
        // Fallback
      }

      // Code gegen Tokens tauschen
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          code,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        fastify.log.error(`Google Token-Abruf fehlgeschlagen: ${errText}`);
        return reply.status(502).send({ error: 'Token-Abruf bei Google fehlgeschlagen' });
      }

      const tokenData = await tokenRes.json();

      // Benutzerprofil von Google abrufen
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json',
        },
      });

      if (!profileRes.ok) {
        return reply.status(502).send({ error: 'Profilabruf bei Google fehlgeschlagen' });
      }

      const profile = await profileRes.json();
      const googleId = profile.sub;
      const email = (profile.email || `google_${googleId}@cevi-schichtplan.ch`).toLowerCase();
      const firstName = profile.given_name || 'Helfer*in';
      const lastName = profile.family_name || '';

      // User in DB finden oder erstellen
      let user = await fastify.prisma.user.findFirst({
        where: {
          OR: [{ googleId }, { email }],
        },
      });

      if (!user) {
        user = await fastify.prisma.user.create({
          data: {
            email,
            googleId,
            firstName,
            lastName,
          },
        });
      } else {
        user = await fastify.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: googleId || user.googleId,
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
          },
        });
      }

      // Falls Subdomain aktiv, als Helfer der Abteilung eintragen
      if (tenantSlug) {
        const department = await fastify.prisma.department.findUnique({
          where: { slug: tenantSlug },
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

      const token = fastify.jwt.sign({
        id: user.id,
        email: user.email,
        isGlobalAdmin: user.isGlobalAdmin,
      });

      reply.clearCookie('google_oauth_state', { path: '/' });
      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });

      return reply.redirect(returnTo);
    }
  );

  // 5. Normales Login mit Passwort
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
      email: user.email,
      isGlobalAdmin: user.isGlobalAdmin,
    });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ceviName: user.ceviName,
        phone: user.phone,
        isGlobalAdmin: user.isGlobalAdmin,
      },
    };
  });

  // 4. Helfer registrieren
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

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ceviName: user.ceviName,
        phone: user.phone,
        isGlobalAdmin: false,
      },
    };
  });

  // 5. Profil des aktuellen Users abfragen
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
        isGlobalAdmin: user.isGlobalAdmin,
        departmentRole: currentMembership ? currentMembership.role : null,
      };
    }
  );

  // 6. Logout
  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { ok: true };
  });
};

export default authRoutes;
