'use client';

import { useState } from 'react';
import {
  CalendarPlus,
  CalendarSync,
  Check,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  Mail,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { helpUrl } from '@schichtplan/shared';
import { Badge, Button, Dialog, buttonClasses, cn, useToast } from '@schichtplan/ui';
import {
  downloadIcs,
  googleCalendarSubscribeUrl,
  outlookCalendarSubscribeUrl,
  type CalendarEntry,
  type ClientDevice,
} from '@/lib/ics';

interface CalendarData {
  token: string;
  webcalUrl: string;
  httpsUrl: string;
}

interface CalendarSubscribeDialogProps {
  open: boolean;
  onClose: () => void;
  calData: CalendarData;
  shifts?: CalendarEntry[];
  clientDevice?: ClientDevice;
  onResetToken?: () => Promise<void>;
  resettingToken?: boolean;
}

export function CalendarSubscribeDialog({
  open,
  onClose,
  calData,
  shifts = [],
  clientDevice = 'other',
  onResetToken,
  resettingToken = false,
}: CalendarSubscribeDialogProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [showManualGoogle, setShowManualGoogle] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(calData.httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({
        title: 'Abo-Link kopiert',
        description: 'Füge den Link in Google Kalender oder deiner Kalender-App ein.',
      });
    } catch {
      toast({
        title: 'Kopieren nicht möglich',
        description: 'Bitte kopiere den Link manuell.',
        tone: 'error',
      });
    }
  };

  const isApple = clientDevice === 'ios' || clientDevice === 'mac';

  return (
    <Dialog open={open} onClose={onClose} size="md" title="Schichten im Kalender abonnieren">
      <div className="space-y-5 text-sm">
        <p className="text-fg-muted">
          Abonniere alle deine Schichten direkt in deiner bevorzugten Kalender-App. Zukünftige Einsätze, Verschiebungen
          oder Abmeldungen synchronisieren sich <strong>vollautomatisch</strong> im Hintergrund.
        </p>

        {/* 1. Google Kalender (1. Wahl / Standard) */}
        <div
          className={cn(
            'rounded-card border p-4 transition-all',
            !isApple ? 'border-accent bg-accent/5 ring-1 ring-accent/20' : 'border-line bg-surface'
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 font-bold text-xs">
                G
              </div>
              <div>
                <span className="font-semibold text-fg">Google Kalender</span>
                {!isApple && <Badge tone="accent" className="ml-2">1. Wahl</Badge>}
              </div>
            </div>
            <span className="text-2xs text-fg-subtle">Android, PC &amp; Web</span>
          </div>

          <p className="mt-2 text-xs text-fg-muted">
            Öffnet direkt Google Kalender mit deinem persönlichen Abo. Bestätige dort einfach mit «Hinzufügen».
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={googleCalendarSubscribeUrl(calData.webcalUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ size: 'sm', variant: !isApple ? 'primary' : 'secondary' })}
            >
              <CalendarPlus className="size-4" /> In Google Kalender abonnieren (1-Klick)
            </a>
            <Button variant="ghost" size="sm" onClick={handleCopyUrl}>
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              {copied ? 'Kopiert' : 'Link kopieren'}
            </Button>
          </div>

          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowManualGoogle(!showManualGoogle)}
              className="text-2xs text-fg-subtle hover:text-fg underline underline-offset-2"
            >
              {showManualGoogle ? 'Anleitung für manuelles Einfügen ausblenden' : 'Geht das auch manuell? (Anleitung)'}
            </button>
            {showManualGoogle && (
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-fg-muted bg-surface-2 p-2.5 rounded-lg border border-line/60">
                <li>Klicke oben auf «Link kopieren».</li>
                <li>Öffne <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="text-accent-ink underline">calendar.google.com</a>.</li>
                <li>Links bei <em>«Weitere Kalender»</em> auf das <strong>+</strong> klicken.</li>
                <li>Wähle <strong>«Per URL hinzufügen»</strong> und füge den kopierten Link ein.</li>
              </ol>
            )}
          </div>
        </div>

        {/* 2. Apple Kalender (iPhone, iPad, Mac) */}
        <div
          className={cn(
            'rounded-card border p-4 transition-all',
            isApple ? 'border-accent bg-accent/5 ring-1 ring-accent/20' : 'border-line bg-surface'
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="size-4 text-fg" />
              <div>
                <span className="font-semibold text-fg">Apple Kalender</span>
                {isApple && <Badge tone="accent" className="ml-2">Für dein Gerät</Badge>}
              </div>
            </div>
            <span className="text-2xs text-fg-subtle">iPhone, iPad &amp; Mac</span>
          </div>

          <p className="mt-2 text-xs text-fg-muted">
            Öffnet direkt die integrierte Apple-Kalender-App. Dein iPhone oder Mac fragt sofort: «Möchtest du den Kalender abonnieren?».
          </p>

          <div className="mt-3">
            <a
              href={calData.webcalUrl}
              className={buttonClasses({ size: 'sm', variant: isApple ? 'primary' : 'secondary' })}
            >
              <CalendarSync className="size-4" /> In Apple Kalender abonnieren (1-Klick)
            </a>
          </div>
        </div>

        {/* 3. Microsoft Outlook / 365 */}
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-sky-600" />
              <span className="font-semibold text-fg">Microsoft Outlook</span>
            </div>
            <span className="text-2xs text-fg-subtle">Outlook 365, PC &amp; Web</span>
          </div>

          <p className="mt-2 text-xs text-fg-muted">
            Für Outlook im Browser oder auf dem PC/Mac.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={outlookCalendarSubscribeUrl(calData.httpsUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ size: 'sm', variant: 'secondary' })}
            >
              <ExternalLink className="size-4" /> In Outlook Web abonnieren
            </a>
            <a
              href={calData.webcalUrl}
              className={buttonClasses({ size: 'sm', variant: 'ghost' })}
            >
              Outlook App (Webcal)
            </a>
          </div>
        </div>

        {/* 4. Andere Kalender-Apps & Manuell */}
        <div className="rounded-card border border-line bg-surface p-4">
          <span className="font-semibold text-fg">Andere Kalender-Apps (URL)</span>
          <p className="mt-1 text-xs text-fg-muted">
            Unterstützt jede Kalender-App mit iCal/Webcal-Abonnement (z. B. Thunderbird, Fantastical).
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={calData.httpsUrl}
              className="w-full rounded-field border border-line bg-surface-2 px-3 py-1.5 font-mono text-xs text-fg select-all"
            />
            <Button size="sm" variant="secondary" onClick={handleCopyUrl} className="shrink-0">
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              {copied ? 'Kopiert' : 'Kopieren'}
            </Button>
          </div>
        </div>

        {/* 5. Statischer Download (.ics ohne Abo) */}
        {shifts.length > 0 && (
          <div className="rounded-card border border-line/80 bg-surface-2/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-semibold text-fg">Kein Abo gewünscht?</span>
                <p className="mt-0.5 text-2xs text-fg-subtle">
                  Einmalige .ics-Kalenderdatei aller deiner aktuellen Schichten herunterladen.
                  (Aktualisiert sich bei Änderungen nicht automatisch.)
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadIcs('meine-schichten.ics', shifts)}
                className="shrink-0"
              >
                <Download className="size-3.5" /> .ics herunterladen
              </Button>
            </div>
          </div>
        )}

        {/* Footer-Aktionen: Erneuern & Hilfe */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3 text-xs text-fg-subtle">
          <a
            href={helpUrl('/helfen/meine-schichten/')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-accent-ink hover:underline"
          >
            <HelpCircle className="size-3.5" /> Anleitung im Hilfe-Center
          </a>

          {onResetToken && (
            <button
              type="button"
              onClick={onResetToken}
              disabled={resettingToken}
              className="inline-flex items-center gap-1.5 text-fg-subtle hover:text-fg underline underline-offset-2 transition"
            >
              <RefreshCw className={cn('size-3', resettingToken && 'animate-spin')} />
              Abo-Link erneuern (Zugriff sperren)
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
