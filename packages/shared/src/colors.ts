/**
 * Farb- und Kontrastberechnungen (WCAG 2.1) für Abteilungsakzente und QR-Codes.
 * Zeitzone/Backend/Frontend-unabhängig in packages/shared.
 */

export type Rgb = [number, number, number];

export const CEVI_RED: Rgb = [225, 29, 72]; // #e11d48
export const CEVI_NAVY: Rgb = [0, 61, 143]; // #003d8f
export const WHITE: Rgb = [255, 255, 255];
export const INK: Rgb = [28, 25, 23];

export function hexToRgb(hex?: string | null): Rgb | null {
  if (!hex) return null;
  const clean = hex.trim().replace(/^#/, '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function mixRgb(from: Rgb, to: Rgb, t: number): Rgb {
  return from.map((v, i) => Math.round(v + (to[i] - v) * t)) as Rgb;
}

/**
 * Dunkelt eine Farbe in Schritten ab, bis das gewünschte Mindest-Kontrastverhältnis
 * zum Hintergrund erreicht ist (Standard: 4.5:1 für WCAG AA).
 */
export function darkenToContrast(color: Rgb, background: Rgb = WHITE, targetRatio = 4.5): Rgb {
  if (contrastRatio(color, background) >= targetRatio) return color;
  for (let t = 0; t <= 1; t += 0.02) {
    const candidate = mixRgb(color, [0, 0, 0], t);
    if (contrastRatio(candidate, background) >= targetRatio) return candidate;
  }
  return [0, 0, 0];
}

export interface ContrastEvaluation {
  hex: string;
  rgb: Rgb;
  ratioAgainstWhite: number;
  level: 'optimal' | 'sufficient' | 'poor';
  label: string;
  isQrOptimal: boolean;
  /** Farbcode, der für QR-Codes verwendet werden soll (automatisch abgedunkelt, falls < 3.5:1) */
  qrSafeHex: string;
  qrSafeRgb: Rgb;
  /** Textfarbe auf dieser Hintergrundfarbe (weiss oder fast-schwarz) */
  textOnAccent: '#ffffff' | '#1c1917';
}

/**
 * Bewertet eine Hex-Farbe für die Verwendung im Schichtplan und auf QR-Codes.
 */
export function evaluateContrast(hex?: string | null): ContrastEvaluation {
  const rgb = hexToRgb(hex) ?? CEVI_RED;
  const normalizedHex = rgbToHex(rgb);
  const ratio = Math.round(contrastRatio(rgb, WHITE) * 100) / 100;

  let level: ContrastEvaluation['level'];
  let label: string;
  let isQrOptimal: boolean;

  if (ratio >= 4.5) {
    level = 'optimal';
    label = `Sehr gut (${ratio}:1) · Optimal für QR-Code und Schrift (WCAG AA)`;
    isQrOptimal = true;
  } else if (ratio >= 3.0) {
    level = 'sufficient';
    label = `Ausreichend (${ratio}:1) · Für QR-Code im Aushang gut lesbar`;
    isQrOptimal = true;
  } else {
    level = 'poor';
    label = `Zu wenig Kontrast (${ratio}:1) · Scanner könnten fehlschlagen`;
    isQrOptimal = false;
  }

  // Für QR-Codes dunkeln wir Farben mit < 3.5:1 automatisch ab, damit Scannen garantiert klappt
  const qrRgb = ratio >= 3.5 ? rgb : darkenToContrast(rgb, WHITE, 4.5);
  const textOnAccent = contrastRatio(rgb, WHITE) >= contrastRatio(rgb, INK) ? '#ffffff' : '#1c1917';

  return {
    hex: normalizedHex,
    rgb,
    ratioAgainstWhite: ratio,
    level,
    label,
    isQrOptimal,
    qrSafeHex: rgbToHex(qrRgb),
    qrSafeRgb: qrRgb,
    textOnAccent,
  };
}
