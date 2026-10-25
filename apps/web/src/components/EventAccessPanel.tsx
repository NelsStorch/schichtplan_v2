'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Download, Link2, Plus, Share2, Trash2, User, Users } from 'lucide-react';
import {
  PLACEHOLDER_LAST_NAME,
  REQUIRED_PROFILE_FIELDS,
  retentionNotice,
  type EventAccessLinkDto,
  type EventParticipantDto,
  zurichInputToIso,
} from '@schichtplan/shared';
import {
  Badge,
  Button,
  Callout,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Skeleton,
  cn,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtFullDate, fmtShortWeekday, fmtTime } from '@/lib/format';
import type { EventDetails } from '@/lib/types';
import { AccessTypeBadge } from './event-meta';

function linkUrl(slug: string, token: string) {
  return `${window.location.origin}/events/${slug}?zugang=${encodeURIComponent(token)}`;
}

/** OK-Dashboard: Wer darf sich eintragen, Zugangs-Links, Angaben der eingetragenen Personen */
export function EventAccessPanel({ event }: { event: EventDetails }) {
  return (
    <div className="space-y-8">
      <Card className="p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <AccessTypeBadge type={event.accessType} leadersOnly={event.leadersOnly} />
          {!event.allowPublicSignup && <Badge tone="warning">Eintragen geschlossen</Badge>}
        </div>
        <p className="mt-3 text-sm text-fg">
          Eintragen dürfen: <span className="font-semibold">{event.audience}</span>
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          Pflichtangaben:{' '}
          {event.requiredFields.length
            ? event.requiredFields.map((f) => REQUIRED_PROFILE_FIELDS[f].label).join(', ')
            : 'keine'}
          {event.questions.length > 0 && ` · ${event.questions.length} eigene Frage(n)`}. Pflichtangaben ändern unter
          «Einstellungen», Fragen unter «Fragen».
        </p>
      </Card>

      <AccessLinks eventSlug={event.slug} />
      <Participants event={event} />
    </div>
  );
}

