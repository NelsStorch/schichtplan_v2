import { describe, expect, it } from 'vitest';
import { audienceLabel, checkRules, evaluateEventAccess, isVerifiedHomeSource,
  hasValidGrant, type AccessEvent, type AccessUser } from './eventAccess.js';
import { EVENT_CAPABILITIES, type EventCapability } from '@schichtplan/shared';

const HOME = 'dep-home';
const OTHER = 'dep-other';
const STUFE_A = 'stufe-a';
const STUFE_B = 'stufe-b';

function event(overrides: Partial<AccessEvent> = {}): AccessEvent {
  return {
    id: 'ev',
    departmentId: HOME,
    accessType: 'PUBLIC',
    leadersOnly: false,
    allowPublicSignup: true,
    organizers: [],
    allowedDepartments: [],
    allowedStufen: [],
    ...overrides,
  };
}

function user(overrides: Partial<AccessUser> = {}): AccessUser {
  return {
    id: 'u',
    isGlobalAdmin: false,
    ceviDbId: null,
    ceviDbDepartmentLeader: false,
    ceviDbStufen: [],
    homeDepartmentId: null,
    homeDepartmentSource: null,
    stufen: [],
    ...overrides,
  };
}

const noCan = Object.fromEntries(EVENT_CAPABILITIES.map((c) => [c, false])) as Record<EventCapability, boolean>;
const noFlags = { isManager: false, isDeptAdmin: false, isOkLead: false, can: noCan };

