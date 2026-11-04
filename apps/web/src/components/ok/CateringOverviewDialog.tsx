'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Sparkles, UtensilsCrossed } from 'lucide-react';
import type { CateringTokensOverviewDto } from '@schichtplan/shared';
import { Badge, Button, Card, Dialog, EmptyState } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtTime } from '@/lib/format';

interface CateringOverviewDialogProps {
  open: boolean;
  onClose: () => void;
  eventSlug: string;
}

export function CateringOverviewDialog({
  open,
  onClose,
  eventSlug,
}: CateringOverviewDialogProps) {
  const [data, setData] = useState<CateringTokensOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<CateringTokensOverviewDto>(`/api/events/${eventSlug}/catering-overview`);
      setData(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadData();
    }
  }, [open, eventSlug]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      icon={<UtensilsCrossed />}
      title="Verpflegungs-Statistik & Kassensturz"
      description="Übersicht über alle ausgegebenen und eingelösten Helfer-Bons für die Festabrechnung."
    >
      <div className="space-y-6">
        {loading ? (
          <div className="py-12 text-center text-fg-muted flex flex-col items-center justify-center gap-2">
            <Loader2 className="size-6 animate-spin text-accent-ink" />
            <p className="text-xs">Statistiken werden geladen…</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-center text-xs text-danger-ink">
            {error}
          </div>
        ) : !data || data.totalTokens === 0 ? (
          <EmptyState
            icon={<UtensilsCrossed />}
            title="Noch keine Verpflegungs-Tokens erfasst"
            description="Sobald sich Helfende eintragen oder einchecken, erscheinen hier die Zahlen für die Festkasse."
          />
        ) : (
          <div className="space-y-5">
            {/* Übersichtszahlen */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Ausgegeben gesamt</p>
                <p className="font-display text-2xl font-extrabold text-fg mt-1 tabular">
                  {data.totalTokens} <span className="text-sm font-normal text-fg-muted">Bons</span>
                </p>
              </Card>

              <Card className="p-4 bg-success/5 border-success/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-success-ink">Eingelöst (Stand)</p>
                <p className="font-display text-2xl font-extrabold text-success-ink mt-1 tabular">
                  {data.redeemedTokens}{' '}
                  <span className="text-sm font-normal text-fg-muted">
                    ({data.totalTokens > 0 ? Math.round((data.redeemedTokens / data.totalTokens) * 100) : 0}%)
                  </span>
                </p>
              </Card>

              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Noch offen</p>
                <p className="font-display text-2xl font-extrabold text-fg mt-1 tabular">
                  {data.availableTokens} <span className="text-sm font-normal text-fg-muted">Bons</span>
                </p>
              </Card>
            </div>

            {/* Aufschlüsselung nach Bon-Typ (z. B. Menü vs Getränk) */}
            <div className="space-y-2.5">
              <h4 className="font-bold text-sm text-fg">Aufschlüsselung nach Angebot</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.byItem.map((item) => (
                  <Card key={item.title} className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-fg">{item.title}</span>
                      <Badge tone="accent" className="text-xs">
                        {item.redeemed} / {item.total} bezogen
                      </Badge>
                    </div>
                    {/* Fortschrittsbalken */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full bg-success transition-all duration-300"
                        style={{
                          width: `${item.total > 0 ? (item.redeemed / item.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Letzte Entwertungen */}
            {data.recentRedemptions.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="font-bold text-sm text-fg">Letzte Entwertungen am Stand</h4>
                <div className="rounded-xl border border-line divide-y divide-line overflow-hidden max-h-52 overflow-y-auto">
                  {data.recentRedemptions.map((r) => (
                    <div key={r.id} className="p-2.5 px-3 flex items-center justify-between text-xs bg-surface">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-success-ink shrink-0" />
                        <div>
                          <span className="font-semibold text-fg">{r.helperName}</span>
                          <span className="text-fg-muted"> · {r.title}</span>
                          {r.shiftTitle && <span className="text-fg-subtle"> ({r.shiftTitle})</span>}
                        </div>
                      </div>
                      <span className="text-fg-muted tabular font-mono">
                        {fmtTime(r.redeemedAt)} Uhr
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            Aktualisieren
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Schliessen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
