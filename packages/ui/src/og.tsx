import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { headers } from 'next/headers';
import { ORGANIZATION_DOMAINS, getOrganization } from '@schichtplan/shared';

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
  const host = trustedHost(h.get('x-forwarded-host') ?? h.get('host'));
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) || host.split(':')[0].endsWith('.localhost');
  const proto = isLocal ? 'http' : 'https';
  return { origin: `${proto}://${host}`, host };
}

const SUPPORTED_ROOT_DOMAINS = ORGANIZATION_DOMAINS;

/**
 * Host aus der Anfrage, aber nur die eigene Domain (DOMAIN, Standard cevi-schichtplan.ch, samt Subdomains
 * und weiteren Verbandsdomains) oder lokal localhost. Sonst die Hauptdomain: Mit dem Ursprung lädt der
 * Server Logos nach, und er landet als absolute URL in der Link-Vorschau.
 */
export function trustedHost(value: string | null | undefined, rootDomain = process.env.DOMAIN || 'cevi-schichtplan.ch'): string {
  const root = rootDomain.replace(/^\./, '').toLowerCase();
  const host = (value ?? '').split(',')[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(host) && !/^\[::1\](:\d+)?$/.test(host)) return root;
  const hostname = host.replace(/:\d+$/, '');
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost');
  const isKnownRoot = SUPPORTED_ROOT_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  const isOwn = hostname === root || hostname.endsWith(`.${root}`) || isKnownRoot;
  return isLocal || isOwn ? host : root;
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

/** Verbandslogo (Cevi, Pfadi, Jubla oder Verein) passend zum Host laden */
export async function loadBrandLogo(host?: string): Promise<string | null> {
  const org = getOrganization(host);
  try {
    const filename = org.slug === 'pfadi' ? 'pfadi-schichtplan-logo.svg' : org.slug === 'jubla' ? 'jubla-logo.svg' : org.slug === 'verein' ? 'verein-logo.svg' : 'cevi-logo.png';
    const filePath = path.join(process.cwd(), 'public', 'images', filename);
    const file = await readFile(filePath);
    const mime = filename.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    return `data:${mime};base64,${file.toString('base64')}`;
  } catch {
    return loadCeviLogo();
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

const OG_CACHE_MAX_ENTRIES = 100;
const ogCache = new Map<string, { expires: number; png: Promise<ArrayBuffer> }>();

/**
 * Fertig gerenderte Vorschaubilder im Speicher halten. Das Rendern dauert fast eine Sekunde, und WhatsApp
 * schickt die Nachricht ohne Vorschau, wenn man vorher absendet. Gleichzeitige Abrufe teilen sich ein Rendering.
 * Begrenzt auf wenige Einträge, weil der Schlüssel (Host) bei Wildcard-Subdomains von aussen kommt.
 */
export async function cachedOgImage(
  key: string,
  ttlMs: number,
  render: () => Promise<Response>
): Promise<Response> {
  const now = Date.now();
  let entry = ogCache.get(key);
  if (!entry || entry.expires < now) {
    const png = render().then((res) => {
      if (!res.ok) throw new Error(`OG-Bild: HTTP ${res.status}`);
      return res.arrayBuffer();
    });
    entry = { expires: now + ttlMs, png };
    ogCache.delete(key);
    ogCache.set(key, entry);
    while (ogCache.size > OG_CACHE_MAX_ENTRIES) ogCache.delete(ogCache.keys().next().value!);
    // Fehlgeschlagene Renderings nicht behalten
    png.catch(() => ogCache.get(key) === entry && ogCache.delete(key));
  }
  return new Response(await entry.png, {
    headers: { 'Content-Type': OG_CONTENT_TYPE, 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}

/** Akzentfarbe nur akzeptieren, wenn sie ein Hex-Wert ist (kommt aus der DB, geht in CSS). */
export function safeAccent(color: string | null | undefined): string {
  return color && /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : DEFAULT_ACCENT;
}

/**
 * Version des Kartenlayouts. Hochzählen, wenn sich das Aussehen ändert: Die Bild-URL bekommt dadurch einen
 * neuen `?v=`, und WhatsApp, Signal & Co. holen das Bild neu statt ihre zwischengespeicherte Version zu zeigen.
 */
export const OG_DESIGN_VERSION = 2;

/**
 * Kurzer Fingerabdruck für `?v=` an der Bild-URL: ändert sich mit dem Layout und mit allem, was im Bild steht
 * (Name, Logo, Farbe, …). So zeigen Messenger nach einer Änderung das neue Bild.
 */
export function ogVersion(...parts: Array<string | number | null | undefined>): string {
  return createHash('sha1')
    .update([OG_DESIGN_VERSION, ...parts].map((p) => p ?? '').join('\u0000'))
    .digest('hex')
    .slice(0, 10);
}

/** Bild-Eintrag für `openGraph.images` / `twitter.images` mit Grösse, Typ und Versions-Parameter. */
export function ogImage(url: string, alt: string, ...versionParts: Array<string | number | null | undefined>) {
  const target = new URL(url);
  target.searchParams.set('v', ogVersion(...versionParts));
  return { url: target.toString(), ...OG_SIZE, type: OG_CONTENT_TYPE, alt };
}

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: 'normal' };
let fontsPromise: Promise<OgFont[]> | null = null;

/**
 * Geist (wie in der App) für die Vorschaubilder, sonst fehlt Satori der fette Schnitt. Liegt unter
 * `public/fonts/og` (Landing, Login) oder `public/fonts/pdf` (Web, dort auch für PDFs). Fehlt die Datei,
 * zeichnet Satori mit seiner eingebauten Schrift.
 */
export function loadOgFonts(): Promise<OgFont[]> {
  fontsPromise ??= (async () => {
    const fonts: OgFont[] = [];
    const weights = [
      [400, 'Geist-Regular.ttf'],
      [600, 'Geist-SemiBold.ttf'],
      [700, 'Geist-Bold.ttf'],
    ] as const;
    for (const [weight, file] of weights) {
      for (const dir of ['og', 'pdf']) {
        try {
          const buf = await readFile(path.join(process.cwd(), 'public', 'fonts', dir, file));
          fonts.push({ name: 'Geist', data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: 'normal' });
          break;
        } catch {
          // nächsten Ordner versuchen
        }
      }
    }
    return fonts;
  })();
  return fontsPromise;
}

/** Optionen für `new ImageResponse(...)`: Grösse und Schriften */
export async function ogImageOptions() {
  const fonts = await loadOgFonts();
  return { ...OG_SIZE, ...(fonts.length ? { fonts } : {}) };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Farbe `t` (0–1) Richtung `target` mischen, Ergebnis als Hex */
export function mixColor(hex: string, target: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return `#${a
    .map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Relative Helligkeit nach WCAG (0 = schwarz, 1 = weiss) */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Hintergrund und Schriftfarbe der Karte aus der Akzentfarbe; helle Farben (z. B. Gelb) bekommen dunkle Schrift */
export function ogPalette(accent: string) {
  const from = mixColor(accent, '#000000', 0.05);
  const to = mixColor(accent, '#000000', 0.5);
  const mid = mixColor(accent, '#000000', 0.25);
  const dark = luminance(mid) > 0.3;
  return {
    from,
    to,
    text: dark ? '#18181b' : '#ffffff',
    muted: dark ? 'rgba(24,24,27,0.72)' : 'rgba(255,255,255,0.82)',
    soft: dark ? 'rgba(24,24,27,0.10)' : 'rgba(255,255,255,0.13)',
    pill: dark ? 'rgba(24,24,27,0.88)' : 'rgba(255,255,255,0.95)',
    pillText: dark ? '#ffffff' : mixColor(accent, '#000000', 0.35),
  };
}

/** Schriftgrösse des Titels: kurz und gross, lange Namen kleiner. Massgeblich ist auch das längste Wort. */
export function ogTitleSize(title: string, maxWidth = 600): number {
  const longestWord = Math.max(...title.split(/[\s-]+/).map((w) => w.length), 1);
  const byWord = Math.floor(maxWidth / (longestWord * 0.58));
  const byLength = title.length > 40 ? 56 : title.length > 26 ? 62 : title.length > 14 ? 72 : 88;
  return Math.max(44, Math.min(byLength, byWord));
}

export interface OgCardProps {
  title: string;
  subtitle: string;
  /** Anzeige unten, z. B. «illnau.cevi-schichtplan.ch» */
  host: string;
  logo: string | null;
  accent?: string;
  /** Absender unten, z. B. «Jubla Schichtplan» */
  eyebrow?: string;
  /** Hervorgehobene Zusatzangabe, z. B. «Noch 12 Plätze frei» */
  badge?: string | null;
}

/** Dekorative «Schicht-Balken» links und rechts: füllen die Breite, liegen ausserhalb des quadratischen Ausschnitts. */
const SHIFT_BARS: Array<{ x: number; y: number; w: number }> = [
  { x: 48, y: 70, w: 150 },
  { x: 96, y: 140, w: 110 },
  { x: 32, y: 210, w: 180 },
  { x: 120, y: 350, w: 120 },
  { x: 56, y: 420, w: 160 },
  { x: 88, y: 490, w: 100 },
];

/**
 * Layout der Vorschaukarte (1200×630). Alles Wichtige steht mittig in einem quadratischen Bereich, denn
 * WhatsApp zeigt das Bild oft nur als kleines Quadrat aus der Mitte. Satori versteht nur Inline-Styles mit Flexbox.
 */
export function OgCard({ title, subtitle, host, logo, accent = DEFAULT_ACCENT, eyebrow, badge }: OgCardProps) {
  const color = safeAccent(accent);
  const p = ogPalette(color);
  const titleSize = ogTitleSize(title);
  const disc = badge ? 132 : 156;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        fontFamily: 'Geist',
        color: p.text,
        backgroundColor: p.to,
        backgroundImage: `radial-gradient(circle at 50% 0%, rgba(255,255,255,0.22) 0%, transparent 55%), linear-gradient(150deg, ${p.from} 0%, ${p.to} 100%)`,
      }}
    >
      {SHIFT_BARS.flatMap((b) => [
        <div
          key={`l${b.x}-${b.y}`}
          style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: 44, borderRadius: 14, backgroundColor: p.soft }}
        />,
        <div
          key={`r${b.x}-${b.y}`}
          style={{ position: 'absolute', right: b.x, top: 560 - b.y, width: b.w, height: 44, borderRadius: 14, backgroundColor: p.soft }}
        />,
      ])}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexGrow: 1,
          width: 620,
          paddingTop: 28,
          paddingBottom: 8,
          gap: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            backgroundColor: '#ffffff',
            boxShadow: '0 14px 40px rgba(0,0,0,0.28)',
            marginBottom: 6,
          }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- Satori rendert <img>, kein next/image
            <img src={logo} width={disc * 0.72} height={disc * 0.72} style={{ objectFit: 'contain' }} alt="" />
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            textAlign: 'center',
            textWrap: 'balance',
            width: '100%',
            fontSize: titleSize,
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: -1.5,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            textAlign: 'center',
            width: '100%',
            fontSize: 32,
            lineHeight: 1.25,
            fontWeight: 600,
            color: p.muted,
          }}
        >
          {subtitle}
        </div>
        {badge ? (
          <div
            style={{
              display: 'flex',
              marginTop: 4,
              padding: '10px 26px',
              borderRadius: 999,
              fontSize: 28,
              fontWeight: 700,
              backgroundColor: p.pill,
              color: p.pillText,
            }}
          >
            {badge}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          paddingBottom: 30,
          fontSize: 24,
          color: p.muted,
        }}
      >
        <div style={{ display: 'flex', fontWeight: 700, color: p.text }}>{eyebrow ?? 'Cevi Schichtplan'}</div>
        <div style={{ display: 'flex' }}>·</div>
        <div style={{ display: 'flex' }}>{host}</div>
      </div>
    </div>
  );
}

export interface OgIconProps {
  logo: string | null;
  accent?: string;
  /** Kantenlänge in Pixeln */
  size: number;
}

/**
 * Quadratisches App-Icon (z. B. apple-touch-icon): Logo auf Weiss. iOS rundet die Ecken selbst ab
 * und kann kein SVG, darum als PNG.
 */
export function OgIcon({ logo, accent = DEFAULT_ACCENT, size }: OgIconProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
      }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- Satori rendert <img>, kein next/image
        <img src={logo} width={size * 0.78} height={size * 0.78} style={{ objectFit: 'contain' }} alt="" />
      ) : (
        <div style={{ display: 'flex', width: size * 0.5, height: size * 0.5, borderRadius: size * 0.12, backgroundColor: safeAccent(accent) }} />
      )}
    </div>
  );
}
