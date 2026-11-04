/**
 * Leitet aus einer beliebigen Abteilungsfarbe die Akzent-Tokens ab:
 *  --accent            Flächenfarbe (Buttons, Ring, Glow)
 *  --accent-fg         Textfarbe AUF der Akzentfläche (weiss oder fast-schwarz, je nach Kontrast)
 *  --accent-ink-light  Akzent als Textfarbe auf hellem Grund (abgedunkelt bis WCAG AA 4.5:1)
 *  --accent-ink-dark   Akzent als Textfarbe auf dunklem Grund (aufgehellt bis WCAG AA 4.5:1)
 *
 * So bleibt jede Abteilungsfarbe – auch Gelb oder Hellblau – in beiden Modi lesbar.
 */
import {
  type Rgb,
  CEVI_RED,
  WHITE,
  INK,
  hexToRgb,
  rgbToHex,
  contrastRatio,
  evaluateContrast,
  darkenToContrast,
  mixRgb,
  type ContrastEvaluation,
} from '@schichtplan/shared';

export {
  type Rgb,
  hexToRgb,
  rgbToHex,
  contrastRatio,
  evaluateContrast,
  darkenToContrast,
  type ContrastEvaluation,
};

const LIGHT_SURFACE: Rgb = [254, 254, 253];
const DARK_SURFACE: Rgb = [23, 21, 19];

function inkFor(color: Rgb, background: Rgb, towards: Rgb): Rgb {
  for (let t = 0; t <= 1; t += 0.05) {
    const candidate = mixRgb(color, towards, t);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return towards;
}

const channels = (c: Rgb) => c.join(' ');

export function accentVars(hex?: string | null): Record<string, string> {
  const accent = hexToRgb(hex) ?? CEVI_RED;
  const fg = contrastRatio(accent, WHITE) >= contrastRatio(accent, INK) ? WHITE : INK;
  return {
    '--accent': channels(accent),
    '--accent-fg': channels(fg),
    '--accent-ink-light': channels(inkFor(accent, LIGHT_SURFACE, [0, 0, 0])),
    '--accent-ink-dark': channels(inkFor(accent, DARK_SURFACE, WHITE)),
  };
}

/** Setzt die Akzent-Tokens global auf <html>. Nur im Browser aufrufen. */
export function applyAccent(hex?: string | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(accentVars(hex))) {
    root.style.setProperty(key, value);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  const accent = hexToRgb(hex) ?? CEVI_RED;
  meta?.setAttribute('content', `rgb(${accent.join(',')})`);
}
