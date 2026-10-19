import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { headers } from 'next/headers';

/**
 * Bausteine für Link-Vorschau-Bilder (Open Graph, 1200×630) mit `next/og`.
 * Nur auf dem Server verwenden (liest das Logo aus `public/`), darum eigener Export `@schichtplan/ui/og`.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

const DEFAULT_ACCENT = '#e11d48';

/**
 * Öffentlicher Ursprung der aktuellen Anfrage (hinter Traefik: x-forwarded-*), z. B. «https://illnau.cevi-schichtplan.ch».
 * Nötig für `metadataBase`, denn Link-Vorschauen brauchen absolute Bild-URLs. Lokal bleibt es bei http.
 */
export async function getRequestOrigin(): Promise<{ origin: string; host: string }> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'cevi-schichtplan.ch').split(',')[0].trim();
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) || host.split(':')[0].endsWith('.localhost');
  const proto = isLocal ? 'http' : 'https';
  return { origin: `${proto}://${host}`, host };
}

/** Cevi-Logo aus dem `public/`-Ordner der laufenden App als Data-URI (null, falls nicht lesbar). */
export async function loadCeviLogo(): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), 'public', 'images', 'cevi-logo.png'));
    return `data:image/png;base64,${file.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Fremdes Logo (z. B. Abteilungswappen) laden. Satori kann nur PNG, JPEG und SVG,
 * alles andere sowie Fehler/Timeouts ergeben null (dann greift das Cevi-Logo).
 */
export async function loadRemoteLogo(url: string | null | undefined, base: string): Promise<string | null> {
  if (!url) return null;
  try {
    const target = new URL(url, base);
    if (!['http:', 'https:', 'data:'].includes(target.protocol)) return null;
    const res = await fetch(target, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 1_500_000) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Akzentfarbe nur akzeptieren, wenn sie ein Hex-Wert ist (kommt aus der DB, geht in CSS). */
export function safeAccent(color: string | null | undefined): string {
  return color && /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : DEFAULT_ACCENT;
}

export interface OgCardProps {
  title: string;
  subtitle: string;
  /** Anzeige unten links, z. B. «illnau.cevi-schichtplan.ch» */
  host: string;
  logo: string | null;
  accent?: string;
  /** Kleine Zeile über dem Titel */
  eyebrow?: string;
}

/** Layout der Vorschaukarte. Satori versteht nur Inline-Styles mit Flexbox. */
export function OgCard({ title, subtitle, host, logo, accent = DEFAULT_ACCENT, eyebrow }: OgCardProps) {
  const titleSize = title.length > 28 ? 76 : 96;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        color: '#fafafa',
        backgroundColor: '#0e0e11',
        backgroundImage: `radial-gradient(circle at 92% 8%, ${accent}66 0%, transparent 55%), radial-gradient(circle at 0% 100%, ${accent}33 0%, transparent 50%)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- Satori rendert <img>, kein next/image
          <img src={logo} width={112} height={112} style={{ borderRadius: 24, objectFit: 'contain' }} alt="" />
        ) : null}
        <div style={{ display: 'flex', fontSize: 34, color: '#a1a1aa', letterSpacing: 1 }}>
          {eyebrow ?? 'Cevi Schichtplan'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 1.05, fontWeight: 700, letterSpacing: -2 }}>
          {title}
        </div>
        <div style={{ display: 'flex', fontSize: 40, lineHeight: 1.3, color: '#d4d4d8', maxWidth: 980 }}>
          {subtitle}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', fontSize: 32, color: '#a1a1aa' }}>{host}</div>
        <div style={{ display: 'flex', width: 160, height: 10, borderRadius: 5, backgroundColor: accent }} />
      </div>
    </div>
  );
}
