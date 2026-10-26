'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, FileText, Plus, Trash2 } from 'lucide-react';
import type { EventTemplateDto } from '@schichtplan/shared';
import { EVENT_ACCESS_TYPES } from '@schichtplan/shared';
import { Button, Callout, Card, EmptyState, Skeleton, buttonClasses, useConfirm, useToast } from '@schichtplan/ui';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { SaveTemplateDialog } from '@/components/ShiftDialogs';
import { api, errorMessage } from '@/lib/api';

export default function TemplatesPage() {
  const { event } = useOkEvent();
  const toast = useToast();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<EventTemplateDto[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setTemplates(await api<EventTemplateDto[]>('/api/event-templates'));
    } catch (err) {
      setTemplates([]);
      toast({ title: 'Vorlagen konnten nicht geladen werden', description: errorMessage(err), tone: 'error' });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (tpl: EventTemplateDto) => {
    const ok = await confirm({
      title: `Vorlage «${tpl.title}» löschen?`,
      description: 'Anlässe, die schon aus der Vorlage erstellt wurden, bleiben unverändert.',
      confirmLabel: 'Vorlage löschen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/event-templates/${tpl.id}`, { method: 'DELETE' });
      toast({ title: 'Vorlage gelöscht', description: tpl.title });
      await load();
    } catch (err) {
      toast({ title: 'Löschen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <div>
      <OkPageHeader
        title="Vorlagen"
        description="Speichere diesen Anlass mit allen Schichten, Arbeiten und Einstellungen. Nächstes Jahr erstellst du daraus mit einem Klick einen neuen Anlass."
        help="/ok/vorlagen/"
        actions={
          <Button size="sm" onClick={() => setSaveOpen(true)}>
            <Copy className="size-4" /> Diesen Anlass als Vorlage speichern
          </Button>
        }
      />

      <Callout tone="info" className="mb-6">
        Vorlagen gelten für die ganze Abteilung. Personen und Eintragungen werden nicht gespeichert.
      </Callout>

      {templates === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-44 rounded-card" />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Noch keine Vorlagen"
          description="Speichere diesen Anlass als Vorlage, sobald der Plan steht."
          action={
            <Button onClick={() => setSaveOpen(true)}>
              <Copy className="size-4" /> Als Vorlage speichern
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((tpl) => (
            <Card key={tpl.id} className="flex flex-col justify-between p-5 shadow-soft">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-fg">{tpl.title}</h3>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {tpl.shiftCount} Schichten · Zugang: {EVENT_ACCESS_TYPES[tpl.accessType]?.short ?? 'Öffentlich'}
                    </p>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => remove(tpl)}
                    className="hover:text-danger-ink"
                    aria-label={`Vorlage ${tpl.title} löschen`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {tpl.description && <p className="mt-2 text-xs leading-relaxed text-fg-muted">{tpl.description}</p>}
                <ul className="mt-4 space-y-1 rounded-field bg-surface-2 p-3 text-2xs text-fg-muted">
                  {tpl.data?.shifts?.slice(0, 5).map((s, i) => (
                    <li key={i}>
                      <strong className="text-fg">{s.title}</strong> · Tag {s.dayOffset + 1}, {s.startTimeStr}–{s.endTimeStr}
                    </li>
                  ))}
                  {(tpl.data?.shifts?.length || 0) > 5 && (
                    <li className="italic">und {tpl.data.shifts.length - 5} weitere</li>
                  )}
                </ul>
              </div>
              <div className="mt-5 border-t border-line pt-3">
                <Link
                  href={`/?templateId=${tpl.id}&createEvent=1`}
                  className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-full' })}
                >
                  <Plus className="size-4" /> Neuen Anlass daraus erstellen
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SaveTemplateDialog
        open={saveOpen}
        eventSlug={event.slug}
        defaultTitle={event.title}
        onClose={() => setSaveOpen(false)}
        onSaved={async () => {
          setSaveOpen(false);
          await load();
        }}
      />
    </div>
  );
}
