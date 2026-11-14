import { eventStoryResponse } from '@/lib/ogRender';

/**
 * Hochformat-Bild (1080×1920) für Instagram-Story und WhatsApp-Status mit QR-Code zum Anlass.
 * Gleiche Sichtbarkeit wie die Link-Vorschau; `?download=1` speichert es als Datei.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await eventStoryResponse(slug);
  if (!res) return new Response('Nicht gefunden', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (new URL(request.url).searchParams.get('download') === '1') {
    const safe = slug.replace(/[^a-z0-9-]/gi, '') || 'anlass';
    res.headers.set('Content-Disposition', `attachment; filename="${safe}-story.png"`);
  }
  return res;
}
