'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, Edit, Lock, Shield, Trash2, UserPlus, X } from 'lucide-react';
import {
  Avatar,
  Button,
  Callout,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { EventForm, eventFormInitial } from '@/components/EventFormDialog';
import { EventRangeField } from '@/components/ok/EventRangeField';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { SectionNav, SectionsProvider } from '@/components/ok/SettingsSections';
import { OrganizerDialog } from '@/components/ShiftDialogs';
import { api, errorMessage } from '@/lib/api';
import type { EventOrganizer } from '@/lib/types';

const SECTIONS = [
  ['ok-team', 'OK-Team'],
  ['grunddaten', 'Grunddaten'],
  ['eintragen', 'Eintragen & Fristen'],
  ['zugang', 'Zugang & Angaben'],
  ['zustaendigkeiten', 'Zuständigkeiten'],
  ['anwesenheit', 'Anwesenheit'],
  ['design', 'Design'],
] as const;

const SECTION_IDS = SECTIONS.map(([id]) => id);
/** Selten gebraucht: Beim Öffnen eingeklappt mit Zusammenfassung */
const COLLAPSED_SECTIONS = ['zustaendigkeiten', 'anwesenheit', 'design'];

/**
 * Anlass endgültig löschen (nur Abteilungsleitung). Der Knopf wird erst aktiv, wenn das Kürzel
 * eingetippt ist; das Backend prüft dasselbe nochmals.
 */
function DeleteEventSection({
  slug,
  title,
  shiftCount,
  signupCount,
}: {
  slug: string;
  title: string;
  shiftCount: number;
  signupCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError(null);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/events/${slug}`, { method: 'DELETE', json: { confirm: typed.trim() } });
      toast({ title: 'Anlass gelöscht', description: title, tone: 'success' });
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const matches = typed.trim() === slug;

  return (
    <section id="loeschen" className="mt-6">
      <Card className="border-danger/30 bg-danger/5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-danger-ink">Anlass löschen</h3>
            <p className="mt-0.5 text-sm text-fg-muted">
              Löscht den Anlass mit allen Schichten, Eintragungen, dem OK, Fragen, Zugangs-Links, Protokoll und
              Nachrichten. Das lässt sich nicht rückgängig machen. Nur die Abteilungsleitung kann das.
            </p>
          </div>
          <Button variant="danger" className="shrink-0" onClick={() => setOpen(true)}>
            <Trash2 aria-hidden /> Anlass löschen
          </Button>
        </div>
      </Card>

      <Dialog
        open={open}
        onClose={close}
        title={`«${title}» löschen?`}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy || !matches}>
              <Trash2 aria-hidden />
              {busy ? 'Wird gelöscht …' : 'Endgültig löschen'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Callout tone="danger">
            Weg sind danach {shiftCount} Schichten mit {signupCount} Eintragungen und alles, was zum Anlass gehört. Die
            Helfenden bekommen keine Nachricht. Wenn du sie informieren willst, schreib ihnen vorher unter «Nachrichten».
          </Callout>
          <Field
            label={
              <>
                Zur Bestätigung <span className="font-mono text-danger-ink">{slug}</span> eintippen
              </>
            }
            error={error ?? undefined}
          >
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches && !busy) remove();
              }}
            />
          </Field>
        </div>
      </Dialog>
    </section>
  );
}

export default function SettingsPage() {
  const { event, reload, permissions } = useOkEvent();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [formKey, setFormKey] = useState(0);
  const [okDialog, setOkDialog] = useState(false);
  const [editingOrganizer, setEditingOrganizer] = useState<EventOrganizer | null>(null);

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
    <SectionsProvider sections={SECTION_IDS} collapsed={COLLAPSED_SECTIONS}>
      <OkPageHeader
        title="Einstellungen"
        description="Alles, was für den ganzen Anlass gilt. Änderungen werden automatisch gespeichert, eine neue Adresse erst nach deiner Bestätigung."
        help="/ok/anlass-erstellen/"
      />

      <SectionNav sections={SECTIONS} />

      <section id="ok-team" className="mb-6">
        <Card className="p-5 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-fg">OK-Team</h3>
              <p className="mt-0.5 text-sm text-fg-muted">
                OK-Mitglieder planen Schichten und teilen Helfende ein. Die OK-Leitung ändert zusätzlich Einstellungen und das
                OK-Team.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditingOrganizer(null);
                setOkDialog(true);
              }}
            >
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
                        {org.roleTitle && org.roleTitle !== 'OK-Mitglied' && org.roleTitle !== 'OK-Leitung'
                          ? ` · ${org.roleTitle}`
                          : ''}
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingOrganizer(org);
                          setOkDialog(true);
                        }}
                        aria-label={`${name} bearbeiten`}
                        title="Rolle und Ressort bearbeiten"
                      >
                        <Edit className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => removeOrganizer(org.id, name)}
                        aria-label={`${name} aus dem OK entfernen`}
                        className="text-fg-subtle hover:text-danger-ink"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
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
        dateRange={<EventRangeField key={`${event.startDate}-${event.endDate}`} event={event} onMoved={reload} />}
        onAutoSaved={reload}
        onSaved={async (slug) => {
          if (slug !== event.slug) {
            router.replace(`/events/${slug}/ok/einstellungen`);
            return;
          }
          await reload();
          setFormKey((k) => k + 1);
        }}
      />

      {permissions.canDeleteEvent && (
        <DeleteEventSection
          slug={event.slug}
          title={event.title}
          shiftCount={event.shifts?.length ?? 0}
          signupCount={(event.shifts ?? []).reduce((sum, s) => sum + (s.signups?.length ?? 0), 0)}
        />
      )}

      <OrganizerDialog
        open={okDialog}
        eventSlug={event.slug}
        organizer={editingOrganizer}
        onClose={() => {
          setOkDialog(false);
          setEditingOrganizer(null);
        }}
        onSaved={async () => {
          setOkDialog(false);
          setEditingOrganizer(null);
          await reload();
        }}
      />
    </SectionsProvider>
  );
}
