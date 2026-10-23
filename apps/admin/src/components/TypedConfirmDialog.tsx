'use client';

import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Callout, Dialog, Field, Input } from '@schichtplan/ui';

/**
 * Bestätigung für endgültiges Löschen: Der Knopf wird erst aktiv, wenn `expected`
 * (Subdomain bzw. Kürzel) genau eingetippt ist. Das Backend prüft dasselbe nochmals.
 */
export function TypedConfirmDialog({
  open,
  title,
  description,
  expected,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  expected: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (typed: string) => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setTyped('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(typed.trim());
      setTyped('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Etwas ist schiefgelaufen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="md"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy || typed.trim() !== expected}>
            <Trash2 aria-hidden />
            {busy ? 'Wird gelöscht …' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Callout tone="danger">{description}</Callout>
        <Field
          label={
            <>
              Zur Bestätigung <span className="font-mono text-danger-ink">{expected}</span> eintippen
            </>
          }
          error={error ?? undefined}
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typed.trim() === expected && !busy) submit();
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
