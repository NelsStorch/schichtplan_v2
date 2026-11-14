import { eventOgResponse } from '@/lib/ogRender';

/**
 * Vorschaubild eines Anlasses, mit `?schicht=ID` einer Schicht, mit `&ersatz=1` als «Ersatz gesucht»
 * (siehe lib/ogRender.tsx). Entwürfe und interne Anlässe von Abteilungen «nur für Mitglieder» bekommen 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const query = new URL(request.url).searchParams;
  const res = await eventOgResponse(slug, query.get('schicht'), query.get('ersatz') === '1');
  return res ?? new Response('Nicht gefunden', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
