import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ORGANIZATIONS, ORGANIZATION_DOMAINS } from '@schichtplan/shared';

const hilfe = (file: string) => readFileSync(fileURLToPath(new URL(`../../../../hilfe/${file}`, import.meta.url)), 'utf8');

/**
 * hilfe/public/branding.js und hilfe/nginx.conf werden aus packages/shared/src/organizations.ts erzeugt
 * (`npm run generate` im Ordner hilfe, läuft vor dev und build). Dieser Test fällt auf, wenn jemand
 * organizations.ts ändert und die erzeugten Dateien nicht mit einchecken.
 */
describe('Hilfe-Center: erzeugte Dateien passen zur Verbandsliste', () => {
  it('ORGANIZATION_DOMAINS enthält jede Verbandsdomain genau einmal', () => {
    expect([...ORGANIZATION_DOMAINS].sort()).toEqual(Object.values(ORGANIZATIONS).map((o) => o.domain).sort());
  });

  it('branding.js kennt jeden Verband mit Domain, Name und Akzentfarbe', () => {
    const branding = hilfe('public/branding.js');
    for (const org of Object.values(ORGANIZATIONS)) {
      expect(branding, `Domain ${org.domain}`).toContain(`"domain": "${org.domain}"`);
      expect(branding, `Name ${org.name}`).toContain(`"name": "${org.name}"`);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(org.primaryColor.slice(i, i + 2), 16));
      expect(branding, `Farbe ${org.primaryColor}`).toContain(`"accent": "${r} ${g} ${b}"`);
    }
  });

  it('nginx.conf ersetzt die Hilfe-Adressen für jede Verbandsdomain', () => {
    const nginx = hilfe('nginx.conf');
    for (const domain of ORGANIZATION_DOMAINS) {
      expect(nginx, `Domain ${domain}`).toContain(domain.replace(/\./g, String.raw`\.`));
    }
  });
});