describe('checkRules', () => {
  it('lässt bei PUBLIC alle mit Konto zu', () => {
    expect(checkRules(event(), user(), 'Cevi Home')).toEqual({ ok: true });
  });

  it('verlangt bei CEVIDB_ALL einen Cevi.DB-Login', () => {
    const result = checkRules(event({ accessType: 'CEVIDB_ALL' }), user(), 'Cevi Home');
    expect(result).toMatchObject({ ok: false, reason: 'CEVIDB_REQUIRED' });
    expect(checkRules(event({ accessType: 'CEVIDB_ALL' }), user({ ceviDbId: 1 }), 'Cevi Home').ok).toBe(true);
  });

  it('fragt bei DEPARTMENT ohne Abteilung nach', () => {
    expect(checkRules(event({ accessType: 'DEPARTMENT' }), user(), 'Cevi Home')).toMatchObject({
      ok: false,
      reason: 'NO_DEPARTMENT',
    });
  });

  it('lässt bei DEPARTMENT nur die eigene Abteilung zu', () => {
    const ev = event({ accessType: 'DEPARTMENT' });
    expect(checkRules(ev, user({ homeDepartmentId: HOME, homeDepartmentSource: 'SELF' }), 'X').ok).toBe(true);
    expect(checkRules(ev, user({ homeDepartmentId: OTHER, homeDepartmentSource: 'SELF' }), 'X')).toMatchObject({
      ok: false,
      reason: 'WRONG_DEPARTMENT',
    });
  });

  it('zählt bei DEPARTMENT_CEVIDB nur die Abteilung aus Cevi.DB', () => {
    const ev = event({ accessType: 'DEPARTMENT_CEVIDB' });
    const self = user({ ceviDbId: 1, homeDepartmentId: HOME, homeDepartmentSource: 'SELF' });
    expect(checkRules(ev, self, 'X')).toMatchObject({ ok: false, reason: 'WRONG_DEPARTMENT' });
    const fromDb = user({ ceviDbId: 1, homeDepartmentId: HOME, homeDepartmentSource: 'CEVIDB' });
    expect(checkRules(ev, fromDb, 'X').ok).toBe(true);
  });

  it('lässt bei WHITELIST freigeschaltete Abteilungen zu', () => {
    const ev = event({
      accessType: 'WHITELIST',
      allowedDepartments: [{ departmentId: OTHER, department: { name: 'Cevi Other' } }],
    });
    expect(checkRules(ev, user({ homeDepartmentId: OTHER, homeDepartmentSource: 'SELF' }), 'X').ok).toBe(true);
    expect(checkRules(ev, user({ homeDepartmentId: 'dep-third', homeDepartmentSource: 'SELF' }), 'X').ok).toBe(false);
  });

  it('wendet den Stufen-Filter pro Abteilung an', () => {
    const ev = event({
      accessType: 'DEPARTMENT',
      allowedStufen: [{ stufeId: STUFE_A, stufe: { departmentId: HOME, name: 'Hiskia' } }],
    });
    const inA = user({
      homeDepartmentId: HOME,
      homeDepartmentSource: 'SELF',
      stufen: [{ stufeId: STUFE_A, role: 'TEILNEHMER', source: 'SELF' }],
    });
    const inB = user({
      homeDepartmentId: HOME,
      homeDepartmentSource: 'SELF',
      stufen: [{ stufeId: STUFE_B, role: 'TEILNEHMER', source: 'SELF' }],
    });
    expect(checkRules(ev, inA, 'X').ok).toBe(true);
    expect(checkRules(ev, inB, 'X')).toMatchObject({ ok: false, reason: 'WRONG_STUFE' });
  });

  it('lässt bei «nur Leitende» Stufenleitungen und Cevi.DB-Abteilungsleitungen zu', () => {
    const ev = event({ accessType: 'DEPARTMENT', leadersOnly: true });
    const base = { homeDepartmentId: HOME, homeDepartmentSource: 'SELF' };
    expect(checkRules(ev, user({ ...base, stufen: [{ stufeId: STUFE_A, role: 'TEILNEHMER', source: 'SELF' }] }), 'X'))
      .toMatchObject({ ok: false, reason: 'LEADERS_ONLY' });
    expect(checkRules(ev, user({ ...base, stufen: [{ stufeId: STUFE_A, role: 'LEITUNG', source: 'SELF' }] }), 'X').ok)
      .toBe(true);
    expect(checkRules(ev, user({ ...base, ceviDbId: 5, ceviDbDepartmentLeader: true }), 'X').ok).toBe(true);
  });

  it('zählt bei «alle Abteilungen, nur Leitende» auch Stufenleitungen aus Cevi.DB', () => {
    const ev = event({ accessType: 'PUBLIC', leadersOnly: true });
    expect(checkRules(ev, user({ ceviDbId: 5, ceviDbStufen: [{ kind: 'LEITUNG' }] }), 'X').ok).toBe(true);
    expect(checkRules(ev, user({ ceviDbId: 5, ceviDbStufen: [{ kind: 'TEILNEHMER' }] }), 'X').ok).toBe(false);
  });
});

