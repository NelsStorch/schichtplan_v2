import { NextResponse, type NextRequest } from 'next/server';

/**
 * Nur lokale Entwicklung: leitet /api/* an das Backend weiter (in Produktion
 * erledigt das Traefik, Requests auf /api erreichen Next.js dort gar nicht).
 *
 * Mandant: `demo.localhost:3000` -> Slug "demo", sonst DEV_TENANT_SLUG (Default "demo", aus dem Seed).
 */
export function middleware(request: NextRequest) {
  const backend = process.env.INTERNAL_API_URL;
  if (process.env.NODE_ENV !== 'development' || !backend) return NextResponse.next();

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, backend);
  const headers = new Headers(request.headers);
  const hostParts = (request.headers.get('host') ?? '').split(':')[0].split('.');
  const slug =
    hostParts.length === 2 && hostParts[1] === 'localhost'
      ? hostParts[0]
      : (process.env.DEV_TENANT_SLUG ?? 'demo');
  headers.set('x-tenant-slug', slug);
  // Verband für lokale Tests umschaltbar (cevi, pfadi, jubla, verein), Vorgabe Cevi
  headers.set('x-tenant-org', process.env.DEV_TENANT_ORG ?? 'cevi');

  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = {
  matcher: '/api/:path*',
};
