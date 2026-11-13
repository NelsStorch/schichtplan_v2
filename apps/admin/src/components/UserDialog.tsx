'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, Building2, CalendarClock, GitMerge, History, KeyRound, Mail, ShieldCheck, Phone, Plus, Trash2, Users } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Dialog,
  EmptyState,
  Select,
  Skeleton,
  Switch,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import {
  normalizePermissions,
  getVocabulary,
  type AdminDepartmentListItemDto,
  type AdminUserDetailDto,
  type AdminUserListItemDto,
  type AdminUserMembershipDto,
  type DepartmentPermission,
} from '@schichtplan/shared';
import { api, departmentUrl, errorMessage, send } from '../lib/api';
import { ACCESS_OPTIONS, CUSTOM_ACCESS, accessLabel, accessPayload, accessValue } from '../lib/access';
import {
  ageFromBirthDate,
  formatBirthDate,
  formatDate,
  formatDateTime,
  formatLastSeen,
  formatShiftStart,
  fullName,
  organizerRoleLabels,
} from '../lib/format';
import { AccessDiagnosis } from './AccessDiagnosis';
import { AdminPermissionChecks } from './DepartmentDialog';
import { LoginMethodBadges } from './LoginMethodBadges';
import { PersonPicker } from './PersonPicker';

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        {title}
        {count !== undefined && <span className="tabular rounded-full bg-surface-3 px-1.5 text-fg-muted">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

const Missing = () => <span className="font-normal text-fg-subtle">–</span>;

function UserMembershipRow({
  membership: m,
  ceviNameOnly,
  saving,
  onSetMembership,
  onSetPermissions,
  onOpenDepartment,
}: {
  membership: AdminUserMembershipDto;
  ceviNameOnly: boolean;
  saving: boolean;
  onSetMembership: (departmentId: string, value: string) => void;
  onSetPermissions: (departmentId: string, permissions: DepartmentPermission[]) => void;
  onOpenDepartment?: (departmentId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DepartmentPermission[]>(m.permissions);
  const value = accessValue(m.role, m.permissions);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-surface-2 text-fg-muted">
          <Building2 className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          {onOpenDepartment ? (
            <button
              type="button"
              onClick={() => onOpenDepartment(m.departmentId)}
              className="block truncate text-left text-sm font-semibold text-fg hover:text-accent hover:underline"
            >
              {m.departmentName}
            </button>
          ) : (
            <span className="block truncate text-sm font-semibold text-fg">{m.departmentName}</span>
          )}
          <span className="block truncate font-mono text-xs text-fg-subtle">{m.departmentSlug}</span>
        </span>
        <span className="w-44 shrink-0">
          <Select
            value={value}
            disabled={saving}
            onChange={(e) => onSetMembership(m.departmentId, e.target.value)}
            aria-label={`Zugang in ${m.departmentName}`}
            className="h-10 text-sm sm:text-sm"
          >
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
            <option value="">Zugehörigkeit entfernen</option>
          </Select>
        </span>
        {m.role === 'HELPER' && !ceviNameOnly && (
          <Button
            size="sm"
            variant={editing ? 'primary' : 'ghost'}
            onClick={() => {
              setDraft(m.permissions);
              setEditing(!editing);
            }}
            aria-expanded={editing}
          >
            Rechte
          </Button>
        )}
        <a
          href={departmentUrl(m.departmentSlug, '/', m.departmentOrganization)}
          target="_blank"
          rel="noreferrer"
          aria-label={`${m.departmentName} in neuem Tab öffnen`}
          title="Abteilungsseite öffnen"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-fg-subtle transition hover:bg-surface-2 hover:text-fg"
        >
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
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
              disabled={saving}
              onClick={() => {
                onSetPermissions(m.departmentId, normalizePermissions(draft));
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

/** Details einer Person. Die Kopfzeile erscheint sofort aus der Liste, der Rest wird nachgeladen. */
export function UserDialog({
  preview,
  currentUserId,
  onClose,
  onChanged,
  onOpenDepartment,
  onOpenAudit,
  onSwitchUser,
}: {
  preview: AdminUserListItemDto | null;
  currentUserId?: string;
  onClose: () => void;
  /** Nach Löschen oder geänderten Rollen: Listen neu laden */
  onChanged?: () => void;
  onOpenDepartment?: (departmentId: string) => void;
  onOpenAudit?: (userId: string, label: string) => void;
  onSwitchUser?: (user: AdminUserListItemDto) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [detail, setDetail] = useState<AdminUserDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [, setResetModalUrl] = useState<string | null>(null);
  const [generatingReset, setGeneratingReset] = useState(false);

  const handleGenerateReset = async () => {
    if (!user?.id) return;
    setGeneratingReset(true);
    try {
      const res = await api<{ message: string; token: string; resetUrl: string; expiresAt: string }>(
        `/api/admin/users/${user.id}/reset-token`,
        { method: 'POST' }
      );
      setResetModalUrl(res.resetUrl);
      toast({
        tone: 'success',
        title: 'Reset-Link erstellt',
        description: 'Der Link ist 24 Stunden gültig.',
      });
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Erstellung fehlgeschlagen',
        description: errorMessage(err),
      });
    } finally {
      setGeneratingReset(false);
    }
  };
  const [resettingTwoFactor, setResettingTwoFactor] = useState(false);

  const handleResetTwoFactor = async () => {
    if (!user?.id) return;
    const ok = await confirm({
      title: 'Zwei-Faktor zurücksetzen?',
      description:
        'Die Person kann sich danach wieder nur mit Passwort bzw. Verbands-Login anmelden und muss 2FA neu einrichten. Prüfe vorher, dass die Anfrage wirklich von ihr kommt.',
      confirmLabel: 'Zurücksetzen',
      tone: 'danger',
    });
    if (!ok) return;
    setResettingTwoFactor(true);
    try {
      await api(`/api/admin/users/${user.id}/2fa/reset`, { method: 'POST' });
      toast({ tone: 'success', title: 'Zwei-Faktor zurückgesetzt' });
      setReload((n) => n + 1);
    } catch (err) {
      toast({ tone: 'error', title: 'Zurücksetzen fehlgeschlagen', description: errorMessage(err) });
    } finally {
      setResettingTwoFactor(false);
    }
  };
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<AdminUserListItemDto | null>(null);
  const [reload, setReload] = useState(0);
  const [departments, setDepartments] = useState<AdminDepartmentListItemDto[] | null>(null);
  const [addDepartmentId, setAddDepartmentId] = useState('');
  const [addRole, setAddRole] = useState('HELPER');
  const id = preview?.id;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setError(null);
    api<AdminUserDetailDto>(`/api/admin/users/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(setDetail)
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [id, reload]);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      setAddDepartmentId('');
      setMergeTarget(null);
      return;
    }
    setMergeTarget(null);
    if (departments) return;
    api<{ items: AdminDepartmentListItemDto[] }>('/api/admin/departments')
      .then((r) => setDepartments(r.items))
      .catch(() => setDepartments([]));
  }, [id, departments]);

  // Solange der Detail-Abruf läuft, reichen die Listendaten für alles ausser den Verknüpfungen.
  // Die ID-Prüfung verhindert einen Frame mit den Daten der zuvor geöffneten Person.
  const loaded = detail && detail.id === id ? detail : null;
  const user = loaded ?? preview;
  const loadingDetail = Boolean(preview) && !loaded && !error;
  const isSelf = Boolean(user && currentUserId && user.id === currentUserId);
  const ceviNameOnly = Boolean(user?.loginMethods.includes('CEVINAME'));
  const providerVocab = getVocabulary(user?.provider ?? 'CEVI');

  /** Änderung speichern, danach Detail und Listen neu laden */
  const change = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await action();
      toast({ title: success, tone: 'success' });
      setReload((n) => n + 1);
      onChanged?.();
    } catch (err) {
      toast({ title: 'Nicht gespeichert', description: errorMessage(err), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const setGlobalAdmin = async (value: boolean) => {
    if (!user) return;
    if (value) {
      const ok = await confirm({
        title: `${fullName(user)} zur globalen Admin machen?`,
        description:
          'Globale Admins sehen alle Personen mit Kontaktdaten, gelten in jeder Abteilung als Abteilungsleitung und können Abteilungen löschen.',
        confirmLabel: 'Admin-Rechte geben',
        cancelLabel: 'Abbrechen',
      });
      if (!ok) return;
    }
    await change(
      () => send(`/api/admin/users/${user.id}`, 'PATCH', { isGlobalAdmin: value }),
      value ? 'Ist jetzt globale Admin' : 'Admin-Rechte entzogen'
    );
  };

  /** value: Auswahl aus ACCESS_OPTIONS (Abteilungsleitung, Vorlage, ohne Rechte) oder '' = entfernen */
  const setMembership = async (departmentId: string, value: string) => {
    if (!user || value === CUSTOM_ACCESS) return;
    const payload = value ? accessPayload(value) : null;
    await change(
      () =>
        payload
          ? send(`/api/admin/departments/${departmentId}/members/${user.id}`, 'PUT', payload)
          : send(`/api/admin/departments/${departmentId}/members/${user.id}`, 'DELETE'),
      payload ? `Zugang: ${accessLabel(payload.role, payload.permissions)}` : 'Zugehörigkeit entfernt'
    );
  };

  const setCustomPermissions = async (departmentId: string, permissions: DepartmentPermission[]) => {
    if (!user) return;
    const payload = { role: 'HELPER' as const, permissions };
    await change(
      () => send(`/api/admin/departments/${departmentId}/members/${user.id}`, 'PUT', payload),
      `Zugang: ${accessLabel(payload.role, payload.permissions)}`
    );
  };

  const setHomeDepartment = async (homeDepartmentId: string | null) => {
    if (!user) return;
    await change(
      () => send(`/api/admin/users/${user.id}`, 'PATCH', { homeDepartmentId }),
      homeDepartmentId ? 'Heimabteilung gespeichert' : 'Heimabteilung entfernt'
    );
  };

  const handleMerge = async () => {
    if (!user || !mergeTarget) return;
    const sourceName = fullName(user);
    const targetName = fullName(mergeTarget);
    const ok = await confirm({
      title: `«${sourceName}» in «${targetName}» zusammenführen?`,
      description: `Alle Schichteintragungen, Antworten, Stufen, OK-Aufgaben und Abteilungszugehörigkeiten von ${sourceName} werden auf ${targetName} übertragen. Danach wird das Quell-Konto (${sourceName}) gelöscht. Das lässt sich nicht rückgängig machen.`,
      confirmLabel: 'Konten zusammenführen',
      cancelLabel: 'Abbrechen',
      tone: 'danger',
    });
    if (!ok) return;

    setMerging(true);
    try {
      await send(`/api/admin/users/${encodeURIComponent(user.id)}/merge`, 'POST', {
        targetUserId: mergeTarget.id,
      });
      toast({
        title: 'Konten zusammengeführt',
        description: `${sourceName} wurde in ${targetName} überführt.`,
        tone: 'success',
      });
      onChanged?.();
      if (onSwitchUser) {
        onSwitchUser(mergeTarget);
      } else {
        onClose();
      }
    } catch (err) {
      toast({
        title: 'Zusammenführen fehlgeschlagen',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setMerging(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    if (isSelf) {
      toast({
        title: 'Nicht möglich',
        description: 'Du kannst dein eigenes Admin-Konto nicht löschen.',
        tone: 'error',
      });
      return;
    }

    const name = fullName(user);
    const confirmed = await confirm({
      title: `${name} wirklich löschen?`,
      description: `Möchtest du das Konto von ${name} wirklich unwiderruflich löschen? Alle Schichteintragungen, Abteilungs- und OK-Mitgliedschaften werden dabei vollständig entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`,
      confirmLabel: 'Person endgültig löschen',
      cancelLabel: 'Abbrechen',
      tone: 'danger',
      countdownSeconds: 7,
    });

    if (!confirmed) return;

    setDeleting(true);
    try {
      await api(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
      });
      toast({
        title: 'Person gelöscht',
        description: `${name} wurde vollständig gelöscht.`,
        tone: 'success',
      });
      onChanged?.();
      onClose();
    } catch (err) {
      toast({
        title: 'Fehler beim Löschen',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={Boolean(preview)}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {user && !isSelf && (
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={deleting}
              className="sm:mr-auto"
            >
              <Trash2 className="size-4" aria-hidden />
              {deleting ? 'Wird gelöscht …' : 'Person löschen'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Schliessen
          </Button>
        </>
      }
      title={
        user ? (
          <span className="flex items-center gap-3">
            <Avatar name={fullName(user)} highlight={user.isGlobalAdmin} />
            <span className="min-w-0">
              <span className="block truncate">{fullName(user)}</span>
              {user.ceviName && user.ceviName !== user.firstName && (
                <span className="block truncate text-sm font-medium text-fg-muted">{user.ceviName}</span>
              )}
            </span>
          </span>
        ) : (
          'Person'
        )
      }
    >
      {user && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LoginMethodBadges methods={user.loginMethods} isAdmin={user.isGlobalAdmin} />
            <div className="flex flex-wrap items-center gap-3">
              {onOpenAudit && (
                <button
                  type="button"
                  onClick={() => onOpenAudit(user.id, fullName(user))}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg hover:underline"
                >
                  <History className="size-3.5" aria-hidden />
                  Im Protokoll zeigen
                </button>
              )}
            </div>
          </div>

          <div className="mt-6">
            {user.potentialDuplicateOf && (
              <Callout tone="warning" className="mb-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-fg">Mögliche Dublette gefunden</p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      Für diese Person wurde ein sehr ähnliches Zweitkonto gefunden ({user.potentialDuplicateOf.name}).
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        const res = await api<{ items: AdminUserListItemDto[] }>(
                          `/api/admin/users?q=${encodeURIComponent(user.potentialDuplicateOf!.id)}`
                        );
                        if (res.items.length > 0) {
                          setMergeTarget(res.items[0]);
                          toast({
                            tone: 'info',
                            title: 'Ziel-Konto ausgewählt',
                            description: `${fullName(res.items[0])} wurde im Zusammenführen-Bereich ausgewählt.`,
                          });
                        }
                      } catch (err) {
                        toast({
                          tone: 'error',
                          title: 'Laden fehlgeschlagen',
                          description: errorMessage(err),
                        });
                      }
                    }}
                  >
                    <GitMerge className="size-3.5" aria-hidden />
                    Zusammenführung vorbereiten
                  </Button>
                </div>
              </Callout>
            )}

            <Section title="Kontakt">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Fact label="E-Mail">
                  {user.email ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <a
                        href={`mailto:${user.email}`}
                        className="inline-flex items-center gap-1.5 text-accent-ink underline-offset-4 hover:underline"
                      >
                        <Mail className="size-3.5 shrink-0" aria-hidden />
                        <span className="break-all">{user.email}</span>
                      </a>
                      {user.emailVerified !== undefined && (
                        <Badge tone={user.emailVerified ? 'success' : 'warning'}>
                          {user.emailVerified ? 'Bestätigt' : 'Unbestätigt'}
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <Missing />
                  )}
                </Fact>
                <Fact label="Handynummer">
                  {user.phone ? (
                    <a
                      href={`tel:${user.phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1.5 text-accent-ink underline-offset-4 hover:underline"
                    >
                      <Phone className="size-3.5 shrink-0" aria-hidden />
                      {user.phone}
                    </a>
                  ) : (
                    <Missing />
                  )}
                </Fact>
                <Fact label="Geburtsdatum">
                  {user.birthDate ? (
                    <>
                      {formatBirthDate(user.birthDate)}
                      <span className="ml-2 font-normal text-fg-muted">{ageFromBirthDate(user.birthDate)} Jahre</span>
                    </>
                  ) : (
                    <Missing />
                  )}
                </Fact>
              </dl>
            </Section>

            <Section title="Konto">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Switch
                    checked={user.isGlobalAdmin}
                    onChange={(value) => {
                      // Vergeben nur an Cevi.DB-Konten, entziehen geht immer (ausser bei sich selbst)
                      if (!saving && !isSelf && (!value || user.ceviDbId !== null)) setGlobalAdmin(value);
                    }}
                    label="Globale Admin"
                    description={
                      isSelf
                        ? 'Deine eigenen Admin-Rechte kannst du hier nicht entziehen.'
                        : user.ceviDbId === null && !user.isGlobalAdmin
                          ? 'Nur für Konten mit Cevi.DB möglich. Die Person muss sich zuerst einmal mit Cevi.DB anmelden.'
                          : 'Zugang zu diesem Admin-Portal (nur mit Cevi.DB-Anmeldung) und Leitungsrechte in allen Abteilungen. Alle Admins bekommen eine Mail.'
                    }
                  />
                </div>
                <Fact label={`${providerVocab.authProvider}-ID`}>
                  {user.ceviDbId !== null ? <span className="font-mono tabular">{user.ceviDbId}</span> : <Missing />}
                </Fact>
                {user.ceviDbId !== null && (
                  <>
                    <Fact label={`${providerVocab.authProvider}-Gruppe`}>
                      {user.ceviDbOrtsgruppeName ? (
                        <span>
                          {user.ceviDbOrtsgruppeName}
                          {user.ceviDbOrtsgruppeId && (
                            <span className="ml-1.5 font-mono text-xs font-normal tabular text-fg-muted">
                              (ID {user.ceviDbOrtsgruppeId})
                            </span>
                          )}
                        </span>
                      ) : (
                        <Missing />
                      )}
                    </Fact>
                    <Fact label={`${providerVocab.authProvider}-${providerVocab.departmentLeader}`}>
                      {user.ceviDbDepartmentLeader ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-accent-ink">
                          Ja
                          {user.ceviDbLeaderGroupName && (
                            <span className="font-normal text-fg-muted">
                              ({user.ceviDbLeaderGroupName})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-fg-muted">Nein</span>
                      )}
                    </Fact>
                  </>
                )}
                <Fact label="Notfall-Passwort-Reset" wide>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleGenerateReset}
                      disabled={generatingReset}
                    >
                      <KeyRound className="size-3.5" aria-hidden />
                      {generatingReset ? 'Wird erstellt …' : 'Reset-Link generieren (24h)'}
                    </Button>
                    <span className="text-xs text-fg-subtle">
                      Erstellt einen Notfall-Einmallink zur direkten Neuvergabe des Passworts.
                    </span>
                  </div>
                </Fact>
                <Fact label="Zwei-Faktor" wide>
                  {detail?.twoFactorEnabled ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 font-medium text-accent-ink">
                        <ShieldCheck className="size-3.5" aria-hidden /> Eingeschaltet
                      </span>
                      <Button size="sm" variant="secondary" onClick={handleResetTwoFactor} disabled={resettingTwoFactor}>
                        {resettingTwoFactor ? 'Wird zurückgesetzt …' : 'Zurücksetzen'}
                      </Button>
                      <span className="text-xs text-fg-subtle">Nur wenn Handy und Wiederherstellungscodes verloren sind.</span>
                    </div>
                  ) : (
                    <span className="text-fg-muted">Aus</span>
                  )}
                </Fact>
                <Fact label="Registriert">{formatDateTime(user.createdAt)}</Fact>
                <Fact label="Zuletzt aktiv">{formatLastSeen(user.lastSeenOn)}</Fact>
                <Fact label="Zuletzt geändert">{formatDateTime(user.updatedAt)}</Fact>
                <Fact label="Eintragungen">
                  <span className="tabular">{user.signupCount}</span>
                </Fact>
                <Fact label="Heimabteilung">
                  <div className="flex flex-wrap items-center gap-2">
                    {departments ? (
                      <Select
                        value={user.homeDepartmentId ?? ''}
                        disabled={saving}
                        onChange={(e) => setHomeDepartment(e.target.value || null)}
                        aria-label="Heimabteilung"
                        className="h-9 max-w-56 text-xs sm:text-xs"
                      >
                        <option value="">Keine Heimabteilung</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
                    ) : user.homeDepartmentName ? (
                      <span>{user.homeDepartmentName}</span>
                    ) : (
                      <Missing />
                    )}
                    {user.homeDepartmentSource && (
                      <Badge tone="outline">
                        {user.homeDepartmentSource === 'CEVIDB' ? `aus ${providerVocab.authProvider}` : 'selbst gewählt'}
                      </Badge>
                    )}
                  </div>
                </Fact>
                <Fact label="Stufe" wide>
                  {!loaded ? (
                    <Skeleton className="h-5 w-40" />
                  ) : loaded.stufen.length === 0 ? (
                    <Missing />
                  ) : (
                    <ul className="space-y-1">
                      {loaded.stufen.map((stufe) => (
                        <li key={stufe.groupId} className="flex flex-wrap items-baseline gap-x-2">
                          <span>{stufe.groupName}</span>
                          <span className="font-normal text-fg-muted">{stufe.roleNames.join(', ')}</span>
                          {stufe.isPrimary && loaded.stufen.length > 1 && (
                            <span className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                              Haupt-Stufe
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Fact>
              </dl>
            </Section>

            <Section title="Abteilungen" count={user.memberships.length}>
              {user.memberships.length === 0 ? (
                <p className="text-sm text-fg-subtle">Noch keiner Abteilung mit einer Rolle zugeordnet.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                  {user.memberships.map((m) => (
                    <UserMembershipRow
                      key={`${m.departmentId}-${m.role}-${m.permissions.join()}`}
                      membership={m}
                      ceviNameOnly={ceviNameOnly}
                      saving={saving}
                      onSetMembership={setMembership}
                      onSetPermissions={setCustomPermissions}
                      onOpenDepartment={
                        onOpenDepartment
                          ? (deptId) => {
                              onClose();
                              onOpenDepartment(deptId);
                            }
                          : undefined
                      }
                    />
                  ))}
                </ul>
              )}
              {departments?.some((d) => !user.memberships.some((m) => m.departmentId === d.id)) && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <div className="flex-1">
                    <Select
                      value={addDepartmentId}
                      onChange={(e) => setAddDepartmentId(e.target.value)}
                      aria-label="Abteilung wählen"
                      className="h-10 text-sm sm:text-sm"
                    >
                      <option value="">Abteilung hinzufügen …</option>
                      {departments
                        .filter((d) => !user.memberships.some((m) => m.departmentId === d.id))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                  <div className="sm:w-44">
                    <Select
                      value={addRole}
                      onChange={(e) => setAddRole(e.target.value)}
                      aria-label="Rolle"
                      className="h-10 text-sm sm:text-sm"
                    >
                      {ACCESS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value} disabled={ceviNameOnly && o.needsAccount}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    disabled={!addDepartmentId || saving || (ceviNameOnly && addRole !== 'HELPER')}
                    onClick={async () => {
                      await setMembership(addDepartmentId, addRole);
                      setAddDepartmentId('');
                    }}
                  >
                    <Plus aria-hidden />
                    Hinzufügen
                  </Button>
                </div>
              )}
            </Section>

            <Section title="Berechtigungs-Diagnose">
              <AccessDiagnosis key={user.id} userId={user.id} />
            </Section>

            {error && <Callout tone="danger">{error}</Callout>}

            {loadingDetail && (
              <Section title="Organisation und Eintragungen">
                <div className="space-y-2">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              </Section>
            )}

            {loaded && (
              <>
                <Section title="Organisationskomitee" count={loaded.organizedEvents.length}>
                  {loaded.organizedEvents.length === 0 ? (
                    <p className="text-sm text-fg-subtle">In keinem OK.</p>
                  ) : (
                    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                      {loaded.organizedEvents.map((o) => (
                        <li key={o.eventId} className="flex items-center gap-3 px-4 py-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-surface-2 text-fg-muted">
                            <Users className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-fg">{o.eventTitle}</span>
                            <span className="block truncate text-xs text-fg-subtle">{o.departmentName}</span>
                          </span>
                          <Badge>{o.roleTitle || organizerRoleLabels[o.role] || o.role}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="Letzte Eintragungen" count={loaded.signupCount}>
                  {loaded.signups.length === 0 ? (
                    <EmptyState title="Noch keine Eintragungen" className="py-8" />
                  ) : (
                    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                      {loaded.signups.map((s) => (
                        <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-surface-2 text-fg-muted">
                            <CalendarClock className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-fg">{s.shiftTitle || 'Schicht'}</span>
                            <span className="block truncate text-xs text-fg-subtle">
                              {s.eventTitle} · {s.departmentName}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="tabular block font-mono text-xs text-fg-muted">
                              {formatShiftStart(s.startTime)}
                            </span>
                            <span className="tabular block text-2xs text-fg-subtle">
                              eingetragen {formatDate(s.createdAt)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {loaded.signupCount > loaded.signups.length && (
                    <p className="mt-2 text-xs text-fg-subtle">
                      Gezeigt werden die neusten {loaded.signups.length} von {loaded.signupCount}.
                    </p>
                  )}
                </Section>
              </>
            )}

            {user && !isSelf && (
              <Section title="Gefahrenzone">
                <div className="space-y-4">
                  {!user.isGlobalAdmin && (
                    <div className="rounded-card border border-line bg-surface-2/50 p-4 sm:p-5">
                      <h4 className="text-sm font-semibold text-fg">Doppeltes Konto zusammenführen</h4>
                      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                        Überträgt alle Schichteintragungen, Antworten, Stufen und Abteilungszugehörigkeiten von{' '}
                        <span className="font-semibold text-fg">{fullName(user)}</span> auf ein anderes Ziel-Konto und
                        löscht danach dieses Profil.
                      </p>
                      <div className="mt-3 space-y-3">
                        <PersonPicker
                          value={mergeTarget}
                          onChange={setMergeTarget}
                          placeholder="Ziel-Konto suchen (Name, Cevi-Name, E-Mail) …"
                          disabledIds={[user.id]}
                        />
                        {mergeTarget && !ceviNameOnly && mergeTarget.loginMethods.includes('CEVINAME') && (
                          <p className="text-xs text-danger-ink">
                            Ein Konto mit {providerVocab.authProvider} oder Passwort kann nicht in ein reines Schnelllogin-Profil überführt
                            werden. Bitte öffne stattdessen das Schnelllogin-Profil und führe es hierher zusammen.
                          </p>
                        )}
                        <div className="flex justify-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleMerge}
                            disabled={
                              !mergeTarget ||
                              merging ||
                              (!ceviNameOnly && mergeTarget.loginMethods.includes('CEVINAME'))
                            }
                          >
                            <GitMerge className="size-4" aria-hidden />
                            {merging ? 'Wird zusammengeführt …' : 'In Ziel-Konto zusammenführen'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-card border border-danger/30 bg-danger/5 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-danger-ink">Konto unwiderruflich löschen</h4>
                        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                          Entfernt diese Person mitsamt allen Schichten, Abteilungsrollen und Verknüpfungen vollständig aus der Datenbank.
                        </p>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="shrink-0"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        {deleting ? 'Wird gelöscht …' : 'Person löschen'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Section>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
