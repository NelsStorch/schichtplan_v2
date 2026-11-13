'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { BellRing, Check, Info, Send, Smartphone } from 'lucide-react';
import {
  DEFAULT_EMAIL_REMINDER_MINUTES,
  DEFAULT_PUSH_REMINDER_MINUTES,
  EMAIL_REMINDER_MINUTES,
  PLACEHOLDER_EMAIL_REGEX,
  PUSH_REMINDER_MINUTES,
  REMINDER_MINUTE_LABELS,
  type UserDto,
} from '@schichtplan/shared';
import { Badge } from './Badge';
import { Button } from './Button';
import { Switch } from './Field';
import { Callout, useToast } from './Feedback';
import { cn } from '../utils/cn';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function ensureActiveServiceWorker(): Promise<ServiceWorkerRegistration> {
  let reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  } else {
    await reg.update().catch(() => {});
  }
  return navigator.serviceWorker.ready;
}

function waitForSwPushShown(timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    if (!('serviceWorker' in navigator)) {
      resolve(false);
      return;
    }
    let settled = false;
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'CEVI_PUSH_SHOWN') {
        settled = true;
        navigator.serviceWorker.removeEventListener('message', onMessage);
        resolve(true);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    setTimeout(() => {
      if (!settled) {
        navigator.serviceWorker.removeEventListener('message', onMessage);
        resolve(false);
      }
    }, timeoutMs);
  });
}

/** iPhone/iPad (auch iPadOS im Desktop-Modus): Web Push nur in der zum Home-Bildschirm hinzugefügten App */
function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export interface NotificationSettingsProps {
  user: UserDto;
  onUserChange: (updated: UserDto) => void;
  /** Kompakte Darstellung für das Konto-Dialogfenster in der Abteilungs-App (nur Gerät und Schicht-Erinnerung) */
  compact?: boolean;
  /**
   * Adresse der installierbaren Abteilungs-App (z. B. auf der Landingpage). Auf dem iPhone funktioniert
   * Web Push nur in der zum Home-Bildschirm hinzugefügten App, deshalb verweisen wir dorthin.
   */
  appUrl?: string;
}

type Channel = 'email' | 'push';

interface MatrixRow {
  key: string;
  label: string;
  description: string;
  email: { checked: boolean; toggle: (v: boolean) => void };
  push: { checked: boolean; toggle: (v: boolean) => void };
}

/**
 * Benachrichtigungs-Einstellungen: oben das Gerät (Web Push gilt pro Browser und Gerät), darunter eine
 * Tabelle «was × wie» (E-Mail / Push) und die Zeitpunkte der Schicht-Erinnerung. Alles speichert sofort.
 */
