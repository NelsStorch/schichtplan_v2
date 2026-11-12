'use client';

import { useState, type FormEvent } from 'react';
import { Copy, Download, Printer, Share2, ShieldCheck, Smartphone } from 'lucide-react';
import type { UserDto } from '@schichtplan/shared';
import { Badge } from './Badge';
import { Button } from './Button';
import { Callout, useToast } from './Feedback';
import { Field, Input, Switch } from './Field';
import { PasswordInput } from './PasswordInput';
import { useOrganization } from './OrganizationContext';

export interface TwoFactorSettingsProps {
  user: UserDto;
  onUserChange?: (user: UserDto) => void;
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'password' }
  | { kind: 'scan'; secret: string; qrDataUrl: string; otpauthUrl: string }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'confirm'; action: 'disable' | 'recovery' | 'provider'; onProviderLogin?: boolean };

async function post<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Das hat nicht geklappt.');
  return data as T;
}

/**
 * Zwei-Faktor-Anmeldung mit Authenticator-App (TOTP, offener Standard): einrichten, Wiederherstellungs-
 * codes, Einstellung für den Verbands-Login, ausschalten. Für Konten mit Passwort oder Verbands-Login.
 */
export function TwoFactorSettings({ user, onUserChange }: TwoFactorSettingsProps) {
  const org = useOrganization();
  const toast = useToast();
  const status = user.twoFactor;
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [onProviderLogin, setOnProviderLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status?.available) return null;

  const provider = org.authProviderShort || 'Verbands-Login';
  const hasProvider = Boolean(user.hasProviderAuth);

  const reset = () => {
    setMode({ kind: 'idle' });
    setPassword('');
    setCode('');
    setError(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () =>
    run(async () => {
      const data = await post<{ secret: string; qrDataUrl: string; otpauthUrl: string }>('/api/auth/2fa/setup', {
        currentPassword: user.hasPassword ? password : undefined,
      });
      setPassword('');
      setCode('');
      setMode({ kind: 'scan', ...data });
    });

  const enable = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const data = await post<{ recoveryCodes: string[]; user: UserDto }>('/api/auth/2fa/enable', {
        code,
        onProviderLogin: hasProvider ? onProviderLogin : false,
      });
      setCode('');
      setMode({ kind: 'codes', codes: data.recoveryCodes });
      onUserChange?.(data.user);
      toast({ tone: 'success', title: 'Zwei-Faktor eingeschaltet' });
    });
  };

  const confirmAction = (e: FormEvent) => {
    e.preventDefault();
    if (mode.kind !== 'confirm') return;
    void run(async () => {
      if (mode.action === 'disable') {
        const data = await post<{ user: UserDto }>('/api/auth/2fa/disable', { code });
        onUserChange?.(data.user);
        toast({ tone: 'success', title: 'Zwei-Faktor ausgeschaltet' });
        reset();
      } else if (mode.action === 'recovery') {
        const data = await post<{ recoveryCodes: string[]; user: UserDto }>('/api/auth/2fa/recovery-codes', { code });
        onUserChange?.(data.user);
        setCode('');
        setMode({ kind: 'codes', codes: data.recoveryCodes });
      } else {
        const data = await post<{ user: UserDto }>(
          '/api/auth/2fa/settings',
          { code, onProviderLogin: Boolean(mode.onProviderLogin) },
          'PUT'
        );
        onUserChange?.(data.user);
        toast({ tone: 'success', title: 'Einstellung gespeichert' });
        reset();
      }
    });
  };

  const codesText = (codes: string[]) =>
    `${org.name}: Wiederherstellungscodes für die Zwei-Faktor-Anmeldung\n${user.email ?? ''}\n\nJeder Code funktioniert einmal.\n\n${codes.join('\n')}\n`;

  const copyCodes = async (codes: string[]) => {
    try {
      await navigator.clipboard.writeText(codesText(codes));
      toast({ tone: 'success', title: 'Codes kopiert' });
    } catch {
      toast({ tone: 'error', title: 'Kopieren nicht möglich', description: 'Bitte schreib die Codes von Hand ab.' });
    }
  };

  const downloadCodes = (codes: string[]) => {
    const blob = new Blob([codesText(codes)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schichtplan-wiederherstellungscodes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Teilen-Menü des Geräts (Notizen, Passwort-Manager-App …), vor allem auf dem Handy */
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareCodes = async (codes: string[]) => {
    try {
      await navigator.share({ title: `${org.name}: Wiederherstellungscodes`, text: codesText(codes) });
    } catch (err) {
      // Abbrechen im Teilen-Menü ist kein Fehler
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast({ tone: 'error', title: 'Teilen nicht möglich', description: 'Nutze «Kopieren» oder «Herunterladen».' });
    }
  };

  /** Druckansicht nur mit den Codes (eigenes Fenster, keine Daten an Dritte) */
  const printCodes = (codes: string[]) => {
    const win = window.open('', '_blank', 'width=480,height=640');
    if (!win) {
      toast({ tone: 'error', title: 'Druckfenster blockiert', description: 'Erlaube Pop-ups oder nutze «Herunterladen».' });
      return;
    }
    const doc = win.document;
    doc.title = `${org.name}: Wiederherstellungscodes`;
    const style = doc.createElement('style');
    style.textContent =
      'body{font-family:system-ui,sans-serif;padding:24px;color:#000}h1{font-size:18px}ul{font-family:ui-monospace,monospace;font-size:16px;columns:2;padding-left:20px}p{font-size:13px}';
    doc.head.appendChild(style);
    const h1 = doc.createElement('h1');
    h1.textContent = `${org.name}: Wiederherstellungscodes`;
    const info = doc.createElement('p');
    info.textContent = `${user.email ?? ''} · Jeder Code funktioniert einmal. Sicher aufbewahren.`;
    const list = doc.createElement('ul');
    for (const c of codes) {
      const li = doc.createElement('li');
      li.textContent = c;
      list.appendChild(li);
    }
    doc.body.append(h1, info, list);
    win.focus();
    win.print();
  };

  const codeField = (
    <Field label="Code aus der App" hint="Oder ein Wiederherstellungscode" required>
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="123456"
        maxLength={20}
        className="font-mono"
        autoFocus
        required
      />
    </Field>
  );

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-subtle">
              <Smartphone className="size-4" /> Zwei-Faktor-Anmeldung
            </h2>
            {status.enabled ? (
              <Badge tone="success" size="sm" className="gap-1">
                <ShieldCheck className="size-3" /> Aktiv
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                Aus
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {status.enabled
              ? user.hasPassword
                ? `Bei der Anmeldung mit Passwort fragen wir nach dem Code aus deiner Authenticator-App${status.onProviderLogin ? `, ebenso beim Login über ${provider}` : ''}.`
                : `Beim Login über ${provider} fragen wir zusätzlich nach dem Code aus deiner Authenticator-App${status.onProviderLogin ? '' : ' (zurzeit ausgeschaltet)'}.`
              : 'Schütze dein Konto zusätzlich mit einem Code aus einer Authenticator-App (z. B. Google Authenticator, Aegis, 2FAS, 1Password oder Bitwarden).'}
          </p>
          {status.enabled && (
            <p className={`mt-1 text-xs ${status.recoveryCodesLeft <= 3 ? 'font-medium text-danger-ink' : 'text-fg-subtle'}`}>
              Noch {status.recoveryCodesLeft} von 10 Wiederherstellungscodes unbenutzt.
            </p>
          )}
        </div>

        {mode.kind === 'idle' && !status.enabled && (
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            disabled={!status.configured || busy}
            loading={busy}
            onClick={() => (user.hasPassword ? setMode({ kind: 'password' }) : void startSetup())}
          >
            Einrichten
          </Button>
        )}
      </div>

      {!status.configured && !status.enabled && (
        <div className="mt-3">
          <Callout tone="info">Die Zwei-Faktor-Anmeldung ist auf diesem Server noch nicht eingerichtet.</Callout>
        </div>
      )}

      {error && mode.kind === 'idle' && (
        <div className="mt-3">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      {/* Eingeschaltet: Einstellungen */}
      {status.enabled && mode.kind === 'idle' && (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          {hasProvider && (
            <Switch
              checked={status.onProviderLogin}
              onChange={(checked) => {
                setError(null);
                setCode('');
                setMode({ kind: 'confirm', action: 'provider', onProviderLogin: checked });
              }}
              label={`Auch beim Login über ${provider} nach dem Code fragen`}
              description={
                user.hasPassword
                  ? `Sonst gilt der Code nur für das Passwort. Am besten schaltest du die Zwei-Faktor-Anmeldung auch direkt in ${provider} ein.`
                  : `Ohne diese Einstellung schützt der Code nur ein späteres Notfall-Passwort.`
              }
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setError(null);
                setCode('');
                setMode({ kind: 'confirm', action: 'recovery' });
              }}
            >
              Neue Wiederherstellungscodes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setError(null);
                setCode('');
                setMode({ kind: 'confirm', action: 'disable' });
              }}
            >
              Ausschalten
            </Button>
          </div>
        </div>
      )}

      {/* Einrichten, Schritt 0: Passwort bestätigen */}
      {mode.kind === 'password' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void startSetup();
          }}
          className="mt-5 space-y-4 border-t border-line pt-4"
        >
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label="Aktuelles Passwort" hint="Zur Bestätigung, dass du es bist" required>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              Abbrechen
            </Button>
            <Button type="submit" loading={busy} disabled={!password}>
              Weiter
            </Button>
          </div>
        </form>
      )}

      {/* Einrichten, Schritt 1: QR-Code scannen und ersten Code eingeben */}
      {mode.kind === 'scan' && (
        <form onSubmit={enable} className="mt-5 space-y-4 border-t border-line pt-4">
          {error && <Callout tone="danger">{error}</Callout>}
          <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
            <li>Öffne deine Authenticator-App und füge ein neues Konto hinzu.</li>
            <li>Scanne den QR-Code oder tippe den Schlüssel ab.</li>
            <li>Gib den 6-stelligen Code ein, den die App anzeigt.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            {/* Ist ein data:-Bild vom eigenen Server, nicht über einen externen QR-Dienst */}
            <img
              src={mode.qrDataUrl}
              alt="QR-Code für die Authenticator-App"
              width={180}
              height={180}
              className="rounded-field border border-line bg-white p-1"
            />
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <p className="text-fg-subtle">Schlüssel zum Abtippen:</p>
              <code className="block break-all rounded-field bg-surface-2 px-3 py-2 font-mono text-[13px] text-fg">
                {mode.secret}
              </code>
              <a href={mode.otpauthUrl} className="inline-block text-[13px] font-medium text-accent-ink hover:underline">
                Auf diesem Gerät in der App öffnen
              </a>
            </div>
          </div>
          <Field label="Code aus der App" required>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              className="font-mono tracking-[0.3em]"
              required
            />
          </Field>
          {hasProvider && (
            <Switch
              checked={onProviderLogin}
              onChange={setOnProviderLogin}
              label={`Auch beim Login über ${provider} nach dem Code fragen`}
              description={
                user.hasPassword
                  ? 'Sonst nur beim Login mit Passwort.'
                  : 'Ohne Passwort ist das der Login, den der Code schützt.'
              }
            />
          )}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              Abbrechen
            </Button>
            <Button type="submit" loading={busy} disabled={code.length !== 6}>
              Einschalten
            </Button>
          </div>
        </form>
      )}

      {/* Wiederherstellungscodes (nur jetzt sichtbar) */}
      {mode.kind === 'codes' && (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          <Callout tone="warning">
            Speichere diese Codes an einem sicheren Ort, z. B. als Notiz im Passwort-Manager (Google, Apple, 1Password, Bitwarden …) oder ausgedruckt. Damit kommst du in
            dein Konto, wenn du das Handy verlierst. Jeder Code funktioniert einmal. Wir zeigen sie nur jetzt an.
          </Callout>
          <ul className="grid grid-cols-2 gap-2 rounded-field bg-surface-2 p-3 font-mono text-sm text-fg">
            {mode.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canShare && (
              <Button type="button" size="sm" variant="secondary" onClick={() => void shareCodes(mode.codes)}>
                <Share2 className="size-3.5" aria-hidden /> Teilen / Speichern
              </Button>
            )}
            <Button type="button" size="sm" variant="secondary" onClick={() => void copyCodes(mode.codes)}>
              <Copy className="size-3.5" aria-hidden /> Kopieren
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => downloadCodes(mode.codes)}>
              <Download className="size-3.5" aria-hidden /> Herunterladen
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => printCodes(mode.codes)}>
              <Printer className="size-3.5" aria-hidden /> Drucken
            </Button>
            <Button type="button" size="sm" onClick={reset}>
              Ich habe die Codes gespeichert
            </Button>
          </div>
        </div>
      )}

      {/* Änderungen bestätigen: aktueller Code nötig */}
      {mode.kind === 'confirm' && (
        <form onSubmit={confirmAction} className="mt-5 space-y-4 border-t border-line pt-4">
          {error && <Callout tone="danger">{error}</Callout>}
          <p className="text-sm text-fg-muted">
            {mode.action === 'disable'
              ? 'Zum Ausschalten brauchen wir einen aktuellen Code. Danach reicht wieder das Passwort allein.'
              : mode.action === 'recovery'
                ? 'Die bisherigen Wiederherstellungscodes werden ungültig. Bestätige mit einem aktuellen Code.'
                : mode.onProviderLogin
                  ? `Künftig auch beim Login über ${provider} nach dem Code fragen. Bestätige mit einem aktuellen Code.`
                  : `Beim Login über ${provider} nicht mehr nach dem Code fragen. Bestätige mit einem aktuellen Code.`}
          </p>
          {codeField}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={!code.trim()}
              variant={mode.action === 'disable' ? 'danger' : undefined}
            >
              {mode.action === 'disable' ? 'Ausschalten' : 'Bestätigen'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
