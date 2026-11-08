/**
 * Wächter für die Eingabeprüfung: Jede Route, die `request.body`, `request.query` oder `request.params`
 * liest, muss dafür ein Routen-Schema haben (`body`, `querystring`, `params`). Fastify prüft dann vor
 * dem Handler, ersetzt die Daten durch das bereinigte Ergebnis (unbekannte Felder fallen weg) und
 * meldet Fehler einheitlich (app.ts). So kann keine neue Route ungeprüfte Daten verwenden.
 *
 * Ausnahme: Routen, die den Body bewusst selbst prüfen (z. B. /api/stats/ui, kommt per sendBeacon als
 * text/plain), stehen unten in SELF_VALIDATED und müssen dann `safeParse(request.body)` aufrufen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTES_DIR = path.join(import.meta.dirname, '.');
// - POST /api/stats/ui: kommt per sendBeacon als text/plain
// - DELETE /api/events/:slug: Bestätigung (Kürzel) erst nach der Berechtigungsprüfung, mit eigener Meldung
const SELF_VALIDATED = new Set(['POST /api/stats/ui', 'DELETE /api/events/:slug']);

interface RouteInfo {
  file: string;
  key: string;
  block: string;
}

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

function routes(): RouteInfo[] {
  const result: RouteInfo[] = [];
  for (const file of routeFiles(ROUTES_DIR)) {
    const source = fs.readFileSync(file, 'utf8');
    const re = /\w+\.(get|post|put|patch|delete)(<[^(]*?>)?\(\s*'([^']+)'/g;
    const starts: { index: number; key: string }[] = [];
    for (let m = re.exec(source); m; m = re.exec(source)) {
      starts.push({ index: m.index, key: `${m[1].toUpperCase()} ${m[3]}` });
    }
    starts.forEach((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
      result.push({ file: path.relative(ROUTES_DIR, file), key: start.key, block: source.slice(start.index, end) });
    });
  }
  return result;
}

describe('Eingabeprüfung aller Routen', () => {
  const all = routes();

  it('findet die Routen', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('jede gelesene Eingabe hat ein Routen-Schema', () => {
    const missing: string[] = [];
    for (const r of all) {
      const selfChecked = SELF_VALIDATED.has(r.key) && /safeParse\(request\.body/.test(r.block);
      if (/request\.body/.test(r.block) && !/\bbody:\s*[A-Za-z]/.test(r.block) && !selfChecked) missing.push(`${r.key} (body, ${r.file})`);
      if (/request\.query/.test(r.block) && !/\bquerystring:/.test(r.block)) missing.push(`${r.key} (query, ${r.file})`);
      if (/request\.params/.test(r.block) && !/\bparams:/.test(r.block)) missing.push(`${r.key} (params, ${r.file})`);
    }
    expect(missing).toEqual([]);
  });

  it('prüft nicht doppelt (das Routen-Schema hat schon geprüft)', () => {
    const doubled = all
      .filter((r) => !SELF_VALIDATED.has(r.key) && /safeParse\(request\.(body|query|params)/.test(r.block))
      .map((r) => `${r.key} (${r.file})`);
    expect(doubled).toEqual([]);
  });
});
