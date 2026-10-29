import { readFileSync } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'llms.txt');
  const content = readFileSync(filePath, 'utf8');

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
