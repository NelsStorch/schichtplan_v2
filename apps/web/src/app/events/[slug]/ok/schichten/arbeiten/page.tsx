'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Edit, Info, Plus, Trash2, Wrench } from 'lucide-react';
import type { TaskDefinitionDto } from '@schichtplan/shared';
import { Badge, Button, Callout, Card, EmptyState, Skeleton, useConfirm, useToast } from '@schichtplan/ui';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { TaskDefinitionDialog } from '@/components/ok/TaskDefinitionDialog';
import { api, errorMessage } from '@/lib/api';

export default function TaskCatalogPage() {
  const { event, base } = useOkEvent();
  const toast = useToast();
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<TaskDefinitionDto[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDefinitionDto | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await api<TaskDefinitionDto[]>('/api/tasks'));
    } catch (err) {
      setTasks([]);
      toast({ title: 'Katalog konnte nicht geladen werden', description: errorMessage(err), tone: 'error' });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (td: TaskDefinitionDto, usedIn: number) => {
    if (usedIn > 0) {
      toast({
        title: 'Arbeit in Schichten verbaut',
        description: `«${td.title}» wird aktuell in ${usedIn} Schicht(en) dieses Anlasses verwendet und kann nicht gelöscht werden.`,
        tone: 'error',
      });
      return;
    }

    const ok = await confirm({
      title: `Arbeit «${td.title}» löschen?`,
      description: 'Sie wird aus dem Katalog entfernt. Nur Arbeiten, die aktuell in keinen Schichten verbaut sind, können gelöscht werden.',
      confirmLabel: 'Arbeit löschen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/tasks/${td.id}`, { method: 'DELETE' });
      toast({ title: 'Arbeit gelöscht', description: td.title });
      await load();
    } catch (err) {
      toast({ title: 'Löschen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div>
      <OkPageHeader
        title="Arbeiten-Katalog"
        description="Typische Arbeiten wie Bar, Grill oder Kasse einmal anlegen und beim Planen in jede Schicht übernehmen."
        help="/ok/arbeiten-katalog/"
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Neue Arbeit
          </Button>
        }
      />

      <Callout tone="info" className="mb-6">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-accent-ink" />
          <div className="text-xs leading-relaxed text-fg-muted">
            Hier verwaltet ihr typische Aufgaben eurer Abteilung. Beim Anlegen von Schichten könnt ihr sie mit einem Klick übernehmen.
            Arbeiten, die aktuell in Schichten verbaut sind, können zum Schutz vor Datenverlust nicht gelöscht werden.
          </div>
        </div>
      </Callout>

      {tasks === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-44 rounded-card" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<Wrench />}
          title="Noch keine Arbeiten im Katalog"
          description="Lege die Arbeiten an, die bei euren Anlässen immer wieder vorkommen."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> Erste Arbeit anlegen
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((td) => {
            const usedIn = event.shifts.filter((s) =>
              s.tasks?.some(
                (t) => (t.taskDefinitionId && t.taskDefinitionId === td.id) || t.title.toLowerCase() === td.title.toLowerCase()
              )
            ).length;
            return (
              <Card key={td.id} className="flex flex-col justify-between p-5 shadow-soft">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-fg">{td.title}</h3>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`${td.title} bearbeiten`}
                        onClick={() => {
                          setEditing(td);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`${td.title} löschen`}
                        disabled={usedIn > 0}
                        title={usedIn > 0 ? `In ${usedIn} Schicht(en) verwendet – kann nicht gelöscht werden` : 'Arbeit löschen'}
                        onClick={() => remove(td, usedIn)}
                        className={usedIn > 0 ? 'text-fg-subtle/40 cursor-not-allowed' : 'text-fg-subtle hover:text-danger-ink'}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                    {td.description || <span className="italic text-fg-subtle">Keine Beschreibung</span>}
                  </p>
                  <div className="mt-3">
                    {td.minAge ? (
                      <Badge tone="warning">
                        ab {td.minAge} J. ({td.ageRequirementType === 'AT_LEAST_ONE' ? 'mind. 1 Person' : 'alle'})
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Kein Mindestalter</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-line pt-3 text-xs">
                  <span className={usedIn > 0 ? 'font-medium text-fg' : 'text-fg-subtle'}>
                    {usedIn === 0 ? 'In diesem Anlass nicht verwendet' : `In ${usedIn} Schicht${usedIn === 1 ? '' : 'en'}`}
                  </span>
                  <Link href={`${base}/schichten?neu=1`} className="font-bold text-accent-ink hover:underline">
                    + Schicht
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <TaskDefinitionDialog
        open={dialogOpen}
        task={editing}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setDialogOpen(false);
          setEditing(null);
          await load();
        }}
      />
    </div>
  );
}
