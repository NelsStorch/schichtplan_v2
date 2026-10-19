/** Zielgruppen der Hilfe. Farben bewusst ruhig: Akzent nur für die Hauptaktion. */
export const AUDIENCES = {
  helfer: { label: 'Helfer*innen', short: 'Helfer*in', href: '/helfen/eintragen/' },
  ok: { label: 'OK', short: 'OK', href: '/ok/rollen/' },
  abteilung: { label: 'Abteilungsleitung', short: 'AL', href: '/abteilung/anlegen/' },
} as const;

export type Audience = keyof typeof AUDIENCES;

/** Lesezeit in Minuten aus dem Markdown (ohne Komponenten-Tags und Frontmatter) */
export function readingMinutes(body: string | undefined): number {
  if (!body) return 1;
  const text = body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>|\-[\]()]/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 190));
}
