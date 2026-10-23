'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, Building2, Plus, Search, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Chip,
  ChipRow,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Switch,
  buttonClasses,
  cn,
  useToast,
} from '@schichtplan/ui';
import type { AdminDepartmentDetailDto, AdminDepartmentPersonDto, AdminUserListItemDto } from '@schichtplan/shared';
import { api, departmentUrl, errorMessage, send } from '../lib/api';
import { departmentRoleLabels, formatDate, fullName } from '../lib/format';
import { EventRows } from './EventsPanel';
import { PersonPicker } from './PersonPicker';
import { TypedConfirmDialog } from './TypedConfirmDialog';

type Tab = 'personen' | 'anlaesse' | 'einstellungen' | 'stufen';
type PeopleFilter = 'all' | 'ADMIN' | 'PLANNER' | 'HELPER' | 'home';

const ROLES = ['ADMIN', 'PLANNER', 'HELPER'] as const;

export function DepartmentLogo({
  name,
  logoUrl,
  color,
  className,
}: {
  name: string;
  logoUrl: string | null;
  color: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setBroken(true)}
        className={cn('size-10 shrink-0 rounded-tile border border-line bg-white object-contain p-1', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn('flex size-10 shrink-0 items-center justify-center rounded-tile text-white', className)}
      style={{ backgroundColor: color || '#e11d48' }}
    >
      <Building2 className="size-5" />
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">{label}</dt>
      <dd className="tabular mt-0.5 font-display text-xl font-bold text-fg">{value.toLocaleString('de-CH')}</dd>
    </div>
  );
}

function PersonRow({
  person,
  onRoleChange,
  busy,
}: {
  person: AdminDepartmentPersonDto;
  onRoleChange: (role: string) => void;
  busy: boolean;
}) {
  const name = fullName(person);
  const ceviNameOnly = person.loginMethods.includes('CEVINAME');
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={name} size="sm" highlight={person.role === 'ADMIN'} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-fg">{name}</span>
            {person.isGlobalAdmin && <ShieldCheck aria-label="Globale Admin" className="size-3.5 shrink-0 text-accent-ink" />}
          </span>
          <span className="block truncate text-xs text-fg-subtle">
            {[person.ceviName !== person.firstName && person.ceviName !== name ? person.ceviName : null, person.email]
              .filter(Boolean)
              .join(' · ') ||
              '–'}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2 pl-10 sm:pl-0">
        {person.isHome && (
          <Badge tone="outline" title="Heimabteilung">
            {person.homeSource === 'CEVIDB' ? 'Heim · Cevi.DB' : 'Heim · selbst'}
          </Badge>
        )}
        {ceviNameOnly && <Badge>Nur Cevi-Name</Badge>}
        <span className="w-48">
          <Select
            value={person.role ?? ''}
            disabled={busy}
            onChange={(e) => onRoleChange(e.target.value)}
            aria-label={`Rolle von ${name}`}
            className="h-10 text-sm sm:text-sm"
          >
            <option value="">Keine Rolle</option>
            {ROLES.map((role) => (
              <option key={role} value={role} disabled={ceviNameOnly && role !== 'HELPER'}>
                {departmentRoleLabels[role]}
              </option>
            ))}
          </Select>
        </span>
      </span>
    </li>
  );
}

