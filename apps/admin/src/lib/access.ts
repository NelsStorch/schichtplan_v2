/**
 * Zugang einer Person in einer Abteilung als eine Auswahl: Abteilungsleitung, eine Rechte-Vorlage,
 * «Mitglied ohne Rechte» oder (nur Anzeige) «Eigene Rechte». Gespeichert werden Rolle + einzelne Rechte.
 */
import {
  DEPARTMENT_PERMISSION_PRESETS,
  departmentRoleLabel,
  normalizePermissions,
  permissionPresetOf,
  type DepartmentPermission,
  type DepartmentPermissionPreset,
} from '@schichtplan/shared';

export const CUSTOM_ACCESS = 'CUSTOM';

export const ACCESS_OPTIONS: { value: string; label: string; needsAccount: boolean }[] = [
  { value: 'ADMIN', label: 'Abteilungsleitung', needsAccount: true },
  ...(Object.entries(DEPARTMENT_PERMISSION_PRESETS) as [DepartmentPermissionPreset, { label: string }][]).map(
    ([key, preset]) => ({ value: key, label: preset.label, needsAccount: true })
  ),
  { value: 'HELPER', label: 'Mitglied ohne Rechte', needsAccount: false },
];

/** Wert der Auswahl für eine bestehende Mitgliedschaft */
export function accessValue(role: string | null, permissions: readonly string[]): string {
  if (!role) return '';
  if (role === 'ADMIN') return 'ADMIN';
  if (normalizePermissions(permissions).length === 0) return 'HELPER';
  return permissionPresetOf(permissions) ?? CUSTOM_ACCESS;
}

/** Was an PUT /api/admin/departments/:id/members/:userId geht */
export function accessPayload(value: string): { role: 'ADMIN' | 'HELPER'; permissions: DepartmentPermission[] } {
  if (value === 'ADMIN') return { role: 'ADMIN', permissions: [] };
  if (value in DEPARTMENT_PERMISSION_PRESETS) {
    return {
      role: 'HELPER',
      permissions: [...DEPARTMENT_PERMISSION_PRESETS[value as DepartmentPermissionPreset].permissions],
    };
  }
  return { role: 'HELPER', permissions: [] };
}

export function accessLabel(role: string | null, permissions: readonly string[], isHome = true): string {
  if (!role) return isHome ? 'Nur Heimabteilung' : 'Keine';
  return departmentRoleLabel({ isLeader: role === 'ADMIN', permissions, isHomeDepartment: isHome });
}
