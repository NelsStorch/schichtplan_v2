import { describe, expect, it } from 'vitest';
import {
  DEPARTMENT_PERMISSION_KEYS,
  departmentRoleLabel,
  normalizePermissions,
  permissionPresetOf,
} from '@schichtplan/shared';
import { accessFrom, canGrantPermissions, eventCapabilities } from './permissions.js';

const helper = (permissions: string[]) => accessFrom({ role: 'HELPER', permissions }, false);

describe('normalizePermissions', () => {
  it('ergänzt vorausgesetzte Rechte und verwirft unbekannte', () => {
    expect(normalizePermissions(['EVENTS_DELETE', 'GIBTS_NICHT', 'PEOPLE_MANAGE'])).toEqual([
      'PEOPLE_VIEW',
      'PEOPLE_MANAGE',
      'EVENTS_VIEW_ALL',
      'EVENTS_DELETE',
    ]);
  });

  it('erkennt Vorlagen unabhängig von der Reihenfolge', () => {
    expect(permissionPresetOf(['EVENTS_CREATE'])).toBe('EVENT_CREATION');
    expect(permissionPresetOf([...DEPARTMENT_PERMISSION_KEYS].reverse())).toBe('ADMINISTRATION');
    expect(permissionPresetOf(['STUFEN_MANAGE'])).toBeNull();
  });

  it('benennt Personen nach Abteilungsleitung, Vorlage, Heimabteilung', () => {
    expect(departmentRoleLabel({ isLeader: true, permissions: [], isHomeDepartment: false })).toBe('Abteilungsleitung');
    expect(departmentRoleLabel({ isLeader: false, permissions: ['EVENTS_CREATE'], isHomeDepartment: true })).toBe(
      'Anlässe erstellen'
    );
    expect(departmentRoleLabel({ isLeader: false, permissions: ['STUFEN_MANAGE'], isHomeDepartment: true })).toBe(
      'Eigene Rechte'
    );
    expect(departmentRoleLabel({ isLeader: false, permissions: [], isHomeDepartment: true })).toBe('Mitglied');
    expect(departmentRoleLabel({ isLeader: false, permissions: [], isHomeDepartment: false })).toBe('Gast');
  });
});

describe('canGrantPermissions', () => {
  const administration = helper([...DEPARTMENT_PERMISSION_KEYS]);

  it('Abteilungsleitung und globale Admins dürfen alles vergeben', () => {
    expect(canGrantPermissions(accessFrom({ role: 'ADMIN', permissions: [] }, false), [], DEPARTMENT_PERMISSION_KEYS)).toBe(true);
    expect(canGrantPermissions(accessFrom(null, true), DEPARTMENT_PERMISSION_KEYS, [])).toBe(true);
  });

  it('Administration vergibt nur weniger Rechte, als sie selbst hat', () => {
    expect(canGrantPermissions(administration, [], ['EVENTS_CREATE'])).toBe(true);
    expect(canGrantPermissions(administration, [], DEPARTMENT_PERMISSION_KEYS)).toBe(false);
    // Gleichgestellte kann sie nicht herabstufen
    expect(canGrantPermissions(administration, DEPARTMENT_PERMISSION_KEYS, [])).toBe(false);
  });

  it('ohne «Personen und Rechte verwalten» geht nichts', () => {
    expect(canGrantPermissions(helper(['PEOPLE_VIEW', 'EVENTS_CREATE']), [], [])).toBe(false);
  });

  it('nur Rechte, die man selbst hat', () => {
    const actor = helper(['PEOPLE_MANAGE', 'EVENTS_CREATE']);
    expect(canGrantPermissions(actor, [], ['EVENTS_CREATE'])).toBe(true);
    expect(canGrantPermissions(actor, [], ['EVENTS_DELETE'])).toBe(false);
    expect(canGrantPermissions(actor, ['STUFEN_MANAGE'], [])).toBe(false);
  });
});

describe('eventCapabilities', () => {
  it('OK-Mitglied plant, ändert aber keine Einstellungen', () => {
    const caps = eventCapabilities(helper([]), 'OK_MEMBER');
    expect(caps.has('SHIFTS')).toBe(true);
    expect(caps.has('SETTINGS')).toBe(false);
    expect(caps.has('DELETE')).toBe(false);
  });

  it('OK-Leitung ändert Einstellungen und das OK, löscht aber nicht', () => {
    const caps = eventCapabilities(helper([]), 'OK_LEAD');
    expect(caps.has('SETTINGS')).toBe(true);
    expect(caps.has('ORGANIZERS')).toBe(true);
    expect(caps.has('DELETE')).toBe(false);
  });

  it('Abteilungsrechte gelten in allen Anlässen', () => {
    const caps = eventCapabilities(helper(['EVENTS_DELETE']), null);
    expect([...caps].sort()).toEqual(['DELETE', 'VIEW']);
    expect(eventCapabilities(helper(['EVENTS_CREATE']), null).has('SHIFTS')).toBe(false);
    expect(eventCapabilities(helper([]), null).size).toBe(0);
  });
});
