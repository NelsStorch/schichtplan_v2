import { NextResponse, type NextRequest } from 'next/server';

/**
 * Nur lokale Entwicklung: leitet /api/* an das Backend weiter (in Produktion
 * erledigt das Traefik, Requests auf /api erreichen Next.js dort gar nicht).
 * Das Login-Portal hat keinen Mandanten, darum ohne x-tenant-slug.
 */
export function middleware(request: NextRequest) {
  const backend = process.env.INTERNAL_API_URL;
  if (process.env.NODE_ENV !== 'development' || !backend) return NextResponse.next();

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, backend);
  // Verband für lokale Tests umschaltbar (cevi, pfadi, jubla, verein), Vorgabe Cevi
  const headers = new Headers(request.headers);
  headers.set('x-tenant-org', process.env.DEV_TENANT_ORG ?? 'cevi');
  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = {
  matcher: '/api/:path*',
};
