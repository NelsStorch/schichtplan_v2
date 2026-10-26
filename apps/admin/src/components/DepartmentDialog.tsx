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
import {
  DEPARTMENT_PERMISSION_KEYS,
  DEPARTMENT_PERMISSIONS,
  isDepartmentPermission,
  normalizePermissions,
  type AdminDepartmentDetailDto,
  type AdminDepartmentPersonDto,
  type AdminUserListItemDto,
  type DepartmentPermission,
} from '@schichtplan/shared';
import { api, departmentUrl, errorMessage, send } from '../lib/api';
import { ACCESS_OPTIONS, CUSTOM_ACCESS, accessLabel, accessPayload, accessValue } from '../lib/access';
import { formatDate, formatDateTime, fullName } from '../lib/format';
import { EventRows } from './EventsPanel';
import { PersonPicker } from './PersonPicker';
import { TypedConfirmDialog } from './TypedConfirmDialog';

type Tab = 'personen' | 'anlaesse' | 'einstellungen' | 'stufen' | 'protokoll';
type PeopleFilter = 'all' | 'ADMIN' | 'RIGHTS' | 'HELPER' | 'home';

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
  onAccessChange,
  onOpenUser,
  busy,
}: {
  person: AdminDepartmentPersonDto;
  onAccessChange: (payload: { role: 'ADMIN' | 'HELPER'; permissions: DepartmentPermission[] } | null) => void;
  onOpenUser?: (userId: string) => void;
  busy: boolean;
}) {
  const name = fullName(person);
  const ceviNameOnly = person.loginMethods.includes('CEVINAME');
  const value = accessValue(person.role, person.permissions);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DepartmentPermission[]>(person.permissions);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={name} size="sm" highlight={person.role === 'ADMIN'} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              {onOpenUser ? (
                <button
                  type="button"
                  onClick={() => onOpenUser(person.userId)}
                  className="truncate text-left text-sm font-semibold text-fg hover:text-accent hover:underline"
                >
                  {name}
                </button>
              ) : (
                <span className="truncate text-sm font-semibold text-fg">{name}</span>
              )}
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
          {person.role === 'ADMIN' && (
            <Badge tone="outline" title="Woher die Abteilungsleitung kommt">
              {person.leaderSource === 'CEVIDB' ? 'aus Cevi.DB' : 'von Hand'}
            </Badge>
          )}
          {ceviNameOnly && <Badge>Nur Cevi-Name</Badge>}
          <span className="w-52">
            <Select
              value={value}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value;
                if (v === CUSTOM_ACCESS) return;
                onAccessChange(v ? accessPayload(v) : null);
              }}
              aria-label={`Zugang von ${name}`}
              className="h-10 text-sm sm:text-sm"
            >
              <option value="">Keine Zugehörigkeit</option>
              {ACCESS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} disabled={ceviNameOnly && o.needsAccount}>
                  {o.label}
                </option>
              ))}
              {value === CUSTOM_ACCESS && (
                <option value={CUSTOM_ACCESS} disabled>
                  Eigene Rechte
                </option>
              )}
            </Select>
          </span>
          {person.role === 'HELPER' && !ceviNameOnly && (
            <Button
              size="sm"
              variant={editing ? 'primary' : 'ghost'}
              onClick={() => {
                setDraft(person.permissions);
                setEditing(!editing);
              }}
              aria-expanded={editing}
            >
              Rechte
            </Button>
          )}
        </span>
      </div>
      {editing && (
        <div className="mt-3 space-y-3 rounded-field border border-line bg-surface-2/50 p-3">
          <AdminPermissionChecks value={draft} onChange={setDraft} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                onAccessChange({ role: 'HELPER', permissions: normalizePermissions(draft) });
                setEditing(false);
              }}
            >
              Rechte speichern
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Einzelne Rechte ankreuzen (globale Admins dürfen alles vergeben) */
export function AdminPermissionChecks({
  value,
  onChange,
}: {
  value: DepartmentPermission[];
  onChange: (next: DepartmentPermission[]) => void;
}) {
  const current = normalizePermissions(value);
  const dependentsOf = (p: DepartmentPermission) =>
    DEPARTMENT_PERMISSION_KEYS.filter((k) => k !== p && normalizePermissions([k]).includes(p));
  return (
    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {DEPARTMENT_PERMISSION_KEYS.map((p) => (
        <label key={p} className="flex cursor-pointer items-start gap-2 rounded-field px-1.5 py-1 hover:bg-surface">
          <input
            type="checkbox"
            checked={current.includes(p)}
            onChange={(e) =>
              onChange(
                normalizePermissions(
                  e.target.checked ? [...current, p] : current.filter((x) => x !== p && !dependentsOf(p).includes(x))
                )
              )
            }
            className="mt-0.5 size-4 shrink-0 rounded border-line"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">{DEPARTMENT_PERMISSIONS[p].label}</span>
            <span className="block text-xs leading-snug text-fg-subtle">{DEPARTMENT_PERMISSIONS[p].description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function PeopleTab({
  detail,
  onChanged,
  onOpenUser,
}: {
  detail: AdminDepartmentDetailDto;
  onChanged: () => void;
  onOpenUser?: (userId: string) => void;
}) {
  const toast = useToast();
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPerson, setNewPerson] = useState<AdminUserListItemDto | null>(null);
  const [newAccess, setNewAccess] = useState('ADMIN');

  const counts = useMemo(
    () => ({
      all: detail.people.length,
      ADMIN: detail.people.filter((p) => p.role === 'ADMIN').length,
      RIGHTS: detail.people.filter((p) => p.role === 'HELPER' && p.permissions.length > 0).length,
      HELPER: detail.people.filter((p) => p.role === 'HELPER' && p.permissions.length === 0).length,
      home: detail.people.filter((p) => p.isHome).length,
    }),
    [detail.people]
  );

  const visible = detail.people.filter((p) => {
    const match =
      filter === 'all'
        ? true
        : filter === 'home'
          ? p.isHome
          : filter === 'ADMIN'
            ? p.role === 'ADMIN'
            : filter === 'RIGHTS'
              ? p.role === 'HELPER' && p.permissions.length > 0
              : p.role === 'HELPER' && p.permissions.length === 0;
    if (!match) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.firstName, p.lastName, p.ceviName, p.email].some((v) => v?.toLowerCase().includes(q));
  });

  const setAccess = async (
    userId: string,
    payload: { role: 'ADMIN' | 'HELPER'; permissions: DepartmentPermission[] } | null
  ) => {
    setBusyId(userId);
    try {
      if (payload) await send(`/api/admin/departments/${detail.id}/members/${userId}`, 'PUT', payload);
      else await send(`/api/admin/departments/${detail.id}/members/${userId}`, 'DELETE');
      toast({
        title: payload ? `Zugang: ${accessLabel(payload.role, payload.permissions)}` : 'Zugehörigkeit entfernt',
        tone: 'success',
      });
      onChanged();
    } catch (err) {
      toast({ title: 'Nicht gespeichert', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    if (!newPerson) return;
    await setAccess(newPerson.id, accessPayload(newAccess));
    setNewPerson(null);
    setAdding(false);
  };

  const newNeedsAccount = ACCESS_OPTIONS.find((o) => o.value === newAccess)?.needsAccount ?? false;

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
              <Select value={newAccess} onChange={(e) => setNewAccess(e.target.value)} aria-label="Zugang">
                {ACCESS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={add} disabled={!newPerson || busyId !== null}>
              <Plus aria-hidden />
              Hinzufügen
            </Button>
          </div>
          {newPerson?.loginMethods.includes('CEVINAME') && newNeedsAccount && (
            <p className="text-xs text-danger-ink">
              Cevi-Name-Profile bekommen keine Rechte. Für Leitung oder Rechte braucht es Cevi.DB oder ein Passwort.
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
            ['RIGHTS', 'Mit Rechten'],
            ['HELPER', 'Ohne Rechte'],
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
              key={`${person.userId}-${person.role}-${person.permissions.join()}`}
              person={person}
              busy={busyId === person.userId}
              onAccessChange={(payload) => setAccess(person.userId, payload)}
              onOpenUser={onOpenUser}
            />
          ))}
        </ul>
      )}
      <p className="text-xs leading-relaxed text-fg-subtle">
        Von Hand gesetzte Abteilungsleitung bleibt, auch wenn Cevi.DB nichts davon weiss. Die aus Cevi.DB entzieht der
        nächste Login wieder, wenn die Rolle dort fehlt (nie die letzte). «Keine Zugehörigkeit» entfernt Rolle und Rechte,
        die Heimabteilung bleibt.
      </p>
    </div>
  );
}

const AUDIT_LABELS: Record<string, string> = {
  PERMISSIONS_SET: 'Rechte geändert',
  LEADER_GRANT: 'Abteilungsleitung erhalten',
  LEADER_REVOKE: 'Abteilungsleitung entzogen',
  STUFEN_SET: 'Stufen geändert',
  MEMBER_REMOVE: 'Aus der Abteilung entfernt',
};

/** Protokoll der Abteilung (Rechte, Abteilungsleitung, Stufen), auch was die Abteilung selbst geändert hat */
function DepartmentAuditTab({ detail }: { detail: AdminDepartmentDetailDto }) {
  if (detail.audit.length === 0) {
    return <EmptyState title="Noch keine Einträge" description="Hier erscheint, wer wem welche Rechte gegeben hat." className="py-8" />;
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const label = (p: string) => (isDepartmentPermission(p) ? DEPARTMENT_PERMISSIONS[p].label : p);
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
      {detail.audit.map((entry) => {
        const before = list(entry.details?.before);
        const after = list(entry.details?.after);
        const fmt = entry.action === 'PERMISSIONS_SET' ? label : (s: string) => s;
        const change = [
          ...after.filter((x) => !before.includes(x)).map((x) => `+ ${fmt(x)}`),
          ...before.filter((x) => !after.includes(x)).map((x) => `− ${fmt(x)}`),
        ].join(' · ');
        return (
          <li key={entry.id} className="px-4 py-3">
            <p className="text-sm text-fg">
              <span className="font-semibold">{entry.targetLabel}</span>: {AUDIT_LABELS[entry.action] ?? entry.action}
            </p>
            {change && <p className="mt-0.5 text-xs text-fg-muted">{change}</p>}
            <p className="mt-0.5 text-2xs text-fg-subtle">
              {formatDateTime(entry.createdAt)} · {entry.actorName}
            </p>
          </li>
        );
      })}
    </ul>
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
  const [contactUserId, setContactUserId] = useState(detail.contactUserId ?? '');
  // Kontaktperson: Abteilungsleitung oder «Personen und Rechte verwalten»
  const contactCandidates = detail.people.filter((p) => p.role === 'ADMIN' || p.permissions.includes('PEOPLE_MANAGE'));
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
        contactUserId: contactUserId || null,
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
          <Field label="Kontaktperson" hint="Abteilungsleitung oder wer «Personen und Rechte verwalten» darf.">
            <Select value={contactUserId} onChange={(e) => setContactUserId(e.target.value)}>
              <option value="">Keine Kontaktperson</option>
              {contactCandidates.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {fullName(p)}
                  {p.role === 'ADMIN' ? ' (Abteilungsleitung)' : ''}
                </option>
              ))}
              {contactUserId && !contactCandidates.some((p) => p.userId === contactUserId) && (
                <option value={contactUserId}>{detail.contactName ?? 'Bisherige Kontaktperson'}</option>
              )}
            </Select>
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
  onOpenUser,
}: {
  departmentId: string | null;
  onClose: () => void;
  onChanged: () => void;
  onOpenUser?: (userId: string) => void;
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
    { id: 'protokoll', label: 'Protokoll', count: loaded?.audit.length },
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
            {tab === 'personen' && <PeopleTab detail={loaded} onChanged={refresh} onOpenUser={onOpenUser} />}
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
            {tab === 'protokoll' && <DepartmentAuditTab detail={loaded} />}
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