function AccessLinks({ eventSlug }: { eventSlug: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [links, setLinks] = useState<EventAccessLinkDto[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLinks(await api<EventAccessLinkDto[]>(`/api/events/${eventSlug}/access-links`));
    } catch (err) {
      toast({ title: 'Links konnten nicht geladen werden', description: errorMessage(err), tone: 'error' });
      setLinks([]);
    }
  }, [eventSlug, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const share = async (link: EventAccessLinkDto) => {
    const url = linkUrl(eventSlug, link.token);
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: link.label, url });
        return;
      } catch {
        // abgebrochen: auf Kopieren zurückfallen
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(link.id);
    toast({ title: 'Link kopiert', description: 'Er gilt nur zusammen mit einer Anmeldung.' });
    setTimeout(() => setCopied((c) => (c === link.id ? null : c)), 2000);
  };

  const remove = async (link: EventAccessLinkDto) => {
    const ok = await confirm({
      title: `Link «${link.label}» löschen?`,
      description:
        link.redeemedBy.length > 0
          ? `${link.redeemedBy.length} Person(en) verlieren den Zugang. Bestehende Eintragungen bleiben.`
          : 'Der Link funktioniert danach nicht mehr.',
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/events/${eventSlug}/access-links/${link.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast({ title: 'Löschen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <section aria-labelledby="links-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="links-title" className="text-base font-bold text-fg">
            Zugangs-Links
          </h3>
          <p className="text-xs text-fg-muted">
            Für Personen, die die Bedingungen nicht erfüllen. Ein Konto braucht es trotzdem (Cevi-Name reicht).
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> Link erstellen
        </Button>
      </div>

      {links === null ? (
        <Skeleton className="h-24 rounded-card" />
      ) : links.length === 0 ? (
        <EmptyState
          icon={<Link2 />}
          title="Noch keine Links"
          description="Ein persönlicher Link gilt für eine Person, ein Gruppen-Link für alle, die ihn haben (z. B. Elternchat)."
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center gap-3 p-4">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full',
                  link.kind === 'GROUP' ? 'bg-accent/12 text-accent-ink' : 'bg-surface-2 text-fg-muted'
                )}
              >
                {link.kind === 'GROUP' ? <Users className="size-4" /> : <User className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                  {link.label}
                  <Badge size="sm">{link.kind === 'GROUP' ? 'Gruppe' : 'Persönlich'}</Badge>
                  {link.isExpired && (
                    <Badge size="sm" tone="danger">
                      Abgelaufen
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {link.redeemedBy.length === 0
                    ? link.kind === 'PERSONAL'
                      ? 'Noch nicht eingelöst'
                      : 'Noch niemand'
                    : `Eingelöst von ${link.redeemedBy.map((r) => r.displayName).join(', ')}`}
                  {link.expiresAt && ` · gültig bis ${fmtFullDate(link.expiresAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => share(link)} disabled={link.isExpired}>
                  {copied === link.id ? <Check /> : <Share2 />}
                  <span className="hidden sm:inline">{copied === link.id ? 'Kopiert' : 'Teilen'}</span>
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => remove(link)}
                  aria-label={`Link ${link.label} löschen`}
                  className="hover:text-danger-ink"
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateLinkDialog
        open={creating}
        eventSlug={eventSlug}
        onClose={() => setCreating(false)}
        onCreated={async (token, label) => {
          setCreating(false);
          await load();
          try {
            await navigator.clipboard.writeText(linkUrl(eventSlug, token));
            toast({ title: `Link für ${label} kopiert`, description: 'Füge ihn im Chat oder in einer E-Mail ein.' });
          } catch {
            toast({ title: 'Link erstellt' });
          }
        }}
      />
    </section>
  );
}

function CreateLinkDialog({
  open,
  eventSlug,
  onClose,
  onCreated,
}: {
  open: boolean;
  eventSlug: string;
  onClose: () => void;
  onCreated: (token: string, label: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'PERSONAL' | 'GROUP'>('PERSONAL');
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ token: string }>(`/api/events/${eventSlug}/access-links`, {
        method: 'POST',
        json: {
          label: label.trim(),
          kind,
          // Gültig bis Ende des gewählten Tages in Schweizer Zeit
          expiresAt: expires ? zurichInputToIso(`${expires}T23:59`) : null,
        },
      });
      onCreated(res.token, label.trim());
      setLabel('');
      setExpires('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const kinds = [
    {
      value: 'PERSONAL' as const,
      title: 'Persönlich',
      text: 'Gilt nur für das erste Konto, das ihn öffnet.',
      icon: User,
    },
    {
      value: 'GROUP' as const,
      title: 'Gruppe',
      text: 'Gilt für alle, die den Link haben, z. B. im Gruppenchat.',
      icon: Users,
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} icon={<Link2 />} title="Zugangs-Link erstellen">
      <form onSubmit={submit} className="space-y-5">
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="Für wen?" required hint="Nur für dich sichtbar, z. B. «Mami von Falk» oder «Elternchat Hiskia».">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus minLength={2} maxLength={100} />
        </Field>
        <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Art des Links">
          {kinds.map((k) => {
            const Icon = k.icon;
            const selected = kind === k.value;
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKind(k.value)}
                className={cn(
                  'flex gap-3 rounded-field border p-4 text-left transition-colors',
                  selected ? 'border-accent bg-accent/8' : 'border-line hover:border-line-strong'
                )}
              >
                <Icon className={cn('mt-0.5 size-5 shrink-0', selected ? 'text-accent-ink' : 'text-fg-subtle')} />
                <span>
                  <span className="block text-sm font-semibold text-fg">{k.title}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{k.text}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Field label="Gültig bis (optional)">
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={saving} disabled={label.trim().length < 2}>
            <Copy /> Erstellen und kopieren
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  // Formeln in Excel verhindern
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function Participants({ event }: { event: EventDetails }) {
  const [people, setPeople] = useState<EventParticipantDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<EventParticipantDto[]>(`/api/events/${event.slug}/participants`)
      .then(setPeople)
      .catch((err) => setError(errorMessage(err)));
  }, [event.slug]);

  const answerText = (question: EventDetails['questions'][number], value: string | undefined) =>
    !value ? '' : question.type === 'YES_NO' ? (value === 'JA' ? 'Ja' : 'Nein') : value;

  /** Antworten pro Eintragung als «Schicht (Tag Zeit): Antwort» */
  const perSignup = (question: EventDetails['questions'][number], person: EventParticipantDto) =>
    person.signupAnswers
      .filter((sa) => sa.answers[question.id])
      .map((sa) => ({
        label: `${sa.shiftTitle} (${fmtShortWeekday(sa.startTime)} ${fmtTime(sa.startTime)})`,
        text: answerText(question, sa.answers[question.id]),
      }));

  const download = () => {
    if (!people) return;
    const header = [
      'Name',
      'Vorname',
      'Nachname',
      'E-Mail',
      'Handy',
      'Geburtsdatum',
      'Abteilung',
      'Schichten',
      ...event.questions.map((q) => q.label),
    ];
    const rows = people.map((p) => [
      p.displayName,
      p.firstName,
      p.lastName === PLACEHOLDER_LAST_NAME ? '' : p.lastName,
      p.email,
      p.phone,
      p.birthDate,
      p.homeDepartmentName,
      p.shiftCount,
      ...event.questions.map((q) =>
        q.scope === 'PER_SIGNUP'
          ? perSignup(q, p)
              .map((a) => `${a.label}: ${a.text}`)
              .join(' | ')
          : answerText(q, p.answers[q.id])
      ),
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.slug}-helfer.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="people-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="people-title" className="text-base font-bold text-fg">
            Angaben der Helfenden
          </h3>
          <p className="text-xs text-fg-muted">Kontaktangaben und Antworten aller Eingetragenen. Nur für das OK.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={download} disabled={!people?.length}>
          <Download /> CSV
        </Button>
      </div>

      {error ? (
        <Callout tone="danger">{error}</Callout>
      ) : people === null ? (
        <Skeleton className="h-40 rounded-card" />
      ) : people.length === 0 ? (
        <EmptyState icon={<Users />} title="Noch niemand eingetragen" />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-surface-2 text-xs font-semibold text-fg-subtle">
              <tr>
                <th className="px-4 py-2.5">Person</th>
                <th className="px-4 py-2.5">Kontakt</th>
                <th className="px-4 py-2.5">Schichten</th>
                {event.questions.map((q) => (
                  <th key={q.id} className="px-4 py-2.5">
                    {q.label}
                    <span className="block font-normal text-fg-subtle">{retentionNotice(q.retentionDays)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {people.map((p) => (
                <tr key={p.userId ?? p.displayName} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-fg">{p.displayName}</p>
                    <p className="text-xs text-fg-muted">
                      {[
                        p.firstName && p.lastName && p.lastName !== PLACEHOLDER_LAST_NAME
                          ? `${p.firstName} ${p.lastName}`
                          : null,
                        p.homeDepartmentName ?? 'ohne Abteilung',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {p.viaLink && (
                      <Badge size="sm" className="mt-1">
                        <Link2 className="size-3" /> über Link
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-muted">
                    {p.phone && (
                      <a href={`tel:${p.phone}`} className="block text-fg hover:underline">
                        {p.phone}
                      </a>
                    )}
                    {p.email && (
                      <a href={`mailto:${p.email}`} className="block break-all hover:underline">
                        {p.email}
                      </a>
                    )}
                    {p.birthDate && <span className="block">geb. {p.birthDate.split('-').reverse().join('.')}</span>}
                  </td>
                  <td className="tabular px-4 py-3 text-fg">{p.shiftCount}</td>
                  {event.questions.map((q) => (
                    <td key={q.id} className="px-4 py-3 text-fg">
                      {q.scope === 'PER_SIGNUP' ? (
                        perSignup(q, p).length ? (
                          <ul className="space-y-0.5">
                            {perSignup(q, p).map((a, i) => (
                              <li key={i}>
                                <span className="text-xs text-fg-subtle">{a.label}:</span> {a.text}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-fg-subtle">–</span>
                        )
                      ) : (
                        answerText(q, p.answers[q.id]) || <span className="text-fg-subtle">–</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
