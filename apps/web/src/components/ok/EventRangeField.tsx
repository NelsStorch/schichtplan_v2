'use client';

import { useState } from 'react';
import { CalendarClock, CalendarDays } from 'lucide-react';
import { addZurichDays, toZurichInput } from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDateRange } from '@/lib/format';
import type { EventDetails } from '@/lib/types';

/** Kalendertag (YYYY-MM-DD) eines Zeitpunkts in Schweizer Zeit */
const zurichDay = (iso: string) => toZurichInput(iso).slice(0, 10);

/** Abstand zweier YYYY-MM-DD in ganzen Tagen */
function dayDiff(from: string, to: string) {
  const ms = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

const daysLabel = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'Tag' : 'Tage'}`;

/**
 * Zeitraum eines Anlasses in den Einstellungen: ergibt sich aus der ersten und letzten Schicht.
 * Ändern geht nur über «Verschieben», dabei wandern alle Schichten mit.
 */
export function EventRangeField({ event, onMoved }: { event: EventDetails; onMoved: () => void | Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(zurichDay(event.startDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shifts = event.shifts ?? [];
  const signupCount = shifts.reduce((sum, s) => sum + (s.signups?.length ?? 0), 0);
  const days = day ? dayDiff(zurichDay(event.startDate), day) : 0;
  const preview =
    days !== 0
      ? fmtDateRange(addZurichDays(event.startDate, days).toISOString(), addZurichDays(event.endDate, days).toISOString())
      : null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setDay(zurichDay(event.startDate));
    setError(null);
  };

  const move = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/events/${event.slug}/move`, { method: 'POST', json: { days } });
      toast({ title: 'Anlass verschoben', description: `${shifts.length} Schichten um ${daysLabel(days)} verschoben.`, tone: 'success' });
      setOpen(false);
      await onMoved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 rounded-field border border-line bg-surface-2/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            <CalendarDays className="size-4 text-accent-ink" aria-hidden /> {fmtDateRange(event.startDate, event.endDate)}
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {shifts.length > 0
              ? 'Wird automatisch aus der ersten und letzten Schicht berechnet.'
              : 'Noch keine Schichten. Sobald es welche gibt, ergibt sich der Zeitraum aus ihnen.'}
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={() => setOpen(true)}>
          <CalendarClock aria-hidden /> Verschieben
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={close}
        icon={<CalendarClock />}
        title="Anlass verschieben"
        description="Wähle den neuen ersten Tag. Alle Schichten wandern um gleich viele Tage mit, die Uhrzeiten bleiben."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Abbrechen
            </Button>
            <Button onClick={move} disabled={busy || days === 0}>
              <CalendarClock aria-hidden />
              {busy ? 'Wird verschoben …' : 'Verschieben'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Neuer erster Tag" error={error ?? undefined}>
            <Input type="date" value={day} required onChange={(e) => setDay(e.target.value)} />
          </Field>
          {days !== 0 && (
            <Callout tone="warning">
              <p>
                {shifts.length > 0 ? (
                  <>
                    Alle {shifts.length} Schichten werden um {daysLabel(days)} {days > 0 ? 'nach hinten' : 'nach vorne'}{' '}
                    verschoben, neu <strong>{preview}</strong>.
                  </>
                ) : (
                  <>
                    Der Anlass wird um {daysLabel(days)} {days > 0 ? 'nach hinten' : 'nach vorne'} verschoben, neu{' '}
                    <strong>{preview}</strong>.
                  </>
                )}
                {event.signupOpensAt && ' Die Freischaltung des Eintragens wandert mit.'}
              </p>
              {signupCount > 0 && (
                <p className="mt-2">
                  {signupCount} Eintragungen bleiben bestehen. Die Helfenden bekommen keine Nachricht: Schreib ihnen danach
                  unter «Nachrichten», dass sich das Datum geändert hat.
                </p>
              )}
            </Callout>
          )}
        </div>
      </Dialog>
    </>
  );
}