export function NotificationSettings({ user, onUserChange, compact = false, appUrl }: NotificationSettingsProps) {
  const toast = useToast();
  const [pushSupported, setPushSupported] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  const hasRealEmail = Boolean(user.email && !PLACEHOLDER_EMAIL_REGEX.test(user.email));
  const emailUsable = hasRealEmail && Boolean(user.emailVerified);
  const emailMinutes = user.emailReminderMinutes ?? [...DEFAULT_EMAIL_REMINDER_MINUTES];
  const pushMinutes = user.pushReminderMinutes ?? [...DEFAULT_PUSH_REMINDER_MINUTES];
  const subscriptionCount = user.pushSubscriptionCount ?? 0;
  const otherDevices = Math.max(0, subscriptionCount - (deviceSubscribed ? 1 : 0));
  const pushUsable = deviceSubscribed || subscriptionCount > 0;

  const emailReminderOn = emailUsable && user.shiftReminders !== false && emailMinutes.length > 0;
  const pushReminderOn = user.pushReminders !== false && pushMinutes.length > 0;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAppleMobile(isAppleMobile());
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setPushSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    (async () => {
      try {
        const reg = await ensureActiveServiceWorker();
        const sub = await reg.pushManager.getSubscription();
        // Das Backend erkennt das Gerät zusätzlich über ein Cookie der ganzen Domain, damit ein auf einer
        // anderen Subdomain (Startseite oder andere Abteilung) eingerichtetes Abo hier als aktiv gilt.
        const url = sub ? `/api/push/status?endpoint=${encodeURIComponent(sub.endpoint)}` : '/api/push/status';
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setDeviceSubscribed(Boolean(data.deviceSubscribed));
          if (typeof data.subscriptionCount === 'number' && data.subscriptionCount !== user.pushSubscriptionCount) {
            onUserChange({ ...user, pushSubscriptionCount: data.subscriptionCount });
          }
        } else {
          setDeviceSubscribed(Boolean(sub));
        }
      } catch {
        setDeviceSubscribed(false);
      }
    })();
  }, [user.id]);

  const patchProfile = async (patch: Record<string, unknown>, successMsg?: string) => {
    const previous = user;
    onUserChange({ ...user, ...(patch as Partial<UserDto>) });
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
      onUserChange(data as UserDto);
      if (successMsg) toast({ title: successMsg });
    } catch (err) {
      onUserChange(previous);
      toast({
        title: 'Speichern hat nicht geklappt',
        description: err instanceof Error ? err.message : undefined,
        tone: 'error',
      });
    }
  };

  const toggleMinute = (channel: Channel, minute: number) => {
    const current = new Set(channel === 'email' ? emailMinutes : pushMinutes);
    if (current.has(minute)) current.delete(minute);
    else current.add(minute);
    const next = [...current].sort((a, b) => a - b);
    void patchProfile(
      channel === 'email'
        ? { emailReminderMinutes: next, shiftReminders: next.length > 0 }
        : { pushReminderMinutes: next, pushReminders: next.length > 0 }
    );
  };

  const setShiftReminder = (channel: Channel, enabled: boolean) => {
    if (channel === 'email') {
      const nextMinutes = enabled ? (emailMinutes.length > 0 ? emailMinutes : [...DEFAULT_EMAIL_REMINDER_MINUTES]) : [];
      void patchProfile(
        { shiftReminders: enabled, emailReminderMinutes: nextMinutes },
        enabled ? 'E-Mail-Erinnerung eingeschaltet' : 'E-Mail-Erinnerung ausgeschaltet'
      );
    } else {
      const nextMinutes = enabled ? (pushMinutes.length > 0 ? pushMinutes : [...DEFAULT_PUSH_REMINDER_MINUTES]) : [];
      void patchProfile(
        { pushReminders: enabled, pushReminderMinutes: nextMinutes },
        enabled ? 'Push-Erinnerung eingeschaltet' : 'Push-Erinnerung ausgeschaltet'
      );
    }
  };

  const subscribeCurrentOrigin = async (reg: ServiceWorkerRegistration) => {
    const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
    const keyData = await keyRes.json();
    if (!keyRes.ok || !keyData.publicKey) {
      throw new Error('Push-Schlüssel konnte nicht geladen werden');
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });
    }

    const p256dh = arrayBufferToBase64Url(sub.getKey('p256dh'));
    const auth = arrayBufferToBase64Url(sub.getKey('auth'));

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh, auth },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Aktivierung fehlgeschlagen');
    return data as { subscriptionCount?: number };
  };

  const handleToggleDevicePush = async (enable: boolean) => {
    if (!pushSupported) return;
    setSubscribing(true);
    try {
      const reg = await ensureActiveServiceWorker();

      if (enable) {
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== 'granted') {
          toast({
            title: 'Berechtigung verweigert',
            description: 'Erlaube Benachrichtigungen in den Browser-Einstellungen für diese Seite.',
            tone: 'error',
          });
          return;
        }

        const shownPromise = waitForSwPushShown(2500);
        const data = await subscribeCurrentOrigin(reg);

        setDeviceSubscribed(true);
        onUserChange({
          ...user,
          pushSubscriptionCount: data.subscriptionCount ?? subscriptionCount + 1,
        });

        const swShown = await shownPromise;
        if (!swShown) {
          const displayName = user.ceviName || user.firstName;
          await reg
            .showNotification(`Hallo ${displayName}! Browser-Benachrichtigungen sind aktiv`, {
              body: 'Dieses Gerät empfängt jetzt Erinnerungen vor deinen Schichten und Infos vom OK.',
              icon: '/images/cevi-logo.png',
              tag: `cevi-schichtplan-welcome-${Date.now()}`,
            })
            .catch(() => {});
        }

        toast({
          title: 'Push auf diesem Gerät aktiviert',
          description: 'Gilt für diesen Browser, auch auf den anderen Seiten des Schichtplans.',
          tone: 'success',
        });
      } else {
        const sub = await reg.pushManager.getSubscription();
        const res = await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub ? { endpoint: sub.endpoint } : {}),
        });
        const data = await res.json().catch(() => ({}));
        if (sub) {
          await sub.unsubscribe().catch(() => {});
        }
        setDeviceSubscribed(false);
        onUserChange({
          ...user,
          pushSubscriptionCount:
            typeof data.subscriptionCount === 'number' ? data.subscriptionCount : Math.max(0, subscriptionCount - 1),
        });
        toast({ title: 'Push auf diesem Gerät ausgeschaltet' });
      }
    } catch (err) {
      toast({
        title: 'Push-Einrichtung fehlgeschlagen',
        description: err instanceof Error ? err.message : undefined,
        tone: 'error',
      });
    } finally {
      setSubscribing(false);
    }
  };

  const handleTestPush = async () => {
    setTestingPush(true);
    try {
      const reg = await ensureActiveServiceWorker();

      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        setPermission(perm);
      }

      // Falls das Abo auf einer anderen Subdomain eingerichtet wurde, stellen wir sicher,
      // dass auch diese Subdomain lokal im Service Worker registriert ist
      if (Notification.permission === 'granted') {
        const localSub = await reg.pushManager.getSubscription();
        if (!localSub) {
          await subscribeCurrentOrigin(reg).catch(() => {});
        }
      }

      const shownPromise = waitForSwPushShown(2500);
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Test-Benachrichtigung fehlgeschlagen');

      const swShown = await shownPromise;
      if (!swShown && Notification.permission === 'granted') {
        const displayName = user.ceviName || user.firstName;
        await reg
          .showNotification(`Hallo ${displayName}! Browser-Benachrichtigungen sind aktiv`, {
            body: 'Du erhältst hier künftig Erinnerungen an deine Schichten und wichtige Infos vom OK.',
            icon: '/images/cevi-logo.png',
            tag: `cevi-schichtplan-test-local-${Date.now()}`,
          })
          .catch(() => {});
      }

      toast({
        title: 'Test-Benachrichtigung gesendet',
        description:
          'Falls kein Popup sichtbar ist, prüfe in den Windows-/macOS-Systemeinstellungen, ob Mitteilungen für deinen Browser erlaubt sind und «Nicht stören» aus ist.',
        tone: 'success',
      });
    } catch (err) {
      toast({
        title: 'Test fehlgeschlagen',
        description: err instanceof Error ? err.message : undefined,
        tone: 'error',
      });
    } finally {
      setTestingPush(false);
    }
  };

  const rows: MatrixRow[] = [
    {
      key: 'shift',
      label: 'Schicht-Erinnerung',
      description: 'Vor dem Beginn deiner Schichten',
      email: { checked: emailReminderOn, toggle: (v) => setShiftReminder('email', v) },
      push: { checked: pushReminderOn, toggle: (v) => setShiftReminder('push', v) },
    },
    {
      key: 'catering',
      label: 'Offene Verpflegungs-Bons',
      description: 'Nach Schichtende und vor Festende',
      email: {
        checked: user.emailNotifyCateringTokens !== false,
        toggle: (v) => void patchProfile({ emailNotifyCateringTokens: v }),
      },
      push: {
        checked: user.pushNotifyCateringTokens !== false,
        toggle: (v) => void patchProfile({ pushNotifyCateringTokens: v }),
      },
    },
    {
      key: 'replacement',
      label: 'Ersatz gefunden',
      description: 'Jemand übernimmt deine angebotene Schicht',
      email: {
        checked: user.emailNotifyReplacement !== false,
        toggle: (v) => void patchProfile({ emailNotifyReplacement: v }),
      },
      push: {
        checked: user.pushNotifyReplacement !== false,
        toggle: (v) => void patchProfile({ pushNotifyReplacement: v }),
      },
    },
    {
      key: 'messages',
      label: 'Mitteilungen vom OK',
      description: 'Infos zu deinen eingetragenen Anlässen',
      email: {
        checked: user.emailNotifyMessages !== false,
        toggle: (v) => void patchProfile({ emailNotifyMessages: v }),
      },
      push: {
        checked: user.pushNotifyMessages !== false,
        toggle: (v) => void patchProfile({ pushNotifyMessages: v }),
      },
    },
  ];
  const visibleRows = compact ? rows.slice(0, 1) : rows;

  /** Auf der Profilseite eigenständige Karten, im Konto-Dialog schlichte Felder */
  const box = compact ? 'rounded-field border border-line bg-surface-1' : 'rounded-card border border-line bg-surface';
  const pad = compact ? 'p-4' : 'p-4 sm:p-5';

  const deviceCard = (
    <div className={cn('space-y-3', box, pad)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            <BellRing className="size-4 shrink-0 text-accent-ink" />
            <span>Push auf diesem Gerät</span>
            {deviceSubscribed ? (
              <Badge tone="success" size="sm">
                Aktiv
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                Aus
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            Auch bei geschlossenem Browser. Gilt pro Gerät und Browser, egal wo im Schichtplan du es einschaltest.
          </p>
        </div>
        {pushSupported && (
          <Switch
            checked={deviceSubscribed}
            disabled={subscribing}
            ariaLabel="Push auf diesem Gerät"
            onChange={(enable) => void handleToggleDevicePush(enable)}
          />
        )}
      </div>

      {!pushSupported && (
        <Callout tone="info">
          {appleMobile ? (
            <>
              Auf dem iPhone und iPad funktioniert Push nur in der App auf dem Home-Bildschirm.{' '}
              {appUrl ? (
                <>
                  <a href={appUrl} className="font-semibold underline underline-offset-2">
                    Öffne den Schichtplan deiner Abteilung
                  </a>
                  , füge ihn über «Teilen → Zum Home-Bildschirm» hinzu und schalte Push dort ein.
                </>
              ) : (
                <>Füge den Schichtplan über «Teilen → Zum Home-Bildschirm» hinzu und schalte Push in der App ein.</>
              )}
            </>
          ) : (
            'Dieser Browser unterstützt keine Push-Mitteilungen.'
          )}
        </Callout>
      )}

      {pushSupported && permission === 'denied' && !deviceSubscribed && (
        <Callout tone="warning">
          Du hast Benachrichtigungen im Browser blockiert. Erlaube sie über das Schloss-Symbol in der Adresszeile.
        </Callout>
      )}

      {pushUsable && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <Smartphone className="size-3.5" />
            {deviceSubscribed
              ? otherDevices > 0
                ? `Hier und auf ${otherDevices} ${otherDevices === 1 ? 'weiterem Gerät' : 'weiteren Geräten'} aktiv`
                : 'Nur auf diesem Gerät aktiv'
              : `Auf ${subscriptionCount} ${subscriptionCount === 1 ? 'anderem Gerät' : 'anderen Geräten'} aktiv`}
          </span>
          {!compact && (
            <Button type="button" variant="secondary" size="sm" loading={testingPush} onClick={handleTestPush}>
              <Send className="size-3.5" /> Test senden
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const matrix = (
    <div className={cn('overflow-hidden', box)}>
      <div
        className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle sm:grid-cols-[minmax(0,1fr)_5rem_5rem]"
      >
        <span>{compact ? 'Erinnerung' : 'Was'}</span>
        <span className="text-center">
          E-Mail
        </span>
        <span className="text-center">
          Push
        </span>
      </div>
      <div className="divide-y divide-line">
        {visibleRows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_5rem_5rem]"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg">{row.label}</div>
              {!compact && <div className="mt-0.5 text-xs text-fg-subtle">{row.description}</div>}
            </div>
            <div className="flex justify-center">
              <Switch
                size="sm"
                checked={emailUsable && row.email.checked}
                disabled={!emailUsable}
                ariaLabel={`${row.label} per E-Mail`}
                onChange={row.email.toggle}
              />
            </div>
            <div className="flex justify-center">
              <Switch
                size="sm"
                checked={pushUsable && row.push.checked}
                disabled={!pushUsable}
                ariaLabel={`${row.label} per Push`}
                onChange={row.push.toggle}
              />
            </div>
          </div>
        ))}
      </div>
      {(!emailUsable || !pushUsable) && (
        <div className="space-y-1 border-t border-line bg-surface-1 px-4 py-2.5 text-xs text-fg-muted">
          {!emailUsable && (
            <p className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              E-Mails brauchen eine bestätigte E-Mail-Adresse (unter «Angaben»).
            </p>
          )}
          {!pushUsable && (
            <p className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Für Push zuerst oben «Push auf diesem Gerät» einschalten.
            </p>
          )}
        </div>
      )}
    </div>
  );

  const minuteChips = (channel: Channel, title: ReactNode) => {
    const options = channel === 'email' ? EMAIL_REMINDER_MINUTES : PUSH_REMINDER_MINUTES;
    const selected = channel === 'email' ? emailMinutes : pushMinutes;
    return (
      <div>
        <div className="mb-1.5 text-xs font-semibold text-fg-subtle">{title}</div>
        <div className="flex flex-wrap gap-1.5">
          {options.map((m) => {
            const active = selected.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => toggleMinute(channel, m)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                  active
                    ? 'border-accent bg-accent/15 text-accent-ink'
                    : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg'
                )}
              >
                {active && <Check className="size-3" />}
                {REMINDER_MINUTE_LABELS[m]?.short || `${m} Min.`}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const showEmailTimes = emailReminderOn;
  const showPushTimes = pushUsable && pushReminderOn;

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {deviceCard}
      {matrix}
      {!compact && (showEmailTimes || showPushTimes) && (
        <div className={cn('space-y-3', box, pad)}>
          <div>
            <div className="text-sm font-semibold text-fg">Wann erinnern?</div>
            <p className="mt-0.5 text-xs text-fg-muted">Wie lange vor Schichtbeginn. Mehrere Zeitpunkte sind möglich.</p>
          </div>
          {showEmailTimes && minuteChips('email', `E-Mail an ${user.email}`)}
          {showPushTimes && minuteChips('push', 'Push')}
        </div>
      )}
      {!compact && <p className="text-center text-xs text-fg-subtle">Änderungen werden sofort gespeichert.</p>}
    </div>
  );
}
