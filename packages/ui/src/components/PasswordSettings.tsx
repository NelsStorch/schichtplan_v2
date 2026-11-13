'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { isPlaceholderEmail, type UserDto } from '@schichtplan/shared';
import { Badge } from './Badge';
import { Button } from './Button';
import { Callout, useToast } from './Feedback';
import { Field } from './Field';
import { PasswordInput } from './PasswordInput';
import { useOrganization } from './OrganizationContext';

export interface PasswordSettingsProps {
  user: UserDto;
  onUserChange?: (user: UserDto) => void;
}

/**
 * Einstellungen für das Kontopasswort:
 * Ermöglicht das Ändern des bisherigen Passworts oder das Festlegen eines
 * Fallback-Passworts für Hitobito/OAuth-Konten (Cevi.DB, MiData, Jubla-DB).
 */
export function PasswordSettings({ user, onUserChange }: PasswordSettingsProps) {
  const org = useOrganization();
  const toast = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRealEmail = Boolean(user.email && !isPlaceholderEmail(user.email));

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setIsOpen(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Die eingegebenen Passwörter stimmen nicht überein.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: user.hasPassword ? currentPassword : undefined,
          newPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Fehler beim Speichern des Passworts.');
      }

      toast({
        title: user.hasPassword ? 'Passwort geändert' : 'Fallback-Passwort festgelegt',
        description: data.message || 'Dein Passwort wurde erfolgreich gespeichert.',
        tone: 'success',
      });

      if (data.user && onUserChange) {
        onUserChange(data.user);
      } else if (onUserChange) {
        onUserChange({ ...user, hasPassword: true });
      }

      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern des Passworts.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-fg">
              <KeyRound className="size-4 text-accent-ink" /> Passwort &amp; Fallback-Login
            </h2>
            {user.hasPassword ? (
              <Badge tone="success" size="sm" className="gap-1">
                <ShieldCheck className="size-3" /> Aktiv
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                Kein Passwort
              </Badge>
            )}
          </div>

          <p className="mt-2 text-sm text-fg-muted">
            {user.hasPassword
              ? 'Dein Konto verfügt über ein Passwort. Du kannst dich damit jederzeit direkt mit deiner E-Mail-Adresse anmelden.'
              : `Du bist über ${org.name} angemeldet. Du kannst hier ein Notfall-Passwort festlegen, um dich auch anmelden zu können, falls ${org.authProviderShort || 'die Verbandsdatenbank'} vorübergehend nicht erreichbar ist.`}
          </p>
        </div>

        {!isOpen && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setError(null);
              setIsOpen(true);
            }}
            disabled={!hasRealEmail}
            className="shrink-0"
          >
            {user.hasPassword ? 'Passwort ändern' : 'Fallback-Passwort festlegen'}
          </Button>
        )}
      </div>

      {!hasRealEmail && (
        <div className="mt-3">
          <Callout tone="info">
            Trage bitte zuerst oben im Profil eine gültige E-Mail-Adresse ein, um ein Passwort festzulegen.
          </Callout>
        </div>
      )}

      {isOpen && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4 border-t border-line pt-4">
          {error && <Callout tone="danger">{error}</Callout>}

          {user.hasPassword && (
            <Field label="Aktuelles Passwort" required>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={user.hasPassword ? 'Neues Passwort' : 'Passwort'} hint="Mindestens 8 Zeichen" required>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>

            <Field label="Passwort wiederholen" required>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" loading={saving} disabled={!newPassword || !confirmPassword}>
              Passwort speichern
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
