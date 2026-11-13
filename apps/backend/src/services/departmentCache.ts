import type { PrismaClient, Department, OrganizationType } from '../db.js';
import type { DepartmentDirectoryItemDto, DepartmentJoinMode } from '@schichtplan/shared';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000; // 60 Sekunden

class DepartmentCache {
  private departmentMap = new Map<string, CacheEntry<Department | null>>();
  private directoryMap = new Map<OrganizationType, CacheEntry<DepartmentDirectoryItemDto[]>>();

  private deptKey(org: OrganizationType, slug: string): string {
    return `${org}:${slug.toLowerCase()}`;
  }

  async getDepartment(
    prisma: PrismaClient,
    org: OrganizationType,
    slug: string,
    ttlMs = DEFAULT_TTL_MS
  ): Promise<Department | null> {
    const key = this.deptKey(org, slug);
    const now = Date.now();
    const cached = this.departmentMap.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const dept = await prisma.department.findUnique({
      where: { organization_slug: { organization: org, slug: slug.toLowerCase() } },
    });

    if (this.departmentMap.size > 2000) {
      this.departmentMap.clear();
    }

    this.departmentMap.set(key, { value: dept, expiresAt: now + ttlMs });
    return dept;
  }

  async getDirectory(
    prisma: PrismaClient,
    org: OrganizationType,
    ttlMs = DEFAULT_TTL_MS
  ): Promise<DepartmentDirectoryItemDto[]> {
    const now = Date.now();
    const cached = this.directoryMap.get(org);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const list = await prisma.department.findMany({
      where: { organization: org },
      select: {
        id: true,
        name: true,
        slug: true,
        organization: true,
        logoUrl: true,
        allowPasswordless: true,
        joinMode: true,
        stufen: { select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
      orderBy: { name: 'asc' },
    });

    const mapped: DepartmentDirectoryItemDto[] = list.map((d) => ({
      ...d,
      joinMode: (d.joinMode as DepartmentJoinMode) || 'LINK_ONLY',
    }));

    this.directoryMap.set(org, { value: mapped, expiresAt: now + ttlMs });
    return mapped;
  }

  invalidate(org?: OrganizationType, slug?: string): void {
    if (org && slug) {
      this.departmentMap.delete(this.deptKey(org, slug));
      this.directoryMap.delete(org);
    } else if (org) {
      this.directoryMap.delete(org);
      for (const key of this.departmentMap.keys()) {
        if (key.startsWith(`${org}:`)) this.departmentMap.delete(key);
      }
    } else {
      this.departmentMap.clear();
      this.directoryMap.clear();
    }
  }

  clear(): void {
    this.departmentMap.clear();
    this.directoryMap.clear();
  }
}

export const departmentCache = new DepartmentCache();
