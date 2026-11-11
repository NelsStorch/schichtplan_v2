// Erzeugt aus packages/shared/src/organizations.ts die Dateien, die Verbandsdaten brauchen und kein
// TypeScript-Build haben: hilfe/public/branding.js (Browser) und hilfe/nginx.conf (Host-Ersetzung).
// So gibt es eine einzige Liste der Verbaende. Aufruf: npm run generate (laeuft vor dev und build automatisch).
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORGANIZATIONS } from '../../packages/shared/src/organizations.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(root + file, 'utf8');
const write = (file, text) => writeFileSync(root + file, text, 'utf8');

const rgb = (hex) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Ungueltige Farbe: ${hex}`);
  return m.slice(1).map((h) => parseInt(h, 16)).join(' ');
};

const orgs = {};
for (const org of Object.values(ORGANIZATIONS)) {
  orgs[org.slug] = {
    slug: org.slug,
    name: org.name,
    shortName: org.orgName,
    domain: org.domain,
    unitTerm: org.unitTerm,
    unitTermPlural: org.unitTermPlural,
    leadTerm: org.leadTerm,
    nicknameTerm: org.nicknameTerm,
    authProvider: org.authProviderName,
    // Im Hilfe-Center liegen die Logos direkt im Wurzelverzeichnis (public/)
    logo: `/${basename(org.logoUrl)}`,
    ...(org.independentNotice ? { notice: org.independentNotice } : {}),
    accent: rgb(org.primaryColor),
    accentInkLight: rgb(org.accentInkLight),
    accentInkDark: rgb(org.accentInkDark),
    accentFg: '255 255 255',
  };
}

const branding = read('branding.template.js');
if (!branding.includes('/*__ORGS__*/ {}')) throw new Error('Platzhalter fehlt in branding.template.js');
write('public/branding.js', branding.replace('/*__ORGS__*/ {}', JSON.stringify(orgs, null, 2).replace(/\n/g, '\n  ')));

const nginx = read('nginx.conf.template');
if (!nginx.includes('__ORG_DOMAINS__')) throw new Error('Platzhalter fehlt in nginx.conf.template');
const domains = Object.values(ORGANIZATIONS)
  .map((o) => o.domain.replace(/\./g, String.raw`\.`))
  .join('|');
write(
  'nginx.conf',
  `# GENERIERT aus nginx.conf.template (npm run generate). Nicht von Hand aendern.\n${nginx.replace('__ORG_DOMAINS__', domains)}`,
);

console.log(`Hilfe-Center: ${Object.keys(orgs).length} Verbaende in branding.js und nginx.conf geschrieben`);
