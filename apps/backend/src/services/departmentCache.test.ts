import { beforeEach, describe, expect, it, vi } from 'vitest';
import { departmentCache } from './departmentCache';

describe('departmentCache', () => {
  beforeEach(() => {
    departmentCache.clear();
  });

  it('cacht Abteilungen und ruft die Datenbank bei Folgeanfragen nicht erneut auf', async () => {
    const mockDept = { id: 'd1', name: 'Cevi Wetzikon', slug: 'wetzikon', organization: 'CEVI' } as any;
    const findUnique = vi.fn().mockResolvedValue(mockDept);
    const mockPrisma = { department: { findUnique } } as any;

    const first = await departmentCache.getDepartment(mockPrisma, 'CEVI', 'wetzikon');
    expect(first).toEqual(mockDept);
    expect(findUnique).toHaveBeenCalledTimes(1);

    const second = await departmentCache.getDepartment(mockPrisma, 'CEVI', 'wetzikon');
    expect(second).toEqual(mockDept);
    expect(findUnique).toHaveBeenCalledTimes(1); // Kein erneuter DB-Aufruf
  });

  it('invalidiert den Cache gezielt für eine Abteilung', async () => {
    const mockDept = { id: 'd1', name: 'Cevi Wetzikon', slug: 'wetzikon', organization: 'CEVI' } as any;
    const findUnique = vi.fn().mockResolvedValue(mockDept);
    const mockPrisma = { department: { findUnique } } as any;

    await departmentCache.getDepartment(mockPrisma, 'CEVI', 'wetzikon');
    expect(findUnique).toHaveBeenCalledTimes(1);

    departmentCache.invalidate('CEVI', 'wetzikon');

    await departmentCache.getDepartment(mockPrisma, 'CEVI', 'wetzikon');
    expect(findUnique).toHaveBeenCalledTimes(2); // Nach Invalidierung wieder aus DB geladen
  });

  it('cacht das Abteilungsverzeichnis pro Organisation', async () => {
    const mockList = [{ id: 'd1', name: 'Cevi Wetzikon', slug: 'wetzikon' }] as any;
    const findMany = vi.fn().mockResolvedValue(mockList);
    const mockPrisma = { department: { findMany } } as any;

    const first = await departmentCache.getDirectory(mockPrisma, 'CEVI');
    expect(first).toEqual(mockList);
    expect(findMany).toHaveBeenCalledTimes(1);

    const second = await departmentCache.getDirectory(mockPrisma, 'CEVI');
    expect(second).toEqual(mockList);
    expect(findMany).toHaveBeenCalledTimes(1);

    departmentCache.invalidate('CEVI');
    await departmentCache.getDirectory(mockPrisma, 'CEVI');
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