describe('evaluateEventAccess', () => {
  it('lässt das OK immer eintragen', () => {
    const access = evaluateEventAccess(event({ allowPublicSignup: false }), 'X', null, { ...noFlags, isManager: true }, false);
    expect(access).toMatchObject({ canSignup: true, via: 'MANAGER', canSeeNames: true });
  });

  it('verlangt ohne Konto ein Login und zeigt Namen nur bei öffentlichen Anlässen', () => {
    expect(evaluateEventAccess(event(), 'X', null, noFlags, false)).toMatchObject({
      canSignup: false,
      reason: 'LOGIN_REQUIRED',
      canSeeNames: true,
    });
    expect(evaluateEventAccess(event({ accessType: 'DEPARTMENT' }), 'X', null, noFlags, false).canSeeNames).toBe(false);
  });

  it('meldet geschlossenes Eintragen', () => {
    const access = evaluateEventAccess(event({ allowPublicSignup: false }), 'X', user(), noFlags, false);
    expect(access).toMatchObject({ canSignup: false, reason: 'SIGNUP_CLOSED' });
  });

  it('meldet noch nicht freigeschaltetes Eintragen vor dem Freischaltzeitpunkt', () => {
    const future = new Date(Date.now() + 3600 * 1000 * 5); // in 5 Stunden
    const access = evaluateEventAccess(event({ signupOpensAt: future }), 'X', user(), noFlags, false);
    expect(access).toMatchObject({ canSignup: false, reason: 'SIGNUP_NOT_YET_OPEN' });
    expect(access.message).toContain('Das Eintragen öffnet am');

    // Das OK darf trotzdem eintragen
    const okAccess = evaluateEventAccess(event({ signupOpensAt: future }), 'X', user(), { ...noFlags, isManager: true }, false);
    expect(okAccess).toMatchObject({ canSignup: true, via: 'MANAGER' });

    // Nach Ablauf des Freischaltzeitpunkts ist es offen
    const past = new Date(Date.now() - 1000 * 60);
    const pastAccess = evaluateEventAccess(event({ signupOpensAt: past }), 'X', user(), noFlags, false);
    expect(pastAccess.canSignup).toBe(true);
  });

  it('öffnet den Anlass mit einem eingelösten Zugangs-Link', () => {
    const ev = event({ accessType: 'DEPARTMENT' });
    expect(evaluateEventAccess(ev, 'X', user(), noFlags, false).canSignup).toBe(false);
    expect(evaluateEventAccess(ev, 'X', user(), noFlags, true)).toMatchObject({ canSignup: true, via: 'LINK' });
  });
});

describe('audienceLabel', () => {
  it('beschreibt Abteilungen, Stufen und «nur Leitende»', () => {
    const ev = event({
      accessType: 'WHITELIST_CEVIDB',
      leadersOnly: true,
      allowedDepartments: [{ departmentId: OTHER, department: { name: 'Cevi Other' } }],
      allowedStufen: [{ stufeId: STUFE_A, stufe: { departmentId: HOME, name: 'Hiskia' } }],
    });
    expect(audienceLabel(ev, 'Cevi Home')).toBe('Cevi Home (Hiskia), Cevi Other, mit Cevi.DB-Login, nur Leitende');
    expect(audienceLabel(event(), 'Cevi Home')).toBe('alle mit Konto');
  });
});

describe('bestätigte Zugehörigkeit', () => {
  const internal = event({ accessType: 'DEPARTMENT_CEVIDB' });

  it('zählt bei Cevi.DB-Anlässen wie aus Cevi.DB', () => {
    expect(isVerifiedHomeSource('CONFIRMED')).toBe(true);
    expect(isVerifiedHomeSource('CEVIDB')).toBe(true);
    expect(isVerifiedHomeSource('SELF')).toBe(false);
    expect(isVerifiedHomeSource(null)).toBe(false);
  });

  it('lässt nur Bestätigte der eigenen Abteilung zu', () => {
    const home = internal.departmentId;
    const person = { ceviDbId: 1, homeDepartmentId: home };
    expect(checkRules(internal, user({ ...person, homeDepartmentSource: 'CONFIRMED' }), 'Abteilung').ok).toBe(true);
    expect(checkRules(internal, user({ ...person, homeDepartmentSource: 'SELF' }), 'Abteilung').ok).toBe(false);
  });
});

describe('hasValidGrant', () => {
  it('bleibt gültig, wenn ein Grant existiert (expiresAt des Links ist reine Einlösefrist)', async () => {
    const mockPrisma = {
      eventAccessGrant: {
        findUnique: async () => ({ id: 'grant-1' }),
      },
    };
    expect(await hasValidGrant(mockPrisma as unknown as Parameters<typeof hasValidGrant>[0], 'ev-1', 'u-1')).toBe(true);
  });

  it('gibt false zurück, wenn kein Grant existiert', async () => {
    const mockPrisma = {
      eventAccessGrant: {
        findUnique: async () => null,
      },
    };
    expect(await hasValidGrant(mockPrisma as unknown as Parameters<typeof hasValidGrant>[0], 'ev-1', 'u-1')).toBe(false);
  });
});
