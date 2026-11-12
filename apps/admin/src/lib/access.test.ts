import { describe, expect, it } from 'vitest';
import { ACCESS_OPTIONS, accessPayload, accessValue } from './access';

describe('access (Admin)', () => {
  it('Abteilungsleitung bekommt die Rolle ADMIN ohne Einzelrechte', () => {
    expect(accessPayload('ADMIN')).toEqual({ role: 'ADMIN', permissions: [] });
    expect(accessValue('ADMIN', [])).toBe('ADMIN');
  });

  it('unbekannte Auswahl wird nie zur Leitung, sondern zu «Mitglied ohne Rechte»', () => {
    expect(accessPayload('IRGENDWAS')).toEqual({ role: 'HELPER', permissions: [] });
    expect(accessPayload('HELPER')).toEqual({ role: 'HELPER', permissions: [] });
  });

  it('jede Rechte-Vorlage ergibt dieselbe Auswahl zurück', () => {
    for (const option of ACCESS_OPTIONS) {
      if (option.value === 'ADMIN' || option.value === 'HELPER') continue;
      const { role, permissions } = accessPayload(option.value);
      expect(role).toBe('HELPER');
      expect(accessValue(role, permissions)).toBe(option.value);
    }
  });

  it('ohne Mitgliedschaft keine Auswahl, ohne Rechte «Mitglied»', () => {
    expect(accessValue(null, [])).toBe('');
    expect(accessValue('HELPER', [])).toBe('HELPER');
  });
});
