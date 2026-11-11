import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist' || name === 'generated') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

/**
 * Regression: Der Server kennt beim Rendern kein `window`. Ein Host-Fallback auf Cevi in Komponenten
 * (`typeof window !== 'undefined' ? window.location.host : 'cevi-schichtplan.ch'`) lieferte auf
 * pfadi-/jubla-/vereins-schichtplan.ch Links und Namen von Cevi, und React korrigiert Link-Attribute bei
 * der Hydration nicht. Stattdessen `useOrganization()` (Kontext) oder `getBrowserOrganization()` (nur in
 * Ereignis-Handlern) nehmen.
 */
describe('Kein fester Cevi-Host-Fallback in der Oberfläche', () => {
  const roots = ['apps/web/src', 'apps/login/src', 'apps/landing/src', 'apps/admin/src', 'packages/ui/src'];

  it('window.location.host fällt nirgends auf cevi-schichtplan.ch zurück', () => {
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of sources(path.join(repo, root))) {
        const text = readFileSync(file, 'utf8');
        if (/window\.location\.host\s*:\s*'cevi-schichtplan\.ch'/.test(text)) offenders.push(path.relative(repo, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('die festen Cevi-Adressen HELP_URL, STATUS_URL und PRIVACY_URL gibt es nicht mehr', () => {
    const offenders: string[] = [];
    for (const root of [...roots, 'packages/shared/src']) {
      for (const file of sources(path.join(repo, root))) {
        if (/\b(HELP_URL|STATUS_URL|PRIVACY_URL)\b/.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(repo, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
