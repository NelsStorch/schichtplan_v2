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

const MAX_IMAGE_BYTES = 1_500_000;

/**
 * Prüft, ob ein Hostname auf eine lokale, private oder interne Netzwerk-Adresse zeigt (SSRF-Schutz).
 */
export function isPrivateOrInternalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    !host.includes('.')
  ) {
    return true;
  }
  if (host.includes(':')) {
    return (
      host === '::1' ||
      host === '::' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80') ||
      host.startsWith('::ffff:127.') ||
      host.startsWith('::ffff:10.') ||
      host.startsWith('::ffff:192.168.') ||
      host.startsWith('::ffff:169.254.')
    );
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true;
    }
  }
  return false;
}

async function readBoundedBytes(res: Response, maxBytes: number): Promise<Buffer | null> {
  const contentLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length <= maxBytes ? buf : null;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

/**
 * Fremdes Logo (z. B. Abteilungswappen) laden. Satori kann nur PNG, JPEG und SVG,
 * alles andere sowie Fehler/Timeouts ergeben null (dann greift das Cevi-Logo).
 */
export async function loadRemoteLogo(url: string | null | undefined, base: string): Promise<string | null> {
  if (!url) return null;
  try {
    const isInternalUpload = /^\/api\/uploads\/[0-9a-f-]+$/i.test(url);
    const effectiveBase = isInternalUpload && process.env.INTERNAL_API_URL ? process.env.INTERNAL_API_URL : base;
    const target = new URL(url, effectiveBase);
    if (target.protocol === 'data:') {
      return /^data:image\/(png|jpeg|svg\+xml);base64,/i.test(url) && url.length <= MAX_IMAGE_BYTES * 1.4
        ? url
        : null;
    }
    if (!['http:', 'https:'].includes(target.protocol)) return null;
    if (!isInternalUpload && isPrivateOrInternalHost(target.hostname)) return null;
    const res = await fetch(target, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(type)) return null;
    const bytes = await readBoundedBytes(res, MAX_IMAGE_BYTES);
    if (!bytes) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Bild für die Vorschau laden: eigene Dateien (`/images/...`, z. B. Banner-Vorlagen) direkt aus `public/`,
 * alles andere wie Logos über die Adresse. null, wenn es fehlt oder Satori das Format nicht kann.
 */
export async function loadImage(url: string | null | undefined, base: string): Promise<string | null> {
  if (!url) return null;
  if (/^\/images\/[a-z0-9/_-]+\.(svg|png|jpe?g)$/i.test(url) && !url.includes('..')) {
    try {
      const file = await readFile(path.join(process.cwd(), 'public', ...url.slice(1).split('/')));
      const ext = url.split('.').pop()!.toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${file.toString('base64')}`;
    } catch {
      // weiter über die Adresse
    }
  }
  return loadRemoteLogo(url, base);
}

const OG_CACHE_MAX_ENTRIES = 100;
const ogCache = new Map<string, { expires: number; png: Promise<ArrayBuffer> }>();

/**
 * Fertig gerenderte Vorschaubilder im Speicher halten. Das Rendern dauert fast eine Sekunde, und WhatsApp
 * schickt die Nachricht ohne Vorschau, wenn man vorher absendet. Gleichzeitige Abrufe teilen sich ein Rendering.
 * Begrenzt auf wenige Einträge, weil der Schlüssel (Host) bei Wildcard-Subdomains von aussen kommt:
 * 100 Bilder à 150–250 KB sind höchstens rund 25 MB Arbeitsspeicher, auf der Festplatte landet nichts.
 * Enthält der Schlüssel einen Fingerabdruck des Inhalts (ogVersion), gilt nach jeder Änderung sofort ein neues Bild.
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

/** «Sa 22.08. · 18:00–22:00 · Chilbi»: kein Zeilenumbruch vor dem Punkt, sonst beginnt eine Zeile mit «·» */
function keepSeparators(text: string): string {
  return text.replace(/ · /g, ' · ');
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
  /** Hintergrundbild (Data-URI), z. B. das Banner des Anlasses; wird abgedunkelt, Schrift dann weiss */
  background?: string | null;
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
export function OgCard({ title, subtitle, host, logo, accent = DEFAULT_ACCENT, eyebrow, badge, background }: OgCardProps) {
  const color = safeAccent(accent);
  // Auf einem abgedunkelten Foto immer weisse Schrift, die Plakette in der Akzentfarbe
  const p = background
    ? { ...ogPalette('#3f3f46'), pill: '#ffffff', pillText: mixColor(color, '#000000', luminance(color) > 0.3 ? 0.55 : 0.1) }
    : ogPalette(color);
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
      {background ? (
        // eslint-disable-next-line @next/next/no-img-element -- Satori rendert <img>, kein next/image
        <img
          src={background}
          width={OG_SIZE.width}
          height={OG_SIZE.height}
          style={{ position: 'absolute', left: 0, top: 0, width: OG_SIZE.width, height: OG_SIZE.height, objectFit: 'cover' }}
          alt=""
        />
      ) : null}
      {background ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: OG_SIZE.width,
            height: OG_SIZE.height,
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.82) 100%), linear-gradient(150deg, ${color}55 0%, transparent 60%)`,
          }}
        />
      ) : null}
      {(background ? [] : SHIFT_BARS).flatMap((b) => [
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
            textWrap: 'balance',
            width: '100%',
            fontSize: 32,
            lineHeight: 1.25,
            fontWeight: 600,
            color: p.muted,
          }}
        >
          {keepSeparators(subtitle)}
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
  /** Anteil der Kante, den das Logo einnimmt. Für «maskable»-Icons (Android schneidet rund zu) kleiner wählen. */
  inset?: number;
  /** Ohne weissen Hintergrund (Favicon im Browser-Tab, Badge bei Push-Mitteilungen) */
  transparent?: boolean;
}

/**
 * Quadratisches App-Icon (z. B. apple-touch-icon): Logo auf Weiss. iOS rundet die Ecken selbst ab
 * und kann kein SVG, darum als PNG.
 */
export function OgIcon({ logo, accent = DEFAULT_ACCENT, size, inset = 0.78, transparent = false }: OgIconProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: transparent ? 'transparent' : '#ffffff',
      }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- Satori rendert <img>, kein next/image
        <img src={logo} width={Math.round(size * inset)} height={Math.round(size * inset)} style={{ objectFit: 'contain' }} alt="" />
      ) : (
        <div style={{ display: 'flex', width: size * 0.5, height: size * 0.5, borderRadius: size * 0.12, backgroundColor: safeAccent(accent) }} />
      )}
    </div>
  );
}

