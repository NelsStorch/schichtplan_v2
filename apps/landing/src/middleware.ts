import { NextResponse, type NextRequest } from 'next/server';

/**
 * Nur lokale Entwicklung: leitet /api/* an das Backend weiter (in Produktion
 * erledigt das Traefik, Requests auf /api erreichen Next.js dort gar nicht).
 * Die Landingpage hat keinen Mandanten, darum ohne x-tenant-slug.
 */
export function middleware(request: NextRequest) {
  const backend = process.env.INTERNAL_API_URL;
  if (process.env.NODE_ENV !== 'development' || !backend) return NextResponse.next();

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, backend);
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: '/api/:path*',
};
