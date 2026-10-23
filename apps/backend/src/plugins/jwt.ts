import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import {
  adminRequestProblem,
  adminSecurityConfig,
  adminSessionProblem,
  type LoginMethodClaim,
} from '../services/adminSecurity.js';
import { createRateLimiter } from '../services/rateLimit.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Von requireGlobalAdmin gesetzt: Anmeldeart und bis wann die Admin-Sitzung gilt */
    adminSession?: { loginMethod: string | null; issuedAt: Date; expiresAt: Date };
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * Eingeloggt und in der Datenbank als globaler Admin geführt (nicht nur laut Token). Zusätzlich:
     * nur auf admin./login., nur von derselben Seite, Anmeldung frisch (und in Produktion über Cevi.DB),
     * Änderungen gebremst. Siehe services/adminSecurity.ts.
     */
    requireGlobalAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      isGlobalAdmin: boolean;
      /** Anmeldeart, für die Admin-Schnittstelle (ältere Tokens haben keine) */
      amr?: LoginMethodClaim;
    };
    user: {
      id: string;
      email: string;
      isGlobalAdmin: boolean;
    };
  }
}

/**
 * Name des Login-Cookies. Dev braucht einen eigenen Namen: das Prod-Cookie gilt für
 * `.cevi-schichtplan.ch` und wird auch an `*.dev.cevi-schichtplan.ch` gesendet. Mit gleichem Namen
 * las das Dev-Backend das (ältere) Prod-Cookie, lehnte es ab (andere JWT_SECRET) und schickte
 * zurück aufs Login: Endlosschleife.
 */
export const AUTH_COOKIE_NAME = process.env.COOKIE_NAME || 'token';

/** Gültigkeit des Tokens, passend zum Cookie (30 Tage) */
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

const DEV_JWT_SECRET = 'super-secret-development-key-min-32-chars';

/** In Produktion muss ein eigenes, langes Secret gesetzt sein; sonst liesse sich jedes Token fälschen. */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32 || secret === DEV_JWT_SECRET) {
      throw new Error('JWT_SECRET fehlt, ist kürzer als 32 Zeichen oder ist das Entwicklungs-Secret');
    }
    return secret;
  }
  return secret || DEV_JWT_SECRET;
}

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  const secret = resolveJwtSecret();

  await fastify.register(fastifyCookie);

  await fastify.register(fastifyJwt, {
    secret,
    sign: { expiresIn: AUTH_TOKEN_TTL_SECONDS },
    cookie: {
      cookieName: AUTH_COOKIE_NAME,
      signed: false,
    },
  });

  /**
   * Token prüfen und die Person frisch aus der DB laden: Ein Token gilt bis zu 30 Tage. Gelöschte
   * Konten sollen sofort draussen sein, und `isGlobalAdmin` gilt nur, solange es in der DB steht.
   */
  /** iat und amr des geprüften Tokens (request.user wird danach durch die DB-Werte ersetzt) */
  const tokenClaims = new WeakMap<FastifyRequest, { iat?: number; amr?: string }>();

  async function verifyAndLoad(request: FastifyRequest): Promise<boolean> {
    try {
      await request.jwtVerify();
    } catch {
      return false;
    }
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, email: true, isGlobalAdmin: true, passwordChangedAt: true },
    });
    if (!user) return false;
    // Nach einem neuen Passwort gelten ältere Tokens nicht mehr (iat ist in Sekunden)
    const issuedAt = (request.user as { iat?: number }).iat;
    tokenClaims.set(request, { iat: issuedAt, amr: (request.user as { amr?: string }).amr });
    if (user.passwordChangedAt && issuedAt !== undefined && (issuedAt + 1) * 1000 <= user.passwordChangedAt.getTime()) {
      return false;
    }
    request.user = {
      id: user.id,
      email: user.email || request.user.email,
      isGlobalAdmin: user.isGlobalAdmin,
    };
    return true;
  }

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await verifyAndLoad(request))) {
      return reply.status(401).send({ error: 'Nicht autorisiert' });
    }
  });

  const adminConfig = adminSecurityConfig();
  // Änderungen pro Admin: 60 in 10 Minuten (normale Arbeit kommt nie hin, ein Skript schon)
  const adminWriteLimiter = createRateLimiter(10 * 60 * 1000, 60);

  fastify.decorate('requireGlobalAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = (name: string) => {
      const value = request.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    const requestProblem = adminRequestProblem(
      { host: request.host, origin: header('origin'), secFetchSite: header('sec-fetch-site') },
      adminConfig
    );
    if (requestProblem) {
      request.log.warn(
        { problem: requestProblem, host: request.host, origin: header('origin'), url: request.url },
        'Admin-Schnittstelle: Anfrage von fremder Seite abgelehnt'
      );
      return reply.status(403).send({ error: 'Kein Zugriff von dieser Seite', code: 'ADMIN_ORIGIN' });
    }

    if (!(await verifyAndLoad(request))) {
      return reply.status(401).send({ error: 'Nicht autorisiert' });
    }
    if (!request.user.isGlobalAdmin) {
      return reply.status(403).send({ error: 'Kein Zugriff' });
    }

    const sessionProblem = adminSessionProblem(tokenClaims.get(request) ?? {}, adminConfig);
    if (sessionProblem === 'NOT_CEVIDB') {
      return reply.status(401).send({
        error: 'Für den Admin-Bereich bitte mit Cevi.DB anmelden.',
        code: 'REAUTH_CEVIDB',
      });
    }
    if (sessionProblem === 'STALE') {
      return reply.status(401).send({
        error: 'Deine Anmeldung ist zu alt für den Admin-Bereich. Bitte melde dich neu an.',
        code: 'REAUTH_REQUIRED',
      });
    }
    const claims = tokenClaims.get(request) ?? {};
    const issuedAt = new Date((claims.iat ?? 0) * 1000);
    request.adminSession = {
      loginMethod: claims.amr ?? null,
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + adminConfig.maxSessionAgeSeconds * 1000),
    };

    if (request.method !== 'GET' && request.method !== 'HEAD' && adminWriteLimiter.hit(request.user.id)) {
      request.log.warn({ adminId: request.user.id, url: request.url }, 'Admin-Schnittstelle: Versuchsbremse');
      return reply.status(429).send({ error: 'Zu viele Änderungen in kurzer Zeit. Bitte warte ein paar Minuten.' });
    }
  });

  fastify.decorate('optionalAuthenticate', async (request: FastifyRequest) => {
    // Ohne gültiges Token (oder mit Token eines gelöschten Kontos) gilt die Anfrage als anonym
    if (!(await verifyAndLoad(request))) {
      (request as { user?: unknown }).user = undefined;
    }
  });
};

export default fp(jwtPlugin);
