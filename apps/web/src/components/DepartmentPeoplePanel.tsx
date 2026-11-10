'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Check, Crown, Database, LayoutList, Pencil, Table2, UserMinus } from 'lucide-react';
import {
  DEPARTMENT_PERMISSION_KEYS,
  DEPARTMENT_PERMISSIONS,
  STUFE_ROLES,
  departmentRoleLabel,
  formatZurichDate,
  getOrganization,
  type DepartmentPermission,
  type DepartmentPersonDto,
  type DepartmentStufeDto,
  type StufeRole,
} from '@schichtplan/shared';
import { Badge, Button, Callout, EmptyState, Input, Skeleton, cn, useConfirm, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import { PermissionEditor } from './PermissionEditor';

const roleLabel = (p: DepartmentPersonDto) =>
  departmentRoleLabel({ isLeader: p.departmentRole === 'ADMIN', permissions: p.permissions, isHomeDepartment: p.isHomeDepartment });

/** Personen der Abteilung: Rechte und Stufen bearbeiten, Übersicht wer was darf. */
export function DepartmentPeoplePanel() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user, isDeptAdmin, permissions } = usePortal();
  const [people, setPeople] = useState<DepartmentPersonDto[] | null>(null);
  const [stufen, setStufen] = useState<DepartmentStufeDto[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [withGuests, setWithGuests] = useState(false);
  const [view, setView] = useState<'list' | 'matrix'>('list');

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([
        api<DepartmentPersonDto[]>(`/api/departments/current/people${withGuests ? '?alle=1' : ''}`),
        api<DepartmentStufeDto[]>('/api/departments/current/stufen'),
      ]);
      setPeople(list);
      setStufen(st);
    } catch (err) {
      toast({ title: 'Personen konnten nicht geladen werden', description: errorMessage(err), tone: 'error' });
      setPeople([]);
    }
  }, [toast, withGuests]);

  useEffect(() => {
    load();
  }, [load]);

  const org = useMemo(() => getOrganization(typeof window !== 'undefined' ? window.location.host : 'cevi-schichtplan.ch'), []);

  // Was ich vergeben darf: Abteilungsleitung alles (null), sonst nur weniger als die eigenen Rechte
  const grantable = useMemo(() => (isDeptAdmin ? null : new Set(permissions)), [isDeptAdmin, permissions]);

  const remove = async (person: DepartmentPersonDto) => {
    const ok = await confirm({
      title: `${person.nickname || person.ceviName || person.firstName} entfernen?`,
      description:
        `Die Person gehört danach nicht mehr zur ${org.unitTerm}, verliert ihre Rechte hier und wird beim nächsten Login erneut gefragt.`,
      confirmLabel: 'Entfernen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/departments/current/people/${person.userId}`, { method: 'DELETE' });
      setEditing(null);
      await load();
    } catch (err) {
      toast({ title: 'Entfernen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    }
  };

  const confirmHome = async (person: DepartmentPersonDto) => {
    const name = person.nickname || person.ceviName || person.firstName;
    const ok = await confirm({
      title: `${name} bestätigen?`,
      description:
        `Die Person gehört laut dir zu eurer ${org.unitTerm} und zählt danach auch bei internen Anlässen. Das steht im Protokoll.`,
      confirmLabel: 'Bestätigen',
    });
    if (!ok) return;
    try {
      await api(`/api/departments/current/people/${person.userId}/confirm`, { method: 'POST', json: {} });
      toast({ title: `${name} bestätigt` });
      await load();
    } catch (err) {
      toast({ title: 'Bestätigen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    }
  };

  const unconfirmHome = async (person: DepartmentPersonDto) => {
    try {
      await api(`/api/departments/current/people/${person.userId}/confirm`, { method: 'DELETE' });
      setEditing(null);
      await load();
    } catch (err) {
      toast({ title: 'Aufheben hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    }
  };

  if (people === null) return <Skeleton className="h-40 rounded-card" />;
  const q = query.trim().toLowerCase();
  const visible = q ? people.filter((p) => p.displayName.toLowerCase().includes(q)) : people;
  const leaders = people.filter((p) => p.departmentRole === 'ADMIN');
  const missingLeaders = people.filter((p) => p.isCeviDbDepartmentLeader && p.departmentRole !== 'ADMIN');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">
          {people.length} Personen. Abteilungsleitung kommt aus Cevi.DB, Rechte vergibst du hier.
        </p>
        <div role="tablist" aria-label="Ansicht" className="flex rounded-full bg-surface-2 p-0.5">
          {(
            [
              { key: 'list', label: 'Liste', icon: LayoutList },
              { key: 'matrix', label: 'Wer darf was', icon: Table2 },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition',
                view === v.key ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
              )}
            >
              <v.icon className="size-3.5" /> {v.label}
            </button>
          ))}
        </div>
      </div>

      {leaders.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <Crown className="size-3.5 text-accent-ink" /> {org.unitTerm}-Leitung:
          <span className="font-semibold text-fg">{leaders.map((p) => p.nickname || p.ceviName || p.firstName).join(', ')}</span>
        </p>
      )}
      {missingLeaders.length > 0 && (
        <p className="text-xs text-warning-ink">
          In {org.authProviderShort} Leitung, hier noch nicht: {missingLeaders.map((p) => p.nickname || p.ceviName || p.firstName).join(', ')}.
          Das wird beim nächsten {org.authProviderShort}-Login der Person nachgeführt.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {people.length > 8 && (
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Person suchen"
            aria-label="Person suchen"
            className="h-10 min-w-48 flex-1"
          />
        )}
        <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={withGuests}
            onChange={(e) => setWithGuests(e.target.checked)}
            className="size-4 rounded border-line"
          />
          Gäste anzeigen (ohne Heimabteilung, z. B. um ihnen Rechte zu geben)
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Noch niemand" description="Personen erscheinen hier, sobald sie beim Login diese Abteilung angeben." />
      ) : view === 'matrix' ? (
        <PermissionMatrix people={visible} />
      ) : (
        <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-card border border-line">
          {visible.map((p) => (
            <li key={p.userId} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg">
                    <span className="truncate">{p.displayName}</span>
                    <Badge size="sm" tone={p.departmentRole === 'ADMIN' ? 'accent' : 'neutral'}>
                      {p.departmentRole === 'ADMIN' && <Crown className="size-3" />} {roleLabel(p)}
                    </Badge>
                    {p.source === 'CEVIDB' && (
                      <Badge size="sm">
                        <Database className="size-3" /> Cevi.DB
                      </Badge>
                    )}
                    {p.source === 'CONFIRMED' && (
                      <Badge size="sm">
                        <BadgeCheck className="size-3" /> Bestätigt
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-fg-subtle">
                    {!p.isHomeDepartment
                      ? 'Andere oder keine Heimabteilung'
                      : p.stufen.length
                        ? p.stufen.map((s) => `${s.name} (${STUFE_ROLES[s.role]})`).join(', ')
                        : 'Keine Stufe'}
                  </p>
                  {p.source === 'CONFIRMED' && (
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      Von Hand bestätigt{p.confirmedBy ? ` von ${p.confirmedBy}` : ''}
                      {p.confirmedAt ? ` am ${formatZurichDate(p.confirmedAt)}` : ''}, nicht aus Cevi.DB
                    </p>
                  )}
                </div>
                {p.canConfirmHome && (
                  <Button size="sm" variant="ghost" onClick={() => confirmHome(p)} aria-label={`${p.displayName} bestätigen`}>
                    <BadgeCheck /> <span className="hidden sm:inline">Bestätigen</span>
                  </Button>
                )}
                {p.canEdit && (
                  <Button
                    size="sm"
                    variant={editing === p.userId ? 'primary' : 'ghost'}
                    onClick={() => setEditing(editing === p.userId ? null : p.userId)}
                    aria-expanded={editing === p.userId}
                    aria-label={`${p.displayName} bearbeiten`}
                  >
                    <Pencil /> <span className="hidden sm:inline">Bearbeiten</span>
                  </Button>
                )}
              </div>
              {editing === p.userId && (
                <PersonEditor
                  person={p}
                  stufen={stufen}
                  grantable={grantable}
                  isSelf={user?.id === p.userId}
                  onCancel={() => setEditing(null)}
                  onRemove={() => remove(p)}
                  onUnconfirm={isDeptAdmin && p.source === 'CONFIRMED' ? () => unconfirmHome(p) : undefined}
                  onSaved={async () => {
                    setEditing(null);
                    toast({ title: `${p.ceviName || p.firstName} gespeichert` });
                    await load();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Übersicht: Personen mit Rechten (Zeilen) und Rechte (Spalten) */
function PermissionMatrix({ people }: { people: DepartmentPersonDto[] }) {
  const rows = people.filter((p) => p.departmentRole === 'ADMIN' || p.permissions.length > 0);
  if (rows.length === 0) {
    return <EmptyState title="Noch niemand mit Rechten" description="Ausser der Abteilungsleitung hat niemand besondere Rechte." />;
  }
  return (
    <div className="max-h-[28rem] overflow-auto rounded-card border border-line">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold text-fg-subtle">
              Person
            </th>
            {DEPARTMENT_PERMISSION_KEYS.map((perm) => (
              <th key={perm} scope="col" className="px-1 py-2 align-bottom font-semibold text-fg-subtle">
                <span
                  title={DEPARTMENT_PERMISSIONS[perm].description}
                  className="mx-auto block max-h-52 rotate-180 whitespace-nowrap [writing-mode:vertical-rl]"
                >
                  {DEPARTMENT_PERMISSIONS[perm].label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((p) => {
            const isLeader = p.departmentRole === 'ADMIN';
            const has = new Set<DepartmentPermission>(p.permissions);
            return (
              <tr key={p.userId}>
                <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal">
                  <span className="block max-w-40 truncate font-semibold text-fg">{p.ceviName || p.firstName}</span>
                  <span className="block text-2xs text-fg-subtle">{roleLabel(p)}</span>
                </th>
                {DEPARTMENT_PERMISSION_KEYS.map((perm) => (
                  <td key={perm} className="px-1 py-2 text-center">
                    {isLeader || has.has(perm) ? (
                      <Check
                        className={cn('mx-auto size-4', isLeader ? 'text-fg-subtle' : 'text-accent-ink')}
                        aria-label={`${DEPARTMENT_PERMISSIONS[perm].label}: ja`}
                      />
                    ) : (
                      <span className="text-fg-subtle/40" aria-label={`${DEPARTMENT_PERMISSIONS[perm].label}: nein`}>
                        ·
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PersonEditor({
  person,
  stufen,
  grantable,
  isSelf,
  onCancel,
  onRemove,
  onUnconfirm,
  onSaved,
}: {
  person: DepartmentPersonDto;
  stufen: DepartmentStufeDto[];
  grantable: ReadonlySet<DepartmentPermission> | null;
  isSelf: boolean;
  onCancel: () => void;
  onRemove: () => void;
  onUnconfirm?: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<Record<string, StufeRole>>(
    Object.fromEntries(person.stufen.map((s) => [s.stufeId, s.role]))
  );
  const [perms, setPerms] = useState<DepartmentPermission[]>(person.permissions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = new Set(person.stufen.filter((s) => s.source === 'CEVIDB').map((s) => s.stufeId));
  const isLeader = person.departmentRole === 'ADMIN';
  const canHaveRights = !isLeader && !person.isCeviNameProfile;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/departments/current/people/${person.userId}`, {
        method: 'PATCH',
        json: {
          permissions: canHaveRights ? perms : undefined,
          stufen: person.isHomeDepartment
            ? Object.entries(roles).map(([stufeId, role]) => ({ stufeId, role }))
            : undefined,
        },
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-4 rounded-field border border-line bg-surface-2/60 p-3">
      {error && <Callout tone="danger">{error}</Callout>}
      {isLeader ? (
        <p className="text-xs leading-relaxed text-fg-muted">
          <Crown className="mr-1 inline size-3.5 text-accent-ink" />
          Abteilungsleitung {person.leaderSource === 'CEVIDB' ? 'laut Cevi.DB' : 'vom Admin-Portal'}: hat alle Rechte.
          Das ändert sich nur über die Rolle in Cevi.DB oder im Admin-Portal.
        </p>
      ) : person.isCeviNameProfile ? (
        <p className="text-xs leading-relaxed text-warning-ink">
          Nur Cevi-Name-Profil (ohne Passwort): bekommt keine Rechte. Dafür braucht die Person ein Konto mit Cevi.DB
          oder mit E-Mail und Passwort.
        </p>
      ) : (
        <div>
          <p className="mb-2 text-xs font-semibold text-fg-subtle">Rechte in der Abteilung</p>
          <PermissionEditor value={perms} onChange={setPerms} grantable={isSelf ? new Set() : grantable} />
          <div className="mt-3 rounded-card border border-line/60 bg-surface/60 p-2 text-2xs leading-normal text-fg-subtle">
            💡 Wer nur bei einem einzelnen Anlass mitplant, kommt besser ins OK-Team dieses Anlasses (Anlass →
            Einstellungen → OK-Team) statt hier Rechte für alle Anlässe zu bekommen.
          </div>
        </div>
      )}

      {person.isHomeDepartment && stufen.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-fg-subtle">Stufen</p>
          <ul className="space-y-1.5">
            {stufen.map((stufe) => {
              const isLocked = locked.has(stufe.id);
              const current = roles[stufe.id] ?? null;
              return (
                <li key={stufe.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-fg">
                    {stufe.name}
                    {isLocked && <span className="ml-1.5 text-xs text-fg-subtle">aus Cevi.DB</span>}
                  </span>
                  <div role="radiogroup" aria-label={`Rolle in ${stufe.name}`} className="flex rounded-full bg-surface p-0.5">
                    {([null, 'TEILNEHMER', 'LEITUNG'] as const).map((value) => (
                      <button
                        key={value ?? 'none'}
                        type="button"
                        role="radio"
                        aria-checked={current === value}
                        disabled={isLocked}
                        onClick={() =>
                          setRoles((prev) => {
                            const next = { ...prev };
                            if (value) next[stufe.id] = value;
                            else delete next[stufe.id];
                            return next;
                          })
                        }
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                          current === value ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg'
                        )}
                      >
                        {value ? STUFE_ROLES[value] : 'Nein'}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex flex-wrap gap-2">
          {person.isHomeDepartment && person.source !== 'CEVIDB' && !isLeader && (
            <Button size="sm" variant="ghost" onClick={onRemove} className="hover:text-danger-ink">
              <UserMinus /> Aus Abteilung entfernen
            </Button>
          )}
          {onUnconfirm && (
            <Button size="sm" variant="ghost" onClick={onUnconfirm}>
              Bestätigung aufheben
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}
