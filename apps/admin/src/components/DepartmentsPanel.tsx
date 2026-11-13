'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, ChevronRight, Download, Plus, Search, SearchX, X } from 'lucide-react';
import {
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  ChipRow,
  Dialog,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Switch,
  cn,
  useToast,
} from '@schichtplan/ui';
import { SUBDOMAIN_REGEX, getOrganizationByDbType, type AdminDepartmentListItemDto, type AdminUserListItemDto, type OrganizationType } from '@schichtplan/shared';
import { send, errorMessage } from '../lib/api';
import { ORGANIZATION_TYPES, matchesOrg, organizationLabel, providerLabel, type OrgFilter } from '../lib/organizations';
import { downloadCsv } from '../lib/csv';
import { DepartmentLogo } from './DepartmentDialog';
import { PersonPicker } from './PersonPicker';

type Filter = 'all' | 'noLeader' | 'noCeviDb' | 'active';

/** Name ➜ Subdomain-Vorschlag («Cevi Illnau-Effretikon» ➜ «illnau-effretikon», «Jubla Wald» ➜ «wald») */
function suggestSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/^(cevi|pfadi|jubla|verein)\s+/, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function CreateDepartmentDialog({
  open,
  onClose,
  onCreated,
  defaultOrganization,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  defaultOrganization: OrganizationType;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [organization, setOrganization] = useState<OrganizationType>(defaultOrganization);
  const [ceviDbGroupId, setCeviDbGroupId] = useState('');
  const [membersOnly, setMembersOnly] = useState(true);
  const [leader, setLeader] = useState<AdminUserListItemDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const org = getOrganizationByDbType(organization);
  const isVerein = organization === 'OTHER';

  // Beim Öffnen den Verband aus dem Filter oben übernehmen
  useEffect(() => {
    if (open) setOrganization(defaultOrganization);
  }, [open, defaultOrganization]);

  // autoFocus greift im nativen <dialog> nicht (showModal setzt den Fokus danach neu)
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const reset = () => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setOrganization(defaultOrganization);
    setCeviDbGroupId('');
    setMembersOnly(true);
    setLeader(null);
    setError(null);
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const slugValid = slug.length >= 3 && SUBDOMAIN_REGEX.test(slug);
  const groupValid = ceviDbGroupId === '' || /^\d{1,9}$/.test(ceviDbGroupId);
  const leaderInvalid = leader?.loginMethods.includes('CEVINAME') ?? false;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await send<{ department: { id: string; name: string }; attached: number }>(
        '/api/admin/departments',
        'POST',
        {
          name: name.trim(),
          slug,
          organization,
          hitobitoGroupId: !isVerein && ceviDbGroupId ? Number(ceviDbGroupId) : null,
          membersOnly,
          leaderUserId: leader?.id ?? null,
        }
      );
      toast({
        title: `${org.unitTerm} angelegt`,
        description: result.attached
          ? `${result.department.name}: ${result.attached} Personen aus der ${org.authProviderShort}-Gruppe zugeordnet.`
          : result.department.name,
        tone: 'success',
      });
      reset();
      onCreated(result.department.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title={`Neue ${org.unitTerm}`}
      description={
        isVerein
          ? 'Normalerweise legt die Vereinsleitung ihren Verein selbst an. Hier geht es auch direkt.'
          : `Normalerweise legt die ${org.leadTerm} die ${org.unitTerm} selbst über ${org.authProviderShort} an. Hier geht es auch ohne.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="create-department"
            disabled={saving || name.trim().length < 2 || !slugValid || !groupValid || leaderInvalid}
          >
            <Plus aria-hidden />
            {saving ? 'Wird angelegt …' : `${org.unitTerm} anlegen`}
          </Button>
        </>
      }
    >
      <form id="create-department" onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Verband / Organisation" required>
            <div className="flex gap-2">
              {ORGANIZATION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={organization === type}
                  onClick={() => setOrganization(type)}
                  className={cn(
                    'flex-1 rounded-field py-2 text-xs font-semibold border transition',
                    organization === type
                      ? 'border-accent bg-accent/10 text-accent-ink font-bold'
                      : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong'
                  )}
                >
                  {organizationLabel(type)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Name" required>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(suggestSlug(e.target.value));
              }}
              placeholder={`${organizationLabel(organization)} Musterdorf`}
              maxLength={80}
              ref={nameRef}
            />
          </Field>
          <Field
            label="Subdomain"
            required
            hint={slug ? `${slug}.${org.domain}` : 'Kleinbuchstaben, Zahlen, Bindestriche'}
            error={slug && !slugValid ? 'Mindestens 3 Zeichen, nur a–z, 0–9 und -' : undefined}
          >
            <Input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugTouched(true);
              }}
              maxLength={30}
              className="font-mono"
            />
          </Field>
          {!isVerein && (
            <Field
              label={`${org.authProviderShort}-Gruppe (ID)`}
              hint={`Optional. Die Gruppe der ${org.unitTerm} in ${org.authProviderShort}. Bereits angemeldete Personen werden sofort zugeordnet.`}
              error={groupValid ? undefined : 'Nur Ziffern'}
            >
              <Input value={ceviDbGroupId} onChange={(e) => setCeviDbGroupId(e.target.value.trim())} inputMode="numeric" />
            </Field>
          )}
        </div>
        <div className="space-y-2">
          <span className="text-[13px] font-semibold text-fg">{isVerein ? 'Vereinsleitung' : org.leadTerm} (wird auch Kontaktperson)</span>
          <PersonPicker value={leader} onChange={setLeader} placeholder="Optional: Person suchen" />
          {leaderInvalid && (
            <p className="text-xs text-danger-ink">
              Profile nur mit {org.nicknameTerm} können keine Leitung sein. Die Person braucht {isVerein ? 'ein Passwort' : `${org.authProviderShort} oder ein Passwort`}.
            </p>
          )}
        </div>
        <Switch
          checked={membersOnly}
          onChange={setMembersOnly}
          label="Startseite nur für Mitglieder"
          description="Aussenstehende sehen die Liste der Anlässe nicht."
        />
        {error && <Callout tone="danger">{error}</Callout>}
      </form>
    </Dialog>
  );
}

export function DepartmentsPanel({
  departments,
  loading,
  onOpen,
  onChanged,
  creating = false,
  onCloseCreating,
  orgFilter = 'ALL',
}: {
  departments: AdminDepartmentListItemDto[] | null;
  /** Verbandsfilter oben im Portal */
  orgFilter?: OrgFilter;
  loading: boolean;
  onOpen: (id: string) => void;
  onChanged: () => void;
  creating?: boolean;
  onCloseCreating?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [internalCreating, setInternalCreating] = useState(false);

  const isCreating = creating || internalCreating;
  const setCreating = (val: boolean) => {
    setInternalCreating(val);
    if (!val && onCloseCreating) onCloseCreating();
  };

  const all = (departments ?? []).filter((d) => matchesOrg(d.organization, orgFilter));
  const groupId = (d: AdminDepartmentListItemDto) => d.hitobitoGroupId ?? d.ceviDbGroupId ?? null;
  const matches = (d: AdminDepartmentListItemDto, f: Filter) =>
    f === 'noLeader'
      ? d.leaders.length === 0
      : f === 'noCeviDb'
        ? // Vereine haben nie eine Verbands-Datenbank
          d.organization !== 'OTHER' && groupId(d) === null
        : f === 'active'
          ? d.upcomingEventCount > 0
          : true;
  const q = search.trim().toLowerCase();
  const visible = all.filter(
    (d) =>
      matches(d, filter) &&
      (!q ||
        d.name.toLowerCase().includes(q) ||
        d.slug.includes(q) ||
        String(groupId(d) ?? '').includes(q) ||
        d.leaders.some((l) => l.name.toLowerCase().includes(q)))
  );

  const exportCsv = () => {
    const headers = [
      'Verband',
      'Name',
      'Adresse',
      'Datenbank',
      'Gruppe (ID)',
      'Leitung',
      'Heimabteilung Nutzer',
      'Mitglieder mit Rolle',
      'Anlässe total',
      'Kommende Anlässe',
      'Eintragungen',
    ];
    const rows = visible.map((d) => [
      organizationLabel(d.organization),
      d.name,
      `${d.slug}.${getOrganizationByDbType(d.organization).domain}`,
      providerLabel(d.organization) ?? '',
      groupId(d) ?? '',
      d.leaders.map((l) => l.name).join(', '),
      d.homeUserCount,
      d.memberCount,
      d.eventCount,
      d.upcomingEventCount,
      d.signupCount,
    ]);
    const suffix = orgFilter === 'ALL' ? '' : `-${getOrganizationByDbType(orgFilter).slug}`;
    downloadCsv(`abteilungen${suffix}-${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Alle' },
    { id: 'active', label: 'Mit kommenden Anlässen' },
    { id: 'noLeader', label: 'Ohne Leitung' },
    {
      id: 'noCeviDb',
      label: orgFilter !== 'ALL' && orgFilter !== 'OTHER' ? `Ohne ${providerLabel(orgFilter)}` : 'Ohne Verbands-DB',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Subdomain, Ortsgruppe oder Leitung"
            aria-label="Abteilungen suchen"
            autoComplete="off"
            className="h-12 w-full rounded-field border border-line bg-surface-2 pl-11 pr-11 text-base text-fg outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15 sm:text-[15px] [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Suche leeren"
              className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle transition hover:bg-surface-3 hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" onClick={exportCsv} disabled={visible.length === 0} title="Gefilterte Liste exportieren">
            <Download className="size-4" aria-hidden />
            Export (CSV)
          </Button>
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            {orgFilter === 'ALL' ? 'Neue Abteilung' : `Neue ${getOrganizationByDbType(orgFilter).unitTerm}`}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <ChipRow>
          {filters
            .filter((f) => f.id !== 'noCeviDb' || orgFilter !== 'OTHER')
            .map((f) => (
            <Chip key={f.id} selected={filter === f.id} count={all.filter((d) => matches(d, f.id)).length} onClick={() => setFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </ChipRow>

      </div>

      {loading && !departments ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-card" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title="Nichts gefunden"
          description={
            all.length === 0
              ? orgFilter === 'ALL'
                ? 'Es gibt noch keine Abteilungen.'
                : `Bei ${organizationLabel(orgFilter, true)} gibt es noch keine ${getOrganizationByDbType(orgFilter).unitTermPlural}.`
              : 'Mit dieser Suche gibt es keine Treffer.'
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {visible.map((d) => (
            <li key={d.id}>
              <Card interactive className="h-full">
                <button
                  type="button"
                  onClick={() => onOpen(d.id)}
                  className="flex h-full w-full flex-col gap-4 p-5 text-left outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
                >
                  <span className="flex items-center gap-3">
                    <DepartmentLogo name={d.name} logoUrl={d.logoUrl} color={d.primaryColor} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base font-semibold text-fg">{d.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="block truncate font-mono text-xs text-fg-subtle">
                          {d.slug}.{getOrganizationByDbType(d.organization).domain}
                        </span>
                        {orgFilter === 'ALL' && (
                          <Badge tone="outline" size="sm">
                            {organizationLabel(d.organization)}
                          </Badge>
                        )}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                  </span>
                  <dl className="tabular grid grid-cols-4 gap-2 text-center">
                    {(
                      [
                        ['Heim', d.homeUserCount],
                        ['Rollen', d.memberCount],
                        ['Anlässe', d.eventCount],
                        ['Einträge', d.signupCount],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="rounded-tile bg-surface-2 px-1 py-2">
                        <dd className="font-display text-lg font-bold leading-none text-fg">{value.toLocaleString('de-CH')}</dd>
                        <dt className="mt-1 text-2xs text-fg-subtle">{label}</dt>
                      </div>
                    ))}
                  </dl>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {d.leaders.length === 0 ? (
                      <Badge tone="warning">
                        <AlertTriangle aria-hidden />
                        Keine Leitung
                      </Badge>
                    ) : (
                      <span className="truncate text-xs text-fg-muted">
                        Leitung: {d.leaders.map((l) => l.name).join(', ')}
                      </span>
                    )}
                    <span className="ml-auto flex gap-1.5">
                      {groupId(d) !== null ? (
                        <Badge tone="outline">
                          {providerLabel(d.organization)} {groupId(d)}
                        </Badge>
                      ) : d.organization !== 'OTHER' ? (
                        <Badge>Ohne {providerLabel(d.organization)}</Badge>
                      ) : null}
                      {d.upcomingEventCount > 0 && <Badge tone="success">{d.upcomingEventCount} kommend</Badge>}
                    </span>
                  </span>
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CreateDepartmentDialog
        open={isCreating}
        defaultOrganization={orgFilter === 'ALL' ? 'CEVI' : orgFilter}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          onChanged();
          onOpen(id);
        }}
      />
    </div>
  );
}
