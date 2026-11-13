import { describe, expect, it, vi } from 'vitest';
import { checkDepartmentJoin } from './departmentJoin.js';

function makePrisma(dept: {
  id: string;
  joinMode: string;
  inviteToken?: string | null;
  organization?: string;
} | null) {
  return {
    department: {
      findUnique: vi.fn().mockResolvedValue(
        dept
          ? {
              inviteToken: null,
              organization: 'CEVI',
              ...dept,
            }
          : null
      ),
    },
    departmentMember: {
      count: vi.fn().mockResolvedValue(0),
    },
    eventOrganizer: {
      count: vi.fn().mockResolvedValue(0),
    },
  } as any;
}

describe('checkDepartmentJoin', () => {
  it('blockiert E-Mail-Konten bei LINK_ONLY ohne Abteilungs-Link', async () => {
    const prisma = makePrisma({ id: 'dept-1', joinMode: 'LINK_ONLY', organization: 'CEVI' });
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: 'hash', providerId: null, provider: 'CEVI' },
      departmentId: 'dept-1',
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'LINK_REQUIRED' });
  });

  it('erlaubt E-Mail-Konten bei LINK_ONLY mit viaLink', async () => {
    const prisma = makePrisma({ id: 'dept-1', joinMode: 'LINK_ONLY', organization: 'CEVI' });
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: 'hash', providerId: null, provider: 'CEVI' },
      departmentId: 'dept-1',
      viaLink: true,
    });
    expect(res).toEqual({ ok: true, invited: false, grantedPermissions: [] });
  });

  it('erlaubt Verbands-Konten (Cevi.DB/Hitobito) bei LINK_ONLY auch ohne Abteilungs-Link', async () => {
    const prisma = makePrisma({ id: 'dept-1', joinMode: 'LINK_ONLY', organization: 'CEVI' });
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: null, providerId: '101', provider: 'CEVI' },
      departmentId: 'dept-1',
    });
    expect(res).toEqual({ ok: true, invited: false, grantedPermissions: [] });
  });

  it('blockiert bei INVITE_ONLY ohne gültigen Einladungs-Token auch Verbands-Konten', async () => {
    const prisma = makePrisma({ id: 'dept-1', joinMode: 'INVITE_ONLY', organization: 'CEVI' });
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: null, providerId: '101', provider: 'CEVI' },
      departmentId: 'dept-1',
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'INVITE_REQUIRED' });
  });
});
