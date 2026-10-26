'use client';

import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { Button, Dialog, Field, Textarea } from '@schichtplan/ui';
import { helpUrl } from '@schichtplan/shared';

/**
 * «Ersatz suchen»: Grund freiwillig. Die Person bleibt eingetragen, bis jemand übernimmt.
 * `personName` gesetzt = das OK sucht Ersatz für jemand anderen.
 */
export function ReplacementDialog({
  open,
  shiftLabel,
  personName,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  shiftLabel?: string;
  personName?: string | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={personName ? `Ersatz für ${personName} suchen` : 'Ersatz suchen'}
      description={shiftLabel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button loading={busy} onClick={() => onSubmit(note.trim())}>
            Ersatz suchen
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          {personName ? `${personName} bleibt` : 'Du bleibst'} eingetragen, bis jemand die Schicht übernimmt. Wer sich für
          diese Schicht eintragen darf, kann sie mit einem Klick übernehmen.{' '}
          {personName ? `${personName} bekommt` : 'Du bekommst'} dann eine Mail.{' '}
          <a href={helpUrl('/helfen/ersatz-suchen/')} target="_blank" rel="noreferrer" className="font-semibold text-accent-ink hover:underline">
            Mehr dazu
          </a>
        </p>
        <Field label="Grund (freiwillig)">
          <Textarea
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Bin an diesem Tag verhindert"
          />
        </Field>
        <p className="flex items-start gap-2 rounded-field border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning-ink">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Den Grund sehen alle, die im Schichtplan die Namen sehen. Schreib nichts Persönliches hinein, z. B. keine
          Krankheit.
        </p>
      </div>
    </Dialog>
  );
}
