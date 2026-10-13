'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, Building2, CalendarClock, Mail, Phone, Users } from 'lucide-react';
import { Avatar, Badge, Callout, Dialog, EmptyState, Skeleton } from '@schichtplan/ui';
import type { AdminUserDetailDto, AdminUserListItemDto } from '@schichtplan/shared';
import { api, departmentUrl, errorMessage } from '../lib/api';
import {
  ageFromBirthDate,
  departmentRoleLabels,
  formatBirthDate,
  formatDate,
  formatDateTime,
  formatShiftStart,
  fullName,
  organizerRoleLabels,
} from '../lib/format';
import { LoginMethodBadges } from './LoginMethodBadges';

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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

const Missing = () => <span className="font-normal text-fg-subtle">–</span>;

/** Details einer Person. Die Kopfzeile erscheint sofort aus der Liste, der Rest wird nachgeladen. */
export function UserDialog({
  preview,
  onClose,
}: {
  preview: AdminUserListItemDto | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = preview?.id;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setDetail(null);
    setError(null);
    api<AdminUserDetailDto>(`/api/admin/users/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(setDetail)
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [id]);

  // Solange der Detail-Abruf läuft, reichen die Listendaten für alles ausser den Verknüpfungen.
  // Die ID-Prüfung verhindert einen Frame mit den Daten der zuvor geöffneten Person.
  const loaded = detail && detail.id === id ? detail : null;
  const user = loaded ?? preview;
  const loadingDetail = Boolean(preview) && !loaded && !error;

  return (
    <Dialog
      open={Boolean(preview)}
      onClose={onClose}
      size="lg"
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
            {user.ceviDbId && (
              <a
                href={`https://login.cevi-schichtplan.ch/cevidb-daten?userId=${encodeURIComponent(user.id)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                Cevi.DB Rohdaten prüfen ↗
              </a>
            )}
          </div>

          <div className="mt-6">
            <Section title="Kontakt">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Fact label="E-Mail">
                  {user.email ? (
                    <a
                      href={`mailto:${user.email}`}
                      className="inline-flex items-center gap-1.5 text-accent-ink underline-offset-4 hover:underline"
                    >
                      <Mail className="size-3.5 shrink-0" aria-hidden />
                      <span className="break-all">{user.email}</span>
                    </a>
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
                <Fact label="Cevi.DB-ID">
                  {user.ceviDbId !== null ? <span className="font-mono tabular">{user.ceviDbId}</span> : <Missing />}
                </Fact>
                <Fact label="Registriert">{formatDateTime(user.createdAt)}</Fact>
                <Fact label="Zuletzt geändert">{formatDateTime(user.updatedAt)}</Fact>
                <Fact label="Eintragungen">
                  <span className="tabular">{user.signupCount}</span>
                </Fact>
              </dl>
            </Section>

            <Section title="Abteilungen" count={user.memberships.length}>
              {user.memberships.length === 0 ? (
                <p className="text-sm text-fg-subtle">Noch keiner Abteilung zugeordnet.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                  {user.memberships.map((m) => (
                    <li key={m.departmentId} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-surface-2 text-fg-muted">
                        <Building2 className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fg">{m.departmentName}</span>
                        <span className="block truncate font-mono text-xs text-fg-subtle">{m.departmentSlug}</span>
                      </span>
                      <Badge tone={m.role === 'ADMIN' ? 'accent' : 'neutral'}>
                        {departmentRoleLabels[m.role] ?? m.role}
                      </Badge>
                      <a
                        href={departmentUrl(m.departmentSlug)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${m.departmentName} öffnen`}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-fg-subtle transition hover:bg-surface-2 hover:text-fg"
                      >
                        <ArrowUpRight className="size-4" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
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
                            <span className="block truncate text-sm font-semibold text-fg">{s.shiftTitle}</span>
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
          </div>
        </>
      )}
    </Dialog>
  );
}
