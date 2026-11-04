'use client';

import { useEffect, useState } from 'react';
import { BellRing, Check, Mail, Send, Smartphone } from 'lucide-react';
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

export interface NotificationSettingsProps {
  user: UserDto;
  onUserChange: (updated: UserDto) => void;
  /** Kompakte Darstellung für das Konto-Dialogfenster in der Abteilungs-App */
  compact?: boolean;
}

export function NotificationSettings({ user, onUserChange, compact = false }: NotificationSettingsProps) {
  const toast = useToast();
  const [pushSupported, setPushSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  const hasRealEmail = Boolean(user.email && !PLACEHOLDER_EMAIL_REGEX.test(user.email));
  const emailMinutes = user.emailReminderMinutes ?? [...DEFAULT_EMAIL_REMINDER_MINUTES];
  const pushMinutes = user.pushReminderMinutes ?? [...DEFAULT_PUSH_REMINDER_MINUTES];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setPushSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    (async () => {
      try {
        const reg = await ensureActiveServiceWorker();
        const sub = await reg.pushManager.getSubscription();
        const url = sub
          ? `/api/push/status?endpoint=${encodeURIComponent(sub.endpoint)}`
          : '/api/push/status';
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

  const toggleEmailMinute = (minute: number) => {
    const current = new Set(emailMinutes);
    if (current.has(minute)) {
      current.delete(minute);
    } else {
      current.add(minute);
    }
    const next = [...current].sort((a, b) => a - b);
    void patchProfile({
      emailReminderMinutes: next,
      shiftReminders: next.length > 0,
    });
  };

  const togglePushMinute = (minute: number) => {
    const current = new Set(pushMinutes);
    if (current.has(minute)) {
      current.delete(minute);
    } else {
      current.add(minute);
    }
    const next = [...current].sort((a, b) => a - b);
    void patchProfile({
      pushReminderMinutes: next,
      pushReminders: next.length > 0,
    });
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
            description: 'Bitte erlaube Benachrichtigungen in den Browser-Einstellungen für diese Seite.',
            tone: 'error',
          });
          return;
        }

        const shownPromise = waitForSwPushShown(2500);
        const data = await subscribeCurrentOrigin(reg);

        setDeviceSubscribed(true);
        onUserChange({
          ...user,
          pushSubscriptionCount: data.subscriptionCount ?? (user.pushSubscriptionCount ?? 0) + 1,
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
          title: 'Browser-Benachrichtigungen aktiviert',
          description: 'Dieses Gerät empfängt jetzt Push-Mitteilungen.',
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
            typeof data.subscriptionCount === 'number'
              ? data.subscriptionCount
              : Math.max(0, (user.pushSubscriptionCount ?? 1) - 1),
        });
        toast({ title: 'Auf diesem Gerät deaktiviert' });
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
          'Falls kein Popup sichtbar ist, prüfe bitte in den Windows-/macOS-Systemeinstellungen, ob Mitteilungen für deinen Browser erlaubt sind und «Nicht stören» aus ist.',
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

  return (
    <div className={cn('space-y-5', compact && 'space-y-4')}>
      {/* 1. E-Mail-Erinnerungen */}
      <div className={cn('space-y-3', !compact && 'rounded-field border border-line bg-surface-1 p-4')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Mail className="size-4 text-accent-ink shrink-0" />
              <span>E-Mail-Erinnerung vor meinen Schichten</span>
            </div>
            <p className="mt-0.5 text-xs text-fg-muted">
              {hasRealEmail && user.emailVerified
                ? `Wähle aus, wann wir dir vor Schichtbeginn eine Erinnerung an ${user.email} senden.`
                : 'Dafür braucht dein Konto eine bestätigte E-Mail-Adresse.'}
            </p>
          </div>
          <Switch
            checked={user.shiftReminders !== false && emailMinutes.length > 0}
            disabled={!hasRealEmail || !user.emailVerified}
            onChange={(enabled) => {
              const nextMinutes = enabled
                ? emailMinutes.length > 0
                  ? emailMinutes
                  : [...DEFAULT_EMAIL_REMINDER_MINUTES]
                : [];
              void patchProfile(
                { shiftReminders: enabled, emailReminderMinutes: nextMinutes },
                enabled ? 'E-Mail-Erinnerungen eingeschaltet' : 'E-Mail-Erinnerungen ausgeschaltet'
              );
            }}
          />
        </div>

        {hasRealEmail && user.emailVerified && user.shiftReminders !== false && (
          <div className="pt-1">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              Zeitpunkte (Mehrfachauswahl möglich)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EMAIL_REMINDER_MINUTES.map((m) => {
                const active = emailMinutes.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleEmailMinute(m)}
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
        )}
      </div>

      {/* 2. Browser-Push-Benachrichtigungen */}
      <div className={cn('space-y-3', !compact && 'rounded-field border border-line bg-surface-1 p-4')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
              <BellRing className="size-4 text-accent-ink shrink-0" />
              <span>Browser-Benachrichtigungen (Web Push)</span>
              {deviceSubscribed && (
                <Badge tone="success" size="sm">
                  Auf diesem Gerät aktiv
                </Badge>
              )}
              {!deviceSubscribed && (user.pushSubscriptionCount ?? 0) > 0 && (
                <Badge tone="outline" size="sm">
                  {user.pushSubscriptionCount} {user.pushSubscriptionCount === 1 ? 'anderes Gerät' : 'andere Geräte'}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-fg-muted">
              Erhalte Mitteilungen direkt auf dein Handy oder deinen Computer – auch wenn der Browser geschlossen ist.
            </p>
          </div>
          {pushSupported && (
            <Switch
              checked={deviceSubscribed}
              disabled={subscribing}
              onChange={(enable) => void handleToggleDevicePush(enable)}
            />
          )}
        </div>

        {!pushSupported && (
          <Callout tone="info">
            Dein aktueller Browser unterstützt keine Web-Push-Mitteilungen. Auf dem iPhone/iPad füge den Schichtplan zuerst über «Teilen → Zum Home-Bildschirm» als App hinzu.
          </Callout>
        )}

        {pushSupported && permission === 'denied' && !deviceSubscribed && (
          <Callout tone="warning">
            Du hast Benachrichtigungen im Browser blockiert. Bitte erlaube sie über das Schloss-Symbol in der Adresszeile.
          </Callout>
        )}

        {(deviceSubscribed || (user.pushSubscriptionCount ?? 0) > 0) && (
          <div className="space-y-3 pt-1">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                Push-Erinnerung vor Schichtbeginn
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PUSH_REMINDER_MINUTES.map((m) => {
                  const active = (user.pushReminders ?? true) && pushMinutes.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => togglePushMinute(m)}
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

            {!compact && (
              <div className="space-y-2 border-t border-line pt-3">
                <Switch
                  checked={user.pushNotifyReplacement !== false}
                  onChange={(v) => void patchProfile({ pushNotifyReplacement: v })}
                  label="Push bei «Ersatz gefunden»"
                  description="Sofort informieren, wenn jemand deine angebotene Schicht übernimmt."
                />
                <Switch
                  checked={user.pushNotifyMessages !== false}
                  onChange={(v) => void patchProfile({ pushNotifyMessages: v })}
                  label="Push bei Nachrichten vom OK"
                  description="Kurze Vorschau auf dem Gerät, wenn das OK eine Nachricht an deinen Anlass schickt."
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-xs text-fg-subtle flex items-center gap-1">
                <Smartphone className="size-3.5" />
                {(user.pushSubscriptionCount ?? 0) > 0
                  ? `Auf ${user.pushSubscriptionCount} ${user.pushSubscriptionCount === 1 ? 'Gerät' : 'Geräten'} eingerichtet`
                  : 'Auf diesem Gerät aktiv'}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={testingPush}
                onClick={handleTestPush}
              >
                <Send className="size-3.5" /> Test-Benachrichtigung senden
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
