// Platzhalter-Basis, um relative Pfade so aufzulösen, wie es der Browser tut
const RELATIVE_BASE = 'https://relative.invalid';

/**
 * Bereinigt ein Weiterleitungsziel nach dem Login (`return_to`), damit das Login nicht als
 * offener Redirect auf fremde Seiten missbraucht werden kann.
 *
 * Erlaubt sind relative Pfade sowie URLs auf `rootDomain` und deren Subdomains
 * (optional zusätzlich localhost für die Entwicklung). Alles andere ergibt `fallback`.
 */
export function safeReturnTo(
  value: unknown,
  rootDomain: string,
  { allowLocalhost = false, fallback = '/' }: { allowLocalhost?: boolean; fallback?: string } = {}
): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;

  let url: URL;
  try {
    // Auflösen statt Präfixe vergleichen: fängt auch `//host`, `/\host` und Tabs/Zeilenumbrüche ab
    url = new URL(value, RELATIVE_BASE);
  } catch {
    return fallback;
  }

  if (url.origin === RELATIVE_BASE) return `${url.pathname}${url.search}${url.hash}`;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;

  const host = url.hostname.toLowerCase();
  const root = rootDomain.replace(/^\./, '').toLowerCase();
  const isOwnDomain = host === root || host.endsWith(`.${root}`);
  const isLocal = allowLocalhost && (host === 'localhost' || host === '127.0.0.1');

  if (isOwnDomain && url.protocol === 'https:') return url.toString();
  if (isLocal) return url.toString();
  return fallback;
}
