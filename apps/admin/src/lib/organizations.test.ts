import { describe, expect, it } from 'vitest';
import { HITOBITO_PROVIDERS_TEXT, matchesOrg, organizationLabel, providerLabel } from './organizations';

describe('organizations', () => {
  it('benennt die vier Auftritte', () => {
    expect(organizationLabel('CEVI')).toBe('Cevi');
    expect(organizationLabel('JUBLA')).toBe('Jubla');
    expect(organizationLabel('OTHER')).toBe('Verein');
    expect(organizationLabel('OTHER', true)).toBe('Vereine');
    expect(organizationLabel(undefined)).toBe('Cevi');
  });

  it('kennt die Datenbank je Verband, Vereine haben keine', () => {
    expect(providerLabel('PFADI')).toBe('PBS MiData');
    expect(providerLabel('JUBLA')).toBe('Jubla-DB');
    expect(providerLabel('OTHER')).toBeNull();
    expect(HITOBITO_PROVIDERS_TEXT).toBe('Cevi.DB, PBS MiData oder Jubla-DB');
  });

  it('filtert nach Verband, alte Einträge ohne Feld gelten als Cevi', () => {
    expect(matchesOrg('PFADI', 'ALL')).toBe(true);
    expect(matchesOrg('PFADI', 'PFADI')).toBe(true);
    expect(matchesOrg('PFADI', 'CEVI')).toBe(false);
    expect(matchesOrg(undefined, 'CEVI')).toBe(true);
  });
});
