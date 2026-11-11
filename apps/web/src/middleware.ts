import { NextResponse, type NextRequest } from 'next/server';
import { getOrganizationTypeFromHost } from '@schichtplan/shared';

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
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const hostParts = host.split('.');
  const isLocalhost = host.endsWith('.localhost') || host === 'localhost';
  const slug =
    hostParts.length >= 2 && isLocalhost && host !== 'localhost'
      ? hostParts[0]
      : (process.env.DEV_TENANT_SLUG ?? 'demo');
  headers.set('x-tenant-slug', slug);
  // Verband für lokale Tests umschaltbar (cevi, pfadi, jubla, verein), sonst aus Host erkannt
  const detectedOrg = getOrganizationTypeFromHost(host);
  headers.set('x-tenant-org', process.env.DEV_TENANT_ORG ?? detectedOrg.toLowerCase());

  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = {
  matcher: '/api/:path*',
};
