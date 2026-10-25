'use client';

import { Check } from 'lucide-react';
import {
  DEPARTMENT_PERMISSION_KEYS,
  DEPARTMENT_PERMISSION_PRESETS,
  DEPARTMENT_PERMISSIONS,
  normalizePermissions,
  permissionPresetOf,
  type DepartmentPermission,
  type DepartmentPermissionPreset,
} from '@schichtplan/shared';
import { cn } from '@schichtplan/ui';

const GROUPS = [
  { key: 'DEPARTMENT', label: 'Abteilung' },
  { key: 'EVENTS', label: 'Anlässe (gilt für alle Anlässe der Abteilung)' },
] as const;

/** Rechte, die `p` voraussetzen (fallen weg, wenn man `p` entfernt) */
const dependentsOf = (p: DepartmentPermission) =>
  DEPARTMENT_PERMISSION_KEYS.filter((k) => k !== p && normalizePermissions([k]).includes(p));

/**
 * Darf jemand mit `grantable` diese Rechte vergeben? null = alles (Abteilungsleitung).
 * Sonst nur echte Teilmengen der eigenen Rechte, wie das Backend prüft.
 */
export function canGrant(grantable: ReadonlySet<DepartmentPermission> | null, next: readonly DepartmentPermission[]) {
  if (!grantable) return true;
  return next.every((p) => grantable.has(p)) && next.length < grantable.size;
}

/** Rechte einer Person: Vorlage wählen oder einzeln ankreuzen. Vorausgesetzte Rechte kommen automatisch dazu. */
export function PermissionEditor({
  value,
  onChange,
  grantable,
  disabled = false,
}: {
  value: DepartmentPermission[];
  onChange: (next: DepartmentPermission[]) => void;
  /** Was die angemeldete Person vergeben darf (null = alles) */
  grantable: ReadonlySet<DepartmentPermission> | null;
  disabled?: boolean;
}) {
  const current = normalizePermissions(value);
  const preset = permissionPresetOf(current);
  const set = (next: DepartmentPermission[]) => {
    const normalized = normalizePermissions(next);
    if (canGrant(grantable, normalized)) onChange(normalized);
  };
  const toggle = (p: DepartmentPermission, on: boolean) =>
    set(on ? [...current, p] : current.filter((x) => x !== p && !dependentsOf(p).includes(x)));

  const presets: { key: DepartmentPermissionPreset | null; label: string; permissions: readonly DepartmentPermission[] }[] = [
    { key: null, label: 'Keine Rechte', permissions: [] },
    ...(Object.entries(DEPARTMENT_PERMISSION_PRESETS) as [DepartmentPermissionPreset, (typeof DEPARTMENT_PERMISSION_PRESETS)[DepartmentPermissionPreset]][]).map(
      ([key, p]) => ({ key, label: p.label, permissions: p.permissions })
    ),
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold text-fg-subtle">Vorlage</p>
        <div role="radiogroup" aria-label="Vorlage für Rechte" className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const normalized = normalizePermissions(p.permissions);
            const active = p.key === null ? current.length === 0 : preset === p.key;
            return (
              <button
                key={p.key ?? 'none'}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled || !canGrant(grantable, normalized)}
                title={p.key ? DEPARTMENT_PERMISSION_PRESETS[p.key].description : 'Mitglied ohne besondere Rechte'}
                onClick={() => set(normalized)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                  active ? 'border-accent bg-accent/12 text-accent-ink' : 'border-line text-fg-muted hover:text-fg'
                )}
              >
                {p.label}
              </button>
            );
          })}
          {current.length > 0 && !preset && (
            <span className="inline-flex h-8 items-center rounded-full border border-accent bg-accent/12 px-3 text-xs font-semibold text-accent-ink">
              Eigene Rechte
            </span>
          )}
        </div>
        {preset && <p className="mt-2 text-xs text-fg-muted">{DEPARTMENT_PERMISSION_PRESETS[preset].description}</p>}
      </div>

      {GROUPS.map((group) => (
        <fieldset key={group.key}>
          <legend className="mb-1.5 text-xs font-semibold text-fg-subtle">{group.label}</legend>
          <ul className="space-y-1">
            {DEPARTMENT_PERMISSION_KEYS.filter((p) => DEPARTMENT_PERMISSIONS[p].group === group.key).map((p) => {
              const checked = current.includes(p);
              const next = checked ? current.filter((x) => x !== p && !dependentsOf(p).includes(x)) : normalizePermissions([...current, p]);
              const locked = disabled || !canGrant(grantable, next);
              return (
                <li key={p}>
                  <label
                    className={cn(
                      'flex items-start gap-2.5 rounded-field px-2 py-1.5',
                      locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-surface'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={(e) => toggle(p, e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 rounded border-line"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg">{DEPARTMENT_PERMISSIONS[p].label}</span>
                      <span className="block text-xs leading-snug text-fg-subtle">{DEPARTMENT_PERMISSIONS[p].description}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      {grantable && (
        <p className="flex items-start gap-1.5 text-2xs leading-normal text-fg-subtle">
          <Check className="mt-px size-3 shrink-0" /> Du kannst nur Rechte vergeben, die du selbst hast, und insgesamt
          weniger, als du selbst hast.
        </p>
      )}
    </div>
  );
}
