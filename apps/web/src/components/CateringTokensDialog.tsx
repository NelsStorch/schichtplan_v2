'use client';

import { useEffect, useState } from 'react';
import { Loader2, UtensilsCrossed } from 'lucide-react';
import type { CateringTokenDto } from '@schichtplan/shared';
import { Button, Dialog, EmptyState } from '@schichtplan/ui';
import { CateringTokenCard } from '@/components/CateringTokenCard';
import { api, errorMessage } from '@/lib/api';

interface CateringTokensDialogProps {
  open: boolean;
  onClose: () => void;
  eventSlug: string;
  eventTitle: string;
}

export function CateringTokensDialog({
  open,
  onClose,
  eventSlug,
  eventTitle,
}: CateringTokensDialogProps) {
  const [tokens, setTokens] = useState<CateringTokenDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTokens = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<CateringTokenDto[] | { tokens?: CateringTokenDto[] }>(
        `/api/events/${eventSlug}/my-catering-tokens`
      );
      setTokens(Array.isArray(data) ? data : (data.tokens ?? []));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadTokens();
    }
  }, [open, eventSlug]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      icon={<UtensilsCrossed />}
      title="Verpflegungs- & Getränke-Bons"
      description={`Deine digitalen Bons für «${eventTitle}».`}
    >
      <div className="space-y-4">
        {loading ? (
          <div className="py-12 text-center text-fg-muted flex flex-col items-center justify-center gap-2">
            <Loader2 className="size-6 animate-spin text-accent-ink" />
            <p className="text-xs">Gutscheine werden geladen…</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-center text-xs text-danger-ink">
            {error}
          </div>
        ) : tokens.length === 0 ? (
          <EmptyState
            icon={<UtensilsCrossed />}
            title="Keine Verpflegungs-Bons"
            description="Für diesen Anlass sind keine digitalen Gutscheine hinterlegt oder deine Schicht ist noch nicht freigeschaltet."
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">
              Zeige den gewünschten Bon am Essens- oder Getränkestand vor und wische vor den Augen des Personals nach rechts.
            </p>
            <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {tokens.map((t) => (
                <CateringTokenCard
                  key={t.id}
                  token={t}
                  slug={eventSlug}
                  onRedeemed={(updated) => {
                    setTokens((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Schliessen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
