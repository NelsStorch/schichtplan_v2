import { NextResponse } from 'next/server';
import { getOrganization } from '@schichtplan/shared';
import { getRequestOrigin } from '@schichtplan/ui/og';
import { buildLlmsTxt } from '@/lib/llms';

/** Je nach Verbandsdomain (cevi-, pfadi-, jubla-, vereins-schichtplan.ch) ein eigener Inhalt */
export async function GET() {
  const { origin, host } = await getRequestOrigin();
  const content = buildLlmsTxt(getOrganization(host), origin, host);

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      Vary: 'Host, X-Forwarded-Host',
    },
  });
}
