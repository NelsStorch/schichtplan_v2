'use client';

import { useCallback, useEffect, useState } from 'react';
import { Crown, Database, Pencil, UserMinus } from 'lucide-react';
import {
  STUFE_ROLES,
  type DepartmentPersonDto,
  type DepartmentStufeDto,
  type StufeRole,
} from '@schichtplan/shared';
import { Badge, Button, Callout, EmptyState, Input, Skeleton, cn, useConfirm, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { usePortal } from '@/lib/portal';

const ROLE_LABELS = { HELPER: 'Helfer*in', PLANNER: 'Planung', ADMIN: 'Abteilungsleitung' } as const;
type DeptRole = keyof typeof ROLE_LABELS;

const ROLE_DESCRIPTIONS: Record<DeptRole, string> = {
  ADMIN: 'Volle Administrationsrechte für die Abteilung (Einstellungen, Logo, Stufen, Personen und alle Anlässe).',
  PLANNER: 'Darf neue Anlässe erstellen und hat in allen Events der Abteilung automatisch Planungs- und OK-Rechte.',
  HELPER: 'Normales Abteilungsmitglied. Berechtigungen zum Planen von Schichten werden pro Anlass im jeweiligen OK-Team vergeben.',
};

/** Personen der Abteilung: Stufen und Rolle bearbeiten, Abteilungsleitung erkennen. */
export function DepartmentPeoplePanel() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = usePortal();
  const [people, setPeople] = useState<DepartmentPersonDto[] | null>(null);
  const [stufen, setStufen] = useState<DepartmentStufeDto[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([
        api<DepartmentPersonDto[]>('/api/departments/current/people'),
        api<DepartmentStufeDto[]>('/api/departments/current/stufen'),
      ]);
      setPeople(list);
      setStufen(st);
    } catch (err) {
      toast({ title: 'Personen konnten nicht geladen werden', description: errorMessage(err), tone: 'error' });
      setPeople([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (person: DepartmentPersonDto) => {
    const ok = await confirm({
      title: `${person.ceviName || person.firstName} entfernen?`,
      description: 'Die Person gehört danach nicht mehr zur Abteilung und wird beim nächsten Login erneut gefragt.',
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

  if (people === null) return <Skeleton className="h-40 rounded-card" />;
  const q = query.trim().toLowerCase();
  const visible = q ? people.filter((p) => p.displayName.toLowerCase().includes(q)) : people;
  const leaders = people.filter((p) => p.departmentRole === 'ADMIN' || p.isCeviDbDepartmentLeader);

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-muted">
        {people.length} Personen. Selbst angegebene Zuordnungen gelten sofort, Stufen und Rollen kannst du anpassen.
        Angaben aus Cevi.DB sind fest.
      </p>
      {leaders.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <Crown className="size-3.5 text-accent-ink" /> Abteilungsleitung:
          <span className="font-semibold text-fg">{leaders.map((p) => p.ceviName || p.firstName).join(', ')}</span>
        </p>
      )}
      {people.length > 8 && (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Person suchen"
          aria-label="Person suchen"
          className="h-10"
        />
      )}
      {visible.length === 0 ? (
        <EmptyState title="Noch niemand" description="Personen erscheinen hier, sobald sie beim Login diese Abteilung angeben." />
      ) : (
        <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-card border border-line">
          {visible.map((p) => (
            <li key={p.userId} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg">
                    <span className="truncate">{p.displayName}</span>
                    {p.departmentRole === 'ADMIN' && (
                      <Badge size="sm" tone="accent">
                        <Crown className="size-3" /> Abteilungsleitung
                      </Badge>
                    )}
                    {p.departmentRole === 'PLANNER' && <Badge size="sm">Planung</Badge>}
                    {p.isCeviDbDepartmentLeader && p.departmentRole !== 'ADMIN' && (
                      <Badge size="sm" tone="warning" title="In Cevi.DB Abteilungsleitung, im Schichtplan noch nicht">
                        <Crown className="size-3" /> AL laut Cevi.DB
                      </Badge>
                    )}
                    {p.source === 'CEVIDB' && (
                      <Badge size="sm">
                        <Database className="size-3" /> Cevi.DB
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
                </div>
                <Button
                  size="sm"
                  variant={editing === p.userId ? 'primary' : 'ghost'}
                  onClick={() => setEditing(editing === p.userId ? null : p.userId)}
                  aria-expanded={editing === p.userId}
                  aria-label={`${p.displayName} bearbeiten`}
                >
                  <Pencil /> <span className="hidden sm:inline">Bearbeiten</span>
                </Button>
              </div>
              {editing === p.userId && (
                <PersonEditor
                  person={p}
                  stufen={stufen}
                  isSelf={user?.id === p.userId}
                  onCancel={() => setEditing(null)}
                  onRemove={() => remove(p)}
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

function PersonEditor({
  person,
  stufen,
  isSelf,
  onCancel,
  onRemove,
  onSaved,
}: {
  person: DepartmentPersonDto;
  stufen: DepartmentStufeDto[];
  isSelf: boolean;
  onCancel: () => void;
  onRemove: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<Record<string, StufeRole>>(
    Object.fromEntries(person.stufen.map((s) => [s.stufeId, s.role]))
  );
  const [deptRole, setDeptRole] = useState<DeptRole>(person.departmentRole ?? 'HELPER');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = new Set(person.stufen.filter((s) => s.source === 'CEVIDB').map((s) => s.stufeId));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/departments/current/people/${person.userId}`, {
        method: 'PATCH',
        json: {
          departmentRole: deptRole,
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
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-fg-subtle">Rolle in der Abteilung</p>
          <span className="text-2xs text-fg-subtle">Gilt abteilungsweit</span>
        </div>
        <div role="radiogroup" aria-label="Rolle in der Abteilung" className="flex flex-wrap gap-1.5">
          {(Object.keys(ROLE_LABELS) as DeptRole[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={deptRole === r}
              // Die eigene Abteilungsleitung kann man nicht selbst entziehen
              disabled={isSelf && person.departmentRole === 'ADMIN' && r !== 'ADMIN'}
              onClick={() => setDeptRole(r)}
              className={cn(
                'h-8 rounded-full border px-3 text-xs font-semibold transition disabled:opacity-40',
                deptRole === r ? 'border-accent bg-accent/12 text-accent-ink' : 'border-line text-fg-muted hover:text-fg'
              )}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">
          {ROLE_DESCRIPTIONS[deptRole]}
        </p>
        <div className="mt-2.5 rounded-card border border-line/60 bg-surface/60 p-2 text-2xs leading-normal text-fg-subtle">
          💡 <strong>Hinweis:</strong> Wer Schichten für einen bestimmten Anlass (z. B. Chilbi) planen darf, wird unabhängig von dieser Rolle direkt im jeweiligen Event unter <em>Einstellungen → OK-Team</em> festgelegt.
        </div>
      </div>

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
        {person.isHomeDepartment && person.source === 'SELF' ? (
          <Button size="sm" variant="ghost" onClick={onRemove} className="hover:text-danger-ink">
            <UserMinus /> Aus Abteilung entfernen
          </Button>
        ) : (
          <span />
        )}
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
