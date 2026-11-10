import { describe, expect, it } from 'vitest';
import { departmentCreationEligibility } from './shared.js';
import type { PrismaClient } from '../../db.js';

describe('departmentCreationEligibility für Vereine und Verbände', () => {
  it('erlaubt Vereinserstellung für Benutzer mit E-Mail & Passwort bei organization = OTHER', async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          provider: 'OTHER',
          providerId: null,
          departmentLeader: false,
          leaderGroupIds: [],
          leaderGroupName: null,
          email: 'leiter@turnverein.ch',
          emailVerified: true,
          passwordHash: '$2a$10$hashedpassword',
        }),
      },
    } as unknown as PrismaClient;

    const result = await departmentCreationEligibility(prisma, 'user-1', 'OTHER');
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.provider).toBe('OTHER');
    expect(result.ortsgruppeId).toBeNull();
  });

  it('erlaubt Vereinserstellung für Benutzer mit E-Mail & Passwort bei provider = OTHER auch ohne explizite Org', async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          provider: 'OTHER',
          providerId: null,
          departmentLeader: false,
          leaderGroupIds: [],
          leaderGroupName: null,
          email: 'leiter@turnverein.ch',
          emailVerified: false,
          passwordHash: '$2a$10$hashedpassword',
        }),
      },
    } as unknown as PrismaClient;

    const result = await departmentCreationEligibility(prisma, 'user-1');
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.provider).toBe('OTHER');
  });

  it('lehnt Vereinserstellung ab, wenn der Benutzer kein Passwort und keine verifizierte E-Mail hat', async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          provider: 'OTHER',
          providerId: null,
          departmentLeader: false,
          leaderGroupIds: [],
          leaderGroupName: null,
          email: null,
          emailVerified: false,
          passwordHash: null,
        }),
      },
    } as unknown as PrismaClient;

    const result = await departmentCreationEligibility(prisma, 'user-guest', 'OTHER');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NOT_CEVIDB');
  });

  it('lehnt Abteilungserstellung für Benutzer ohne Cevi.DB bei organization = CEVI weiterhin mit NOT_CEVIDB ab', async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          provider: 'CEVI',
          providerId: null,
          departmentLeader: false,
          leaderGroupIds: [],
          leaderGroupName: null,
          email: 'cevi@example.com',
          emailVerified: true,
          passwordHash: '$2a$10$hashedpassword',
        }),
      },
    } as unknown as PrismaClient;

    const result = await departmentCreationEligibility(prisma, 'user-cevi', 'CEVI');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NOT_CEVIDB');
  });
});
