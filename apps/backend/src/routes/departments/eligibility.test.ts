import { describe, expect, it } from 'vitest';
import { departmentCreationEligibility } from './shared.js';
import type { PrismaClient } from '../../db.js';

describe('departmentCreationEligibility für Vereine und Verbände', () => {
  const vereinUser = {
    provider: 'CEVI',
    providerId: null,
    departmentLeader: false,
    leaderGroupIds: [],
    leaderGroupName: null,
    email: 'leiter@turnverein.ch',
    emailVerified: true,
    passwordHash: '$2a$10$hashedpassword',
  };
  const mockPrisma = (user: object | null, ledVereine = 0) =>
    ({
      user: { findUnique: async () => user },
      departmentMember: { count: async () => ledVereine },
    }) as unknown as PrismaClient;

  it('erlaubt Vereinserstellung für Benutzer mit bestätigter E-Mail bei organization = OTHER', async () => {
    const result = await departmentCreationEligibility(mockPrisma(vereinUser), 'user-1', 'OTHER');
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.provider).toBe('OTHER');
    expect(result.ortsgruppeId).toBeNull();
  });

  it('lehnt Vereinserstellung mit unbestätigter E-Mail ab', async () => {
    const result = await departmentCreationEligibility(mockPrisma({ ...vereinUser, emailVerified: false }), 'user-1', 'OTHER');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NOT_CEVIDB');
  });

  it('begrenzt auf 3 geleitete Vereine', async () => {
    expect((await departmentCreationEligibility(mockPrisma(vereinUser, 2), 'user-1', 'OTHER')).eligible).toBe(true);
    const result = await departmentCreationEligibility(mockPrisma(vereinUser, 3), 'user-1', 'OTHER');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('LIMIT');
  });

  it('erlaubt mit provider = OTHER ohne Vereins-Domain keine Erstellung', async () => {
    const result = await departmentCreationEligibility(mockPrisma({ ...vereinUser, provider: 'OTHER' }), 'user-1');
    expect(result.eligible).toBe(false);
  });

  it('lehnt eine Cevi.DB-Leitung auf der Pfadi-Domain ab (Gruppen-IDs überschneiden sich)', async () => {
    const ceviLeader = { ...vereinUser, providerId: '123', departmentLeader: true, leaderGroupIds: [42] };
    const result = await departmentCreationEligibility(mockPrisma(ceviLeader), 'user-1', 'PFADI');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NOT_CEVIDB');
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
