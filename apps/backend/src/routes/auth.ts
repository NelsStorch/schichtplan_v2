import { FastifyPluginAsync, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { LoginSchema, RegisterHelperSchema, CeviNameQuickLoginSchema } from '@schichtplan/shared';

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
      if (!CEVIDB_CLIENT_ID) {
        return reply.status(503).send({
          error: 'Cevi.DB OAuth ist noch nicht konfiguriert (CEVIDB_CLIENT_ID fehlt in der Umgebung)',
        });
      }

      const host = request.headers.host || 'cevi-schichtplan.ch';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const redirectUri =
        process.env.CEVIDB_REDIRECT_URI || `${protocol}://${host}/api/auth/cevidb/callback`;

      const stateObj = {
        token: crypto.randomBytes(16).toString('hex'),
        returnTo:
          request.query.returnTo ||
          (request.tenant ? `${protocol}://${request.tenant.slug}.${host}` : '/'),
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

      if (error || !code) {
        return reply.status(400).send({ error: error || 'OAuth-Code fehlt' });
      }

      const host = request.headers.host || 'cevi-schichtplan.ch';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const redirectUri =
        process.env.CEVIDB_REDIRECT_URI || `${protocol}://${host}/api/auth/cevidb/callback`;

      let returnTo = '/';
      let tenantSlug: string | null = null;

      try {
        if (state) {
          const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
          returnTo = parsedState.returnTo || '/';
          tenantSlug = parsedState.tenantSlug || null;
        }
      } catch (err) {
        // Fallback default
      }

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
        return reply.status(502).send({ error: 'Token-Abruf bei Cevi.DB fehlgeschlagen' });
      }

      const tokenData = (await tokenRes.json()) as { access_token: string };
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
        return reply.status(502).send({ error: 'Profilabruf bei Cevi.DB fehlgeschlagen' });
      }

      const profile = (await profileRes.json()) as any;
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
      redirectUrl: returnTo || '/',
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
