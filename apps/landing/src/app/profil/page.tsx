'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Building2, CalendarDays, Database, LogOut } from 'lucide-react';
import {
  PLACEHOLDER_EMAIL_REGEX,
  PLACEHOLDER_LAST_NAME,
  STUFE_ROLES,
  getDepartmentSetupUrl,
  getDepartmentUrl,
  getLoginUrl,
  type UserDto,
} from '@schichtplan/shared';
import { Avatar, Badge, Button, Callout, Field, Input, ThemeToggle, buttonClasses } from '@schichtplan/ui';
import { CeviLogo } from '@/components/CeviLogo';

/** Antwort von GET /api/shifts/my (Schichten über alle Abteilungen) */
interface MyShift {
  signupId: string;
  title: string;
  taskTitle: string | null;
  startTime: string;
  endTime: string;
  eventTitle: string;
  eventSlug: string;
  departmentName: string;
  departmentSlug: string;
}

const dateFmt = new Intl.DateTimeFormat('de-CH', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Zurich',
});

/** Kleine Profilseite auf der Landingpage: Angaben, Abteilung & Stufen, eigene Schichten. */
export default function ProfilePage() {
  const [user, setUser] = useState<UserDto | null>(null);
  const [shifts, setShifts] = useState<MyShift[] | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', birthDate: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = getLoginUrl(window.location.href);
        return;
      }
      const me = (await res.json()) as UserDto;
      setUser(me);
      setForm({
        firstName: me.firstName ?? '',
        lastName: me.lastName === PLACEHOLDER_LAST_NAME ? '' : (me.lastName ?? ''),
        phone: me.phone ?? '',
        email: '',
        birthDate: me.birthDate ?? '',
        address: me.address ?? '',
      });
      const shiftsRes = await fetch('/api/shifts/my', { cache: 'no-store' });
      setShifts(shiftsRes.ok ? await shiftsRes.json() : []);
    })().catch(() => setMessage({ tone: 'danger', text: 'Profil konnte nicht geladen werden.' }));
  }, []);

  const hasRealEmail = Boolean(user?.email && !PLACEHOLDER_EMAIL_REGEX.test(user.email));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const payload: Record<string, string> = {};
    if (form.firstName.trim()) payload.firstName = form.firstName.trim();
    if (form.lastName.trim()) payload.lastName = form.lastName.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.birthDate) payload.birthDate = form.birthDate;
    if (form.address.trim()) payload.address = form.address.trim();
    if (!hasRealEmail && form.email.trim()) payload.email = form.email.trim();
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Speichern hat nicht geklappt.');
      setUser(data as UserDto);
      setMessage({ tone: 'success', text: 'Gespeichert.' });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Speichern hat nicht geklappt.' });
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  };

  const upcoming = (shifts ?? []).filter((s) => new Date(s.endTime).getTime() > Date.now());
  const name = user ? user.ceviName || user.firstName : '';
  const fullName = user
    ? [user.firstName, user.lastName === PLACEHOLDER_LAST_NAME ? '' : user.lastName].join(' ').trim()
    : '';

  return (
    <div className="min-h-[100dvh] bg-canvas text-fg">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-campfire opacity-80" />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-fg-muted transition hover:text-fg">
          <ArrowLeft className="size-4" /> <CeviLogo className="size-7" /> Cevi Schichtplan
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 sm:px-6">
        {!user ? (
          message ? (
            <Callout tone="danger">{message.text}</Callout>
          ) : (
            <div className="h-40 animate-pulse rounded-card bg-surface-2" aria-busy />
          )
        ) : (
          <>
            <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-5">
              <Avatar name={name} size="lg" highlight />
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-2xl font-extrabold tracking-tight">{name}</h1>
                <p className="truncate text-sm text-fg-muted">
                  {[fullName !== name ? fullName : '', hasRealEmail ? user.email : ''].filter(Boolean).join(' · ')}
                </p>
                {user.hasCeviDb && (
                  <Badge size="sm" className="mt-2">
                    <Database className="size-3" /> Cevi.DB
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut /> <span className="hidden sm:inline">Abmelden</span>
              </Button>
            </section>

            <section className="rounded-card border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-fg-subtle">Abteilung &amp; Stufen</h2>
                  <p className="mt-1 text-base font-semibold">
                    {user.homeDepartment?.name ?? (user.needsDepartmentSetup ? 'Noch nicht angegeben' : 'Keine Abteilung')}
                  </p>
                  {user.stufen && user.stufen.length > 0 && (
                    <p className="mt-0.5 text-sm text-fg-muted">
                      {user.stufen.map((s) => `${s.name} (${STUFE_ROLES[s.role]})`).join(', ')}
                    </p>
                  )}
                  {user.homeDepartmentFromCeviDb && (
                    <p className="mt-1 text-xs text-fg-subtle">Abteilung aus Cevi.DB übernommen.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {user.homeDepartment && (
                    <a
                      href={getDepartmentUrl(user.homeDepartment.slug)}
                      className={buttonClasses({ size: 'sm' })}
                    >
                      Zum Schichtplan <ArrowUpRight />
                    </a>
                  )}
                  <a
                    href={getDepartmentSetupUrl(typeof window === 'undefined' ? undefined : window.location.href)}
                    className={buttonClasses({ size: 'sm', variant: 'secondary' })}
                  >
                    <Building2 /> Ändern
                  </a>
                </div>
              </div>
            </section>

            <form onSubmit={save} className="space-y-5 rounded-card border border-line bg-surface p-5">
              <div>
                <h2 className="text-sm font-semibold text-fg-subtle">Deine Angaben</h2>
                <p className="mt-1 text-xs text-fg-muted">
                  Manche Anlässe brauchen sie für die Eintragung. Bei Cevi.DB-Konten werden Name und Geburtsdatum beim
                  nächsten Login aus Cevi.DB aktualisiert.
                </p>
              </div>
              {message && <Callout tone={message.tone}>{message.text}</Callout>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Vorname">
                  <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" />
                </Field>
                <Field label="Nachname">
                  <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" />
                </Field>
                <Field label="Handynummer">
                  <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" placeholder="+41 79 000 00 00" />
                </Field>
                <Field label="Geburtsdatum">
                  <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} autoComplete="bday" />
                </Field>
                <Field label="Adresse" className="sm:col-span-2">
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} autoComplete="street-address" placeholder="Dorfstrasse 1, 8307 Effretikon" />
                </Field>
                {!hasRealEmail && (
                  <Field label="E-Mail" className="sm:col-span-2">
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
                  </Field>
                )}
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={saving}>
                  Speichern
                </Button>
              </div>
            </form>

            <section className="rounded-card border border-line bg-surface p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-subtle">
                <CalendarDays className="size-4" /> Deine nächsten Schichten
              </h2>
              {shifts === null ? (
                <div className="mt-3 h-16 animate-pulse rounded-field bg-surface-2" />
              ) : upcoming.length === 0 ? (
                <p className="mt-3 text-sm text-fg-muted">Keine kommenden Schichten.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {upcoming.map((s) => (
                    <li key={s.signupId}>
                      <a
                        href={getDepartmentUrl(s.departmentSlug, `/events/${s.eventSlug}`)}
                        className="flex items-center justify-between gap-3 py-2.5 transition hover:text-accent-ink"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {s.title}
                            {s.taskTitle && s.taskTitle !== s.title ? ` · ${s.taskTitle}` : ''}
                          </span>
                          <span className="block truncate text-xs text-fg-subtle">
                            {dateFmt.format(new Date(s.startTime))} · {s.eventTitle} · {s.departmentName}
                          </span>
                        </span>
                        <ArrowUpRight className="size-4 shrink-0 text-fg-subtle" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
