'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Database, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  type DepartmentStufeDto,
  type StufeSuggestionDto,
} from '@schichtplan/shared';
import { Badge, Button, Callout, EmptyState, Input, Skeleton, useConfirm, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';

/** Stufen der Abteilung pflegen. Mit Cevi.DB-Gruppe verknüpfte Stufen werden Cevi.DB-Personen automatisch zugeordnet. */
export function DepartmentStufenPanel() {
  const toast = useToast();
  const confirm = useConfirm();
  const [stufen, setStufen] = useState<DepartmentStufeDto[] | null>(null);
  const [suggestions, setSuggestions] = useState<StufeSuggestionDto[]>([]);
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, sugg] = await Promise.all([
      api<DepartmentStufeDto[]>('/api/departments/current/stufen'),
      api<StufeSuggestionDto[]>('/api/departments/current/stufen/suggestions').catch(() => []),
    ]);
    setStufen(list);
    setSuggestions(sugg);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err)));
  }, [load]);

  const create = async (input: { name: string; ceviDbGroupId?: number | null }) => {
    setSaving(true);
    setError(null);
    try {
      await api('/api/departments/current/stufen', { method: 'POST', json: input });
      await load();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = groupId.trim() ? Number(groupId.trim()) : null;
    if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)) {
      setError('Die Cevi.DB-Gruppen-ID ist eine Zahl, z. B. 1234.');
      return;
    }
    if (await create({ name: name.trim(), ceviDbGroupId: parsed })) {
      setName('');
      setGroupId('');
    }
  };

  const rename = async (stufe: DepartmentStufeDto, nextName: string) => {
    if (!nextName.trim() || nextName.trim() === stufe.name) return;
    try {
      await api(`/api/departments/current/stufen/${stufe.id}`, { method: 'PATCH', json: { name: nextName.trim() } });
      await load();
    } catch (err) {
      toast({ title: 'Umbenennen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    }
  };

  const remove = async (stufe: DepartmentStufeDto) => {
    const ok = await confirm({
      title: `Stufe «${stufe.name}» löschen?`,
      description: 'Personen verlieren diese Stufe, Anlässe mit diesem Stufen-Filter verlieren den Filter.',
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/departments/current/stufen/${stufe.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast({ title: 'Löschen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    }
  };

  if (stufen === null) return error ? <Callout tone="danger">{error}</Callout> : <Skeleton className="h-40 rounded-card" />;

  return (
    <div className="space-y-6">
      {error && <Callout tone="danger">{error}</Callout>}

      {suggestions.length > 0 && (
        <div className="rounded-card border border-accent/25 bg-accent/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Sparkles className="size-4 text-accent-ink" /> Vorschläge aus Cevi.DB
          </p>
          <p className="mt-1 text-xs text-fg-muted">Stufen, in denen Mitglieder dieser Abteilung laut Cevi.DB eine Rolle haben.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.ceviDbGroupId}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => create({ name: s.name, ceviDbGroupId: s.ceviDbGroupId })}
                >
                  <Plus /> {s.name}
                  <span className="text-xs font-normal text-fg-subtle">{s.personCount} Pers.</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stufen.length === 0 ? (
        <EmptyState title="Noch keine Stufen" description="Lege die Stufen deiner Abteilung an, z. B. Fröschli, Jungschi, Leiterteam." />
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line">
          {stufen.map((stufe) => (
            <li key={stufe.id} className="flex items-center gap-3 px-3 py-2">
              <Input
                defaultValue={stufe.name}
                aria-label={`Name der Stufe ${stufe.name}`}
                onBlur={(e) => rename(stufe, e.target.value)}
                className="h-10 flex-1 border-transparent bg-transparent px-2 hover:border-line"
              />
              {stufe.ceviDbGroupId !== null && (
                <Badge size="sm" title="Mit Cevi.DB-Gruppe verknüpft">
                  <Database className="size-3" /> {stufe.ceviDbGroupId}
                </Badge>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => remove(stufe)}
                aria-label={`Stufe ${stufe.name} löschen`}
                className="hover:text-danger-ink"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Neue Stufe, z. B. Hiskia"
          aria-label="Name der neuen Stufe"
          minLength={2}
          className="h-10"
        />
        <Input
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          inputMode="numeric"
          placeholder="Cevi.DB-ID"
          aria-label="Cevi.DB-Gruppen-ID (optional)"
          className="h-10"
        />
        <Button type="submit" size="sm" className="h-10" loading={saving} disabled={name.trim().length < 2}>
          <Plus /> Hinzufügen
        </Button>
      </form>
      <p className="-mt-3 text-xs text-fg-subtle">
        Cevi.DB-ID optional: die Nummer der Stufen-Gruppe in db.cevi.ch. Stufen aus Cevi.DB werden automatisch angelegt und verknüpft.
      </p>
    </div>
  );
}

