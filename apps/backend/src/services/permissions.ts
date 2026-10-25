/**
 * Rechte in einer Abteilung und was daraus in einem Anlass folgt.
 *
 * - Abteilungsleitung (department_members.role = ADMIN) und globale Admins haben alle Rechte.
 * - Alle anderen haben die einzelnen Rechte aus department_members.permissions (Katalog in
 *   DEPARTMENT_PERMISSIONS, packages/shared/src/constants.ts).
 * - Im Anlass kommen die Rechte der OK-Rolle dazu (OK-Leitung / OK-Mitglied).
 * Gelesen wird immer aus der DB, nie aus dem Token.
 */
import type { PrismaClient } from '../db.js';
import {
  DEPARTMENT_PERMISSION_KEYS,
  EVENT_CAPABILITIES,
  normalizePermissions,
  type DepartmentPermission,
  type EventCapability,
} from '@schichtplan/shared';

export interface DepartmentAccess {
  isGlobalAdmin: boolean;
  /** Abteilungsleitung dieser Abteilung */
  isLeader: boolean;
  /** Abteilungsleitung oder globaler Admin: alle Rechte, darf alle Rechte vergeben */
  hasFullAccess: boolean;
  /** Wirksame Rechte */
  permissions: Set<DepartmentPermission>;
}

export const NO_ACCESS: DepartmentAccess = {
  isGlobalAdmin: false,
  isLeader: false,
  hasFullAccess: false,
  permissions: new Set(),
};

export function accessFrom(
  member: { role: string; permissions: string[] } | null | undefined,
  isGlobalAdmin: boolean
): DepartmentAccess {
  const isLeader = member?.role === 'ADMIN';
  const hasFullAccess = isLeader || isGlobalAdmin;
  return {
    isGlobalAdmin,
    isLeader,
    hasFullAccess,
    permissions: new Set(hasFullAccess ? DEPARTMENT_PERMISSION_KEYS : normalizePermissions(member?.permissions ?? [])),
  };
}

export async function departmentAccess(
  prisma: Pick<PrismaClient, 'user' | 'departmentMember'>,
  departmentId: string,
  userId: string | null | undefined
): Promise<DepartmentAccess> {
  if (!userId) return NO_ACCESS;
  const [user, member] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isGlobalAdmin: true } }),
    prisma.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
      select: { role: true, permissions: true },
    }),
  ]);
  if (!user) return NO_ACCESS;
  return accessFrom(member, user.isGlobalAdmin);
}

export async function hasDepartmentPermission(
  prisma: Pick<PrismaClient, 'user' | 'departmentMember'>,
  departmentId: string,
  userId: string | null | undefined,
  permission: DepartmentPermission
): Promise<boolean> {
  return (await departmentAccess(prisma, departmentId, userId)).permissions.has(permission);
}

/**
 * Darf `actor` die Rechte einer Person von `current` auf `next` ändern?
 * Abteilungsleitung und globale Admins: immer. Mit «Personen und Rechte verwalten»: nur bei Personen,
 * die weniger Rechte haben als man selbst, und nur auf weniger Rechte als man selbst (echte Teilmenge).
 * Sonst könnte man jemanden auf die eigene Stufe heben oder Gleichgestellten Rechte entziehen.
 */
export function canGrantPermissions(
  actor: DepartmentAccess,
  current: readonly string[],
  next: readonly string[] | null = null
): boolean {
  if (actor.hasFullAccess) return true;
  if (!actor.permissions.has('PEOPLE_MANAGE')) return false;
  const below = (list: readonly string[]) => {
    const normalized = normalizePermissions(list);
    return normalized.every((p) => actor.permissions.has(p)) && normalized.length < actor.permissions.size;
  };
  return below(current) && (next === null || below(next));
}

/** Abteilungsrecht hinter jeder Anlass-Fähigkeit (gilt dann für alle Anlässe der Abteilung) */
const CAPABILITY_PERMISSION: Record<EventCapability, DepartmentPermission> = {
  VIEW: 'EVENTS_VIEW_ALL',
  SETTINGS: 'EVENTS_EDIT_SETTINGS',
  SHIFTS: 'SHIFTS_MANAGE',
  HELPERS: 'HELPERS_MANAGE',
  MESSAGES: 'MESSAGES_SEND',
  ATTENDANCE: 'ATTENDANCE_MANAGE',
  EXPORT: 'EXPORT',
  ORGANIZERS: 'ORGANIZERS_MANAGE',
  TEMPLATES: 'TEMPLATES_MANAGE',
  DELETE: 'EVENTS_DELETE',
};

/** OK-Mitglieder planen den Anlass, die OK-Leitung ändert zusätzlich Einstellungen und das OK. Löschen nie. */
const OK_MEMBER_CAPABILITIES: EventCapability[] = ['VIEW', 'SHIFTS', 'HELPERS', 'MESSAGES', 'ATTENDANCE', 'EXPORT', 'TEMPLATES'];
const OK_LEAD_CAPABILITIES: EventCapability[] = [...OK_MEMBER_CAPABILITIES, 'SETTINGS', 'ORGANIZERS'];

export function eventCapabilities(access: DepartmentAccess, organizerRole: string | null | undefined): Set<EventCapability> {
  const caps = new Set<EventCapability>();
  for (const cap of EVENT_CAPABILITIES) {
    if (access.permissions.has(CAPABILITY_PERMISSION[cap])) caps.add(cap);
  }
  if (organizerRole === 'OK_LEAD') OK_LEAD_CAPABILITIES.forEach((c) => caps.add(c));
  else if (organizerRole) OK_MEMBER_CAPABILITIES.forEach((c) => caps.add(c));
  if (caps.size > 0) caps.add('VIEW');
  return caps;
}
