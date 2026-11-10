import { describe, expect, it } from 'vitest';
import { hasRights, isCeviNameProfile, pickCeviNameMatch } from './ceviNameLogin.js';

type Match = Parameters<typeof pickCeviNameMatch>[0][number];

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'u1',
    passwordHash: null,
    providerId: null,
    ceviDbId: null,
    isGlobalAdmin: false,
    memberships: [],
    organizedEvents: [],
    ...overrides,
  };
}

describe('isCeviNameProfile', () => {
  it('gilt nur ohne Passwort und ohne Cevi.DB', () => {
    expect(isCeviNameProfile({ passwordHash: null, ceviDbId: null })).toBe(true);
    expect(isCeviNameProfile({ passwordHash: 'x', ceviDbId: null })).toBe(false);
    expect(isCeviNameProfile({ passwordHash: null, ceviDbId: 1 })).toBe(false);
  });
});

describe('hasRights', () => {
  it('erkennt Admin, Leitung, Planung und OK', () => {
    expect(hasRights(match())).toBe(false);
    expect(hasRights(match({ memberships: [{ role: 'HELPER', permissions: [] }] }))).toBe(false);
    expect(hasRights(match({ isGlobalAdmin: true }))).toBe(true);
    expect(hasRights(match({ memberships: [{ role: 'HELPER', permissions: ['EVENTS_VIEW_ALL'] }] }))).toBe(true);
    expect(hasRights(match({ organizedEvents: [{ id: 'e' }] }))).toBe(true);
  });
});

describe('pickCeviNameMatch', () => {
  it('meldet reine Cevi-Name-Profile ohne Rechte an', () => {
    expect(pickCeviNameMatch([match({ id: 'a' })])).toEqual({ kind: 'LOGIN', userId: 'a' });
  });

  it('schickt Cevi.DB- und Passwort-Konten zum eigenen Login', () => {
    expect(pickCeviNameMatch([match({ ceviDbId: 7 })])).toEqual({ kind: 'USE_CEVIDB' });
    expect(pickCeviNameMatch([match({ passwordHash: 'x' })])).toEqual({ kind: 'USE_PASSWORD' });
  });

  it('meldet Cevi-Name-Profile mit Rechten nicht an', () => {
    expect(pickCeviNameMatch([match({ memberships: [{ role: 'ADMIN', permissions: [] }] })])).toEqual({ kind: 'USE_PASSWORD' });
  });

  it('bevorzugt ein offenes Profil vor geschützten Konten', () => {
    expect(pickCeviNameMatch([match({ id: 'db', ceviDbId: 1 }), match({ id: 'open' })])).toEqual({
      kind: 'LOGIN',
      userId: 'open',
    });
  });

  it('meldet NONE ohne Treffer', () => {
    expect(pickCeviNameMatch([])).toEqual({ kind: 'NONE' });
  });
});
