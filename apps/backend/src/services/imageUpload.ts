/**
 * Prüfung hochgeladener Bilder: Der Inhalt muss zum angegebenen Format passen (Magic Bytes),
 * und SVGs dürfen weder Skripte noch fremde Einbindungen enthalten.
 * Ausgeliefert werden Bilder zusätzlich mit CSP-Sandbox (siehe routes/uploads.ts).
 */
export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/svg+xml';

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/** Erkennt das Bildformat am Inhalt (nicht am Dateinamen oder angegebenen Typ) */
export function detectImageType(buf: Buffer): ImageMime | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38]) && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61) {
    return 'image/gif';
  }
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  // SVG ist Text: <svg muss im Kopf des Dokuments stehen (nach BOM, XML-Deklaration, Kommentaren)
  const head = buf.subarray(0, 2048).toString('utf8');
  return startsWithSvgRoot(head) ? 'image/svg+xml' : null;
}

/** Prüft linear (ohne verschachtelte Regex-Wiederholungen), ob das Dokument mit <svg beginnt */
function startsWithSvgRoot(text: string): boolean {
  let rest = text.replace(/^﻿/, '').trimStart();
  for (;;) {
    if (rest.startsWith('<?')) {
      const end = rest.indexOf('?>');
      if (end === -1) return false;
      rest = rest.slice(end + 2).trimStart();
    } else if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->');
      if (end === -1) return false;
      rest = rest.slice(end + 3).trimStart();
    } else if (/^<!DOCTYPE\s/i.test(rest)) {
      const end = rest.indexOf('>');
      if (end === -1) return false;
      rest = rest.slice(end + 1).trimStart();
    } else {
      break;
    }
  }
  return /^<svg[\s>]/i.test(rest);
}

const UNSAFE_SVG: [RegExp, string][] = [
  [/<\s*script/i, 'Skripte'],
  [/<\s*(iframe|embed|object|foreignObject)\b/i, 'eingebettete Inhalte'],
  [/[\s/]on[a-z]+\s*=/i, 'Ereignis-Handler'],
  [/javascript\s*:/i, 'javascript-Adressen'],
  [/<!\s*ENTITY/i, 'Entity-Definitionen'],
  // Verweise nur auf Elemente im selben Dokument (#id) oder unbedenkliche Rasterbilder
  // Deckt sowohl zitierten ("...", '...') als auch unzitierten Syntax ab
  [/(?:xlink:)?href\s*=\s*(?:["'](?!\s*(?:#|data:image\/(?:png|jpe?g|webp|gif)))|(?![#"'\s]|data:image\/(?:png|jpe?g|webp|gif)))/i, 'Verweise auf fremde Adressen'],
  [/@import|url\(\s*["']?\s*(?!#|data:image\/(?:png|jpe?g|webp|gif))/i, 'fremde Stylesheet-Verweise'],
];

/** Gibt den Grund zurück, warum ein SVG nicht erlaubt ist, oder null wenn es unbedenklich aussieht */
export function unsafeSvgReason(svg: string): string | null {
  const decoded = svg.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (_, hex, dec) => {
    const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    return code > 0 && code < 65536 ? String.fromCharCode(code) : '';
  });
  for (const [pattern, reason] of UNSAFE_SVG) {
    if (pattern.test(svg) || pattern.test(decoded)) return reason;
  }
  return null;
}
