'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, Lock, Shield, UserPlus, X } from 'lucide-react';
import { Avatar, Button, Callout, Card, EmptyState, useConfirm, useToast } from '@schichtplan/ui';
import { EventForm, eventFormInitial } from '@/components/EventFormDialog';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { OrganizerDialog } from '@/components/ShiftDialogs';
import { api, errorMessage } from '@/lib/api';

const SECTIONS = [
  ['ok-team', 'OK-Team'],
  ['grunddaten', 'Grunddaten'],
  ['eintragen', 'Eintragen & Fristen'],
  ['zugang', 'Zugang & Angaben'],
  ['zustaendigkeiten', 'Zuständigkeiten'],
  ['anwesenheit', 'Anwesenheit'],
  ['design', 'Design'],
] as const;

export default function SettingsPage() {
  const { event, reload, permissions } = useOkEvent();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [formKey, setFormKey] = useState(0);
  const [okDialog, setOkDialog] = useState(false);

  if (!permissions.canEditSettings) {
    return (
      <EmptyState
        icon={<Lock />}
        title="Nur für OK-Leitung und Abteilungsleitung"
        description="Die Einstellungen des Anlasses und das OK-Team ändern die OK-Leitung oder die Abteilungsleitung."
      />
    );
  }

  const removeOrganizer = async (id: string, name: string) => {
    const ok = await confirm({
      title: `${name} aus dem OK entfernen?`,
      description: 'Die Person sieht den OK-Bereich danach nicht mehr.',
      confirmLabel: 'Entfernen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/events/${event.slug}/organizers/${id}`, { method: 'DELETE' });
      toast({ title: `${name} entfernt` });
      await reload();
    } catch (err) {
      toast({ title: 'Entfernen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  const organizers = event.organizers ?? [];

  return (
    <div>
      <OkPageHeader
        title="Einstellungen"
        description="Alles, was für den ganzen Anlass gilt. Änderungen am Formular gelten erst nach «Speichern», das OK-Team ändert sich sofort."
        help="/ok/anlass-erstellen/"
      />

      <nav aria-label="Abschnitte" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-fg-muted transition hover:border-line-strong hover:text-fg"
          >
            {label}
          </a>
        ))}
      </nav>

      <section id="ok-team" className="mb-6 scroll-mt-24">
        <Card className="p-5 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-fg">OK-Team</h3>
              <p className="mt-0.5 text-sm text-fg-muted">
                OK-Mitglieder planen Schichten und teilen Helfende ein. Die OK-Leitung ändert zusätzlich Einstellungen und das
                OK-Team.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setOkDialog(true)}>
              <UserPlus className="size-4" /> Person aufnehmen
            </Button>
          </div>
          {organizers.length === 0 ? (
            <Callout tone="warning" className="mt-4">
              Noch niemand im OK. Bis jemand eingetragen ist, plant nur die Abteilungsleitung.
            </Callout>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-field border border-line">
              {organizers.map((org) => {
                const lead = org.role === 'OK_LEAD';
                const name = org.userCeviName || org.displayName;
                return (
                  <li key={org.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar name={name} size="sm" highlight={lead} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                        {name}
                        {lead ? <Crown className="size-3.5 text-accent-ink" /> : <Shield className="size-3.5 text-fg-subtle" />}
                      </span>
                      <span className="block text-xs text-fg-muted">
                        {lead ? 'OK-Leitung' : 'OK-Mitglied'}
                        {org.roleTitle ? ` · ${org.roleTitle}` : ''}
                      </span>
                    </span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeOrganizer(org.id, name)}
                      aria-label={`${name} aus dem OK entfernen`}
                      className="text-fg-subtle hover:text-danger-ink"
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <EventForm
        key={formKey}
        mode="edit"
        layout="page"
        eventSlug={event.slug}
        initial={eventFormInitial(event)}
        onCancel={() => setFormKey((k) => k + 1)}
        onSaved={async (slug) => {
          if (slug !== event.slug) {
            router.replace(`/events/${slug}/ok/einstellungen`);
            return;
          }
          await reload();
          setFormKey((k) => k + 1);
        }}
      />

      <OrganizerDialog
        open={okDialog}
        eventSlug={event.slug}
        onClose={() => setOkDialog(false)}
        onSaved={async () => {
          setOkDialog(false);
          await reload();
        }}
      />
    </div>
  );
}