export const STORY_SIZE = { width: 1080, height: 1920 } as const;

export interface OgStoryProps {
  title: string;
  /** z. B. Datum des Anlasses */
  subtitle: string;
  logo: string | null;
  accent?: string;
  /** Banner des Anlasses (Data-URI), abgedunkelt im Hintergrund */
  background?: string | null;
  badge?: string | null;
  /** QR-Code als Data-URI (SVG) */
  qr: string;
  /** Logo, das mittig über den QR-Code gelegt wird (dessen Plakette ist dann leer) */
  qrLogo?: string | null;
  /** Kurze Adresse unter dem QR-Code */
  host: string;
  /** Absender über dem Titel, z. B. Abteilungsname */
  eyebrow: string;
}

/**
 * Hochformat-Bild (1080×1920) für Instagram-Story und WhatsApp-Status. Oben und unten bleibt Platz für die
 * Bedienelemente der Apps, der QR-Code führt zum Anlass (in Stories lassen sich Links nicht antippen).
 */
export function OgStory({ title, subtitle, logo, accent = DEFAULT_ACCENT, background, badge, qr, qrLogo, host, eyebrow }: OgStoryProps) {
  const color = safeAccent(accent);
  const p = background
    ? { ...ogPalette('#3f3f46'), pill: '#ffffff', pillText: mixColor(color, '#000000', luminance(color) > 0.3 ? 0.55 : 0.1) }
    : ogPalette(color);
  const titleSize = Math.round(Math.min(124, ogTitleSize(title, 880) * 1.45));
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
        backgroundImage: `radial-gradient(circle at 50% 0%, rgba(255,255,255,0.22) 0%, transparent 50%), linear-gradient(160deg, ${p.from} 0%, ${p.to} 100%)`,
      }}
    >
      {background ? (
        // eslint-disable-next-line @next/next/no-img-element -- Satori rendert <img>, kein next/image
        <img
          src={background}
          width={STORY_SIZE.width}
          height={STORY_SIZE.height}
          style={{ position: 'absolute', left: 0, top: 0, width: STORY_SIZE.width, height: STORY_SIZE.height, objectFit: 'cover' }}
          alt=""
        />
      ) : null}
      {background ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: STORY_SIZE.width,
            height: STORY_SIZE.height,
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.85) 100%), linear-gradient(160deg, ${color}55 0%, transparent 60%)`,
          }}
        />
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexGrow: 1,
          width: 920,
          paddingTop: 240,
          paddingBottom: 280,
          gap: 30,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: '#ffffff',
            boxShadow: '0 18px 50px rgba(0,0,0,0.3)',
          }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- Satori rendert <img>, kein next/image
            <img src={logo} width={160} height={160} style={{ objectFit: 'contain' }} alt="" />
          ) : null}
        </div>
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 600, color: p.muted }}>{eyebrow}</div>
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
            letterSpacing: -2,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            textAlign: 'center',
            textWrap: 'balance',
            width: '100%',
            fontSize: 48,
            fontWeight: 600,
            color: p.muted,
          }}
        >
          {keepSeparators(subtitle)}
        </div>
        {badge ? (
          <div
            style={{
              display: 'flex',
              padding: '16px 40px',
              borderRadius: 999,
              fontSize: 44,
              fontWeight: 700,
              backgroundColor: p.pill,
              color: p.pillText,
            }}
          >
            {badge}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 40,
            padding: 28,
            borderRadius: 40,
            backgroundColor: '#ffffff',
            boxShadow: '0 18px 50px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', position: 'relative', width: 300, height: 300 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori rendert <img>, kein next/image */}
            <img src={qr} width={300} height={300} alt="" />
            {qrLogo ? (
              // Mitte der Plakette (rund 16 % der Kante, siehe qrGenerator.ts im Backend)
              // eslint-disable-next-line @next/next/no-img-element -- Satori rendert <img>, kein next/image
              <img
                src={qrLogo}
                width={48}
                height={48}
                style={{ position: 'absolute', left: 126, top: 126, objectFit: 'contain' }}
                alt=""
              />
            ) : null}
          </div>
          <div style={{ display: 'flex', marginTop: 14, fontSize: 32, fontWeight: 700, color: '#18181b' }}>
            Scannen &amp; eintragen
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center', width: '100%', fontSize: 30, color: p.muted }}>
          {host}
        </div>
      </div>
    </div>
  );
}

export interface OgSubpage {
  /** Titel der Seite (Browser-Tab und Vorschau) */
  title: string;
  /** Beschreibung (Meta-Description und Vorschautext) */
  description: string;
  /** Kurzer Satz im Vorschaubild unter dem Titel */
  subtitle: string;
}

/**
 * Metadaten für eine Unterseite mit eigenem Vorschaubild (`/og?seite=<key>`). Die `/og`-Route der App
 * zeichnet für denselben Schlüssel Titel und Untertitel aus `page`.
 */
export async function ogSubpageMetadata(key: string, path: string, page: OgSubpage) {
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  const title = `${page.title} · ${org.name}`;
  const image = ogImage(`${origin}/og?seite=${encodeURIComponent(key)}`, title, key, page.title, page.subtitle);
  return {
    title: page.title,
    description: page.description,
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website' as const,
      siteName: org.name,
      locale: 'de_CH',
      title,
      description: page.description,
      url: `${origin}${path}`,
      images: [image],
    },
    twitter: { card: 'summary_large_image' as const, title, description: page.description, images: [image] },
  };
}