function PeopleTab({ detail, onChanged }: { detail: AdminDepartmentDetailDto; onChanged: () => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPerson, setNewPerson] = useState<AdminUserListItemDto | null>(null);
  const [newRole, setNewRole] = useState<(typeof ROLES)[number]>('ADMIN');

  const counts = useMemo(
    () => ({
      all: detail.people.length,
      ADMIN: detail.people.filter((p) => p.role === 'ADMIN').length,
      PLANNER: detail.people.filter((p) => p.role === 'PLANNER').length,
      HELPER: detail.people.filter((p) => p.role === 'HELPER').length,
      home: detail.people.filter((p) => p.isHome).length,
    }),
    [detail.people]
  );

  const visible = detail.people.filter((p) => {
    if (filter === 'home' ? !p.isHome : filter !== 'all' && p.role !== filter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.firstName, p.lastName, p.ceviName, p.email].some((v) => v?.toLowerCase().includes(q));
  });

  const setRole = async (userId: string, role: string) => {
    setBusyId(userId);
    try {
      if (role) await send(`/api/admin/departments/${detail.id}/members/${userId}`, 'PUT', { role });
      else await send(`/api/admin/departments/${detail.id}/members/${userId}`, 'DELETE');
      toast({ title: role ? `Rolle: ${departmentRoleLabels[role]}` : 'Rolle entfernt', tone: 'success' });
      onChanged();
    } catch (err) {
      toast({ title: 'Nicht gespeichert', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    if (!newPerson) return;
    await setRole(newPerson.id, newRole);
    setNewPerson(null);
    setAdding(false);
  };

  return (
    <div className="space-y-4">
      {counts.ADMIN === 0 && (
        <Callout tone="warning">Diese Abteilung hat keine Abteilungsleitung. Niemand kann sie verwalten.</Callout>
      )}

      {adding ? (
        <div className="space-y-3 rounded-card border border-line bg-surface-2/50 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-fg">Person hinzufügen</h4>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewPerson(null);
              }}
              aria-label="Schliessen"
              className="flex size-8 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-3 hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <PersonPicker value={newPerson} onChange={setNewPerson} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Select value={newRole} onChange={(e) => setNewRole(e.target.value as typeof newRole)} aria-label="Rolle">
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {departmentRoleLabels[role]}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={add} disabled={!newPerson || busyId !== null}>
              <Plus aria-hidden />
              Rolle vergeben
            </Button>
          </div>
          {newPerson?.loginMethods.includes('CEVINAME') && newRole !== 'HELPER' && (
            <p className="text-xs text-danger-ink">
              Cevi-Name-Profile können nur Helfer*in sein. Für Leitung oder Planung braucht es Cevi.DB oder ein Passwort.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="In dieser Abteilung suchen"
            aria-label="Personen filtern"
            className="h-11 pl-10"
          />
        </div>
        {!adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden />
            Person hinzufügen
          </Button>
        )}
      </div>

      <ChipRow>
        {(
          [
            ['all', 'Alle'],
            ['ADMIN', 'Leitung'],
            ['PLANNER', 'Planung'],
            ['HELPER', 'Helfende'],
            ['home', 'Heimabteilung'],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} selected={filter === id} count={counts[id]} onClick={() => setFilter(id)}>
            {label}
          </Chip>
        ))}
      </ChipRow>

      {visible.length === 0 ? (
        <EmptyState title="Niemand" description="In dieser Auswahl gibt es keine Personen." className="py-8" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {visible.map((person) => (
            <PersonRow
              key={person.userId}
              person={person}
              busy={busyId === person.userId}
              onRoleChange={(role) => setRole(person.userId, role)}
            />
          ))}
        </ul>
      )}
      <p className="text-xs leading-relaxed text-fg-subtle">
        «Keine Rolle» entfernt nur die Abteilungsrolle. Die Heimabteilung kommt aus Cevi.DB oder wurde von der Person
        selbst gewählt und bleibt.
      </p>
    </div>
  );
}

function SettingsTab({
  detail,
  onSaved,
  onDeleted,
}: {
  detail: AdminDepartmentDetailDto;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(detail.name);
  const [slug, setSlug] = useState(detail.slug);
  const [ceviDbGroupId, setCeviDbGroupId] = useState(detail.ceviDbGroupId?.toString() ?? '');
  const [contactEmail, setContactEmail] = useState(detail.contactEmail ?? '');
  const [logoUrl, setLogoUrl] = useState(detail.logoUrl ?? '');
  const [primaryColor, setPrimaryColor] = useState(detail.primaryColor ?? '#e11d48');
  const [membersOnly, setMembersOnly] = useState(detail.membersOnly);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const groupValid = ceviDbGroupId === '' || /^\d{1,9}$/.test(ceviDbGroupId);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupValid) return;
    setSaving(true);
    setError(null);
    try {
      const result = await send<{ success: boolean; attached: number }>(`/api/admin/departments/${detail.id}`, 'PATCH', {
        name: name.trim(),
        slug: slug.trim() !== detail.slug ? slug.trim() : undefined,
        ceviDbGroupId: ceviDbGroupId ? Number(ceviDbGroupId) : null,
        contactEmail: contactEmail.trim() || null,
        logoUrl: logoUrl.trim() || null,
        primaryColor,
        membersOnly,
      });
      toast({
        title: 'Abteilung gespeichert',
        description: result.attached ? `${result.attached} Personen aus der Ortsgruppe zugeordnet.` : undefined,
        tone: 'success',
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} />
          </Field>
          <Field
            label="Subdomain"
            required
            hint={slug !== detail.slug ? 'Achtung: Alle bisherigen Links und QR-Codes auf diese Abteilung gehen nicht mehr.' : undefined}
          >
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              minLength={3}
              maxLength={30}
              className="font-mono"
            />
          </Field>
          <Field
            label="Cevi.DB-Ortsgruppe (ID)"
            hint="Personen dieser Ortsgruppe werden beim Cevi.DB-Login automatisch zugeordnet."
            error={groupValid ? undefined : 'Nur Ziffern'}
          >
            <Input value={ceviDbGroupId} onChange={(e) => setCeviDbGroupId(e.target.value.trim())} inputMode="numeric" />
          </Field>
          <Field label="Kontakt-E-Mail">
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={254} />
          </Field>
          <Field label="Logo-Adresse" hint="Pfad (/api/uploads/…) oder https-Adresse. Leer = Farbfläche.">
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} maxLength={500} />
          </Field>
          <Field label="Akzentfarbe">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label="Farbe wählen"
                className="h-12 w-14 shrink-0 cursor-pointer rounded-field border border-line bg-surface-2 p-1"
              />
              <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="font-mono" maxLength={7} />
            </div>
          </Field>
        </div>
        <Switch
          checked={membersOnly}
          onChange={setMembersOnly}
          label="Startseite nur für Mitglieder"
          description="Aussenstehende sehen die Liste der Anlässe nicht. Öffentliche Anlässe bleiben über ihren Link erreichbar."
        />
        {error && <Callout tone="danger">{error}</Callout>}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !groupValid || name.trim().length < 2}>
            {saving ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </div>
      </form>

      <section className="mt-8 rounded-card border border-danger/30 bg-danger/5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-danger-ink">Abteilung löschen</h4>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              Löscht die Abteilung mit allen Anlässen, Schichten, Eintragungen, Rollen, Stufen und Vorlagen. Die Konten
              der Personen bleiben bestehen.
            </p>
          </div>
          <Button variant="danger" size="sm" className="shrink-0" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden />
            Abteilung löschen
          </Button>
        </div>
      </section>

      <TypedConfirmDialog
        open={confirmDelete}
        title={`${detail.name} löschen?`}
        expected={detail.slug}
        confirmLabel="Abteilung endgültig löschen"
        description={
          <>
            Weg sind danach {detail.eventCount} Anlässe mit {detail.signupCount} Eintragungen, {detail.memberCount}{' '}
            Rollen und alle Stufen. {detail.homeUserCount} Personen verlieren ihre Heimabteilung und werden beim nächsten
            Login neu gefragt. Das lässt sich nicht rückgängig machen.
          </>
        }
        onClose={() => setConfirmDelete(false)}
        onConfirm={async (typed) => {
          await send(`/api/admin/departments/${detail.id}`, 'DELETE', { confirm: typed });
          toast({ title: 'Abteilung gelöscht', description: detail.name, tone: 'success' });
          setConfirmDelete(false);
          onDeleted();
        }}
      />
    </>
  );
}

/** Abteilung im Detail: Personen und Rollen, Anlässe, Stufen, Einstellungen */
export function DepartmentDialog({
  departmentId,
  onClose,
  onChanged,
}: {
  departmentId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminDepartmentDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('personen');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!departmentId) return;
    const controller = new AbortController();
    setError(null);
    api<AdminDepartmentDetailDto>(`/api/admin/departments/${departmentId}`, { signal: controller.signal })
      .then(setDetail)
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [departmentId, reload]);

  useEffect(() => {
    if (!departmentId) {
      setDetail(null);
      setTab('personen');
    }
  }, [departmentId]);

  const loaded = detail && detail.id === departmentId ? detail : null;
  const refresh = () => {
    setReload((n) => n + 1);
    onChanged();
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'personen', label: 'Personen', count: loaded?.people.length },
    { id: 'anlaesse', label: 'Anlässe', count: loaded?.eventCount },
    { id: 'stufen', label: 'Stufen', count: loaded?.stufen.length },
    { id: 'einstellungen', label: 'Einstellungen' },
  ];

  return (
    <Dialog
      open={Boolean(departmentId)}
      onClose={onClose}
      size="lg"
      title={
        loaded ? (
          <span className="flex items-center gap-3">
            <DepartmentLogo name={loaded.name} logoUrl={loaded.logoUrl} color={loaded.primaryColor} />
            <span className="min-w-0">
              <span className="block truncate">{loaded.name}</span>
              <span className="block truncate font-mono text-sm font-medium text-fg-muted">{loaded.slug}</span>
            </span>
          </span>
        ) : (
          'Abteilung'
        )
      }
      footer={
        <>
          {loaded && (
            <a
              href={departmentUrl(loaded.slug)}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonClasses({ variant: 'secondary' }), 'sm:mr-auto')}
            >
              Abteilung öffnen
              <ArrowUpRight aria-hidden />
            </a>
          )}
          <Button variant="secondary" onClick={onClose}>
            Schliessen
          </Button>
        </>
      }
    >
      {error && <Callout tone="danger">{error}</Callout>}
      {!loaded && !error && (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-10" />
          <Skeleton className="h-40" />
        </div>
      )}
      {loaded && (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4 [&>div]:bg-surface">
            <Stat label="Heimabteilung" value={loaded.homeUserCount} />
            <Stat label="Mit Rolle" value={loaded.memberCount} />
            <Stat label="Kommende Anlässe" value={loaded.upcomingEventCount} />
            <Stat label="Eintragungen" value={loaded.signupCount} />
          </dl>
          <p className="mt-3 text-xs text-fg-subtle">
            Angelegt am {formatDate(loaded.createdAt)}
            {loaded.ceviDbGroupId !== null && <> · Cevi.DB-Ortsgruppe {loaded.ceviDbGroupId}</>}
            {loaded.membersOnly ? ' · Startseite nur für Mitglieder' : ' · Startseite öffentlich'}
          </p>

          <div role="tablist" className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition',
                  tab === t.id ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="tabular rounded-full bg-surface-3 px-1.5 text-xs text-fg-muted">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="pt-5">
            {tab === 'personen' && <PeopleTab detail={loaded} onChanged={refresh} />}
            {tab === 'anlaesse' &&
              (loaded.events.length === 0 ? (
                <EmptyState title="Noch keine Anlässe" className="py-8" />
              ) : (
                <EventRows items={loaded.events} showDepartment={false} onChanged={refresh} />
              ))}
            {tab === 'stufen' &&
              (loaded.stufen.length === 0 ? (
                <EmptyState
                  title="Keine Stufen"
                  description="Stufen legt die Abteilungsleitung in der Abteilung an, oder sie entstehen beim Cevi.DB-Login."
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                  {loaded.stufen.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fg">{s.name}</span>
                        <span className="block text-xs text-fg-subtle">
                          {s.ceviDbGroupId !== null ? `Cevi.DB-Gruppe ${s.ceviDbGroupId}` : 'Ohne Cevi.DB'}
                        </span>
                      </span>
                      <Badge>{s.memberCount} Personen</Badge>
                    </li>
                  ))}
                </ul>
              ))}
            {tab === 'einstellungen' && (
              <SettingsTab
                key={`${loaded.id}-${reload}`}
                detail={loaded}
                onSaved={refresh}
                onDeleted={() => {
                  onChanged();
                  onClose();
                }}
              />
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
