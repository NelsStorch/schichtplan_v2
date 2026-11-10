'use client';

import Link from 'next/link';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bell, Building2, Database, Trash2 } from 'lucide-react';
import {
  PLACEHOLDER_EMAIL_REGEX,
  PLACEHOLDER_LAST_NAME,
  STUFE_ROLES,
  getLoginUrl,
  getOrganization,
  type UserDto,
} from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Field,
  Input,
  NotificationSettings,
  buttonClasses,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { departmentSetupUrl } from '@/lib/api';
import { usePortal } from '@/lib/portal';

/** Profil- und Benachrichtigungsseite direkt auf der Abteilungs-Subdomain (<abteilung>.cevi-schichtplan.ch/profil). */
export default function DepartmentProfilePage() {
  const { user, setUser, loading } = usePortal();
  const confirm = useConfirm();
  const toast = useToast();
  const org = useMemo(() => getOrganization(typeof window !== 'undefined' ? window.location.host : 'cevi-schichtplan.ch'), []);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', birthDate: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl(window.location.href);
      return;
    }
    if (user) {
      setForm({
        firstName: user.firstName ?? '',
        lastName: user.lastName === PLACEHOLDER_LAST_NAME ? '' : (user.lastName ?? ''),
        phone: user.phone ?? '',
        email: '',
        birthDate: user.birthDate ?? '',
      });
    }
  }, [loading, user]);

  const hasRealEmail = Boolean(user?.email && !PLACEHOLDER_EMAIL_REGEX.test(user.email));
  const birthDateFromCeviDb = Boolean(user?.hasCeviDb && user.birthDate);

  const handleProfileResend = async () => {
    if (!user?.email) return;
    setResendingVerification(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Fehler beim Senden.');
      setMessage({ tone: 'success', text: data.message || 'Neuer Bestätigungslink gesendet!' });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Fehler beim Senden.' });
    } finally {
      setResendingVerification(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const payload: Record<string, string> = {};
    if (form.firstName.trim()) payload.firstName = form.firstName.trim();
    if (form.lastName.trim()) payload.lastName = form.lastName.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.birthDate && !birthDateFromCeviDb) payload.birthDate = form.birthDate;
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
      setMessage({ tone: 'success', text: 'Angaben gespeichert.' });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Speichern hat nicht geklappt.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = await confirm({
      title: 'Konto wirklich löschen?',
      description:
        'Möchtest du dein Konto wirklich unwiderruflich löschen? Alle deine Schichteintragungen und Verknüpfungen werden dabei vollständig entfernt. Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmLabel: 'Mein Konto endgültig löschen',
      cancelLabel: 'Abbrechen',
      tone: 'danger',
      countdownSeconds: 7,
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/auth/me', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Löschen hat nicht geklappt.');
      toast({
        title: 'Konto gelöscht',
        description: 'Dein Konto wurde erfolgreich gelöscht.',
        tone: 'success',
      });
      window.location.href = '/';
    } catch (err) {
      toast({
        title: 'Fehler beim Löschen',
        description: err instanceof Error ? err.message : 'Löschen hat nicht geklappt.',
        tone: 'error',
      });
      setDeleting(false);
    }
  };

  const name = user ? user.nickname || user.ceviName || user.firstName : '';
  const fullName = user
    ? [user.firstName, user.lastName === PLACEHOLDER_LAST_NAME ? '' : user.lastName].join(' ').trim()
    : '';

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pt-6 sm:px-6">
        {!user ? (
          <div className="h-40 animate-pulse rounded-card bg-surface-2" aria-busy />
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
                    <Database className="size-3" /> {org.authProviderShort || 'Verband'}
                  </Badge>
                )}
              </div>
            </section>

            <section className="rounded-card border border-line bg-surface p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-subtle">
                  <Bell className="size-4" /> Benachrichtigungen &amp; Erinnerungen
                </h2>
                <Link
                  href="/profil/benachrichtigungen"
                  className="text-xs font-semibold text-accent-ink hover:underline"
                >
                  Als eigene Seite öffnen →
                </Link>
              </div>
              <NotificationSettings user={user} onUserChange={(u) => setUser(u)} />
            </section>

            <form onSubmit={save} className="space-y-5 rounded-card border border-line bg-surface p-5">
              <div>
                <h2 className="text-sm font-semibold text-fg-subtle">Deine Angaben</h2>
                <p className="mt-1 text-xs text-fg-muted">
                  Manche Anlässe brauchen sie für die Eintragung. Bei {org.authProviderShort || 'Verbands'}-Konten werden Name, E-Mail und
                  Geburtsdatum bei jedem Login aus {org.authProviderShort || 'dem Verband'} aktualisiert.
                </p>
              </div>
              {message && <Callout tone={message.tone}>{message.text}</Callout>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Vorname">
                  <Input
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    autoComplete="given-name"
                  />
                </Field>
                <Field label="Nachname">
                  <Input
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    autoComplete="family-name"
                  />
                </Field>
                <Field label="Handynummer">
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    autoComplete="tel"
                    placeholder="+41 79 000 00 00"
                  />
                </Field>
                <Field label="Geburtsdatum" hint={birthDateFromCeviDb ? `Aus ${org.authProviderShort || 'Verband'}, nur dort änderbar` : undefined}>
                  <Input
                    type="date"
                    value={form.birthDate}
                    disabled={birthDateFromCeviDb}
                    onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                    autoComplete="bday"
                  />
                </Field>
                {hasRealEmail ? (
                  <div className="sm:col-span-2">
                    <div className="text-xs font-medium text-fg-subtle">E-Mail</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">{user.email}</span>
                      {user.emailVerified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          ✓ Bestätigt
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                            Nicht bestätigt
                          </span>
                          <button
                            type="button"
                            onClick={handleProfileResend}
                            disabled={resendingVerification}
                            className="text-xs font-medium text-accent-ink underline-offset-4 hover:underline"
                          >
                            {resendingVerification ? 'Wird gesendet …' : 'Bestätigungslink anfordern'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <Field label="E-Mail" className="sm:col-span-2">
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      autoComplete="email"
                    />
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
                </div>
                <a href={departmentSetupUrl()} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
                  <Building2 /> Ändern
                </a>
              </div>
            </section>

            {user.canSelfDelete && (
              <section className="rounded-card border border-danger/30 bg-surface p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-danger-ink">Konto löschen</h2>
                    <p className="mt-1 text-xs text-fg-muted">
                      Löscht dein Konto und alle deine Eintragungen und Verknüpfungen unwiderruflich aus dem {org.name} Schichtplan.
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="shrink-0"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {deleting ? 'Wird gelöscht …' : 'Konto löschen'}
                  </Button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
