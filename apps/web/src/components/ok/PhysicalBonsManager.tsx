'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Lock,
  Printer,
  RefreshCw,
  Sparkles,
  Unlock,
} from 'lucide-react';
import type { CateringBatchDto, CateringBatchMode } from '@schichtplan/shared';
import { Badge, Button, Field, Input, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';

interface PhysicalBonsManagerProps {
  eventSlug: string;
  eventTitle: string;
  items: string[];
}

export function PhysicalBonsManager({
  eventSlug,
  items,
}: PhysicalBonsManagerProps) {
  const toast = useToast();
  const [batches, setBatches] = useState<CateringBatchDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [helperCount, setHelperCount] = useState<number | null>(null);

  // Formular-State für neue Tranche
  const [mode, setMode] = useState<CateringBatchMode>('COMBI');
  const [cardCount, setCardCount] = useState<number>(20);
  const [customTitle, setCustomTitle] = useState('');
  const [generating, setGenerating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [bData, hData] = await Promise.all([
        api<CateringBatchDto[]>(`/api/events/${eventSlug}/catering-batches`).catch(() => []),
        api<{ totalHelpersCount: number }>(`/api/events/${eventSlug}/catering-batches/count-helpers`).catch(
          () => ({ totalHelpersCount: 0 })
        ),
      ]);
      setBatches(bData);
      setHelperCount(hData.totalHelpersCount);
      if (hData.totalHelpersCount > 0 && cardCount === 20) {
        setCardCount(hData.totalHelpersCount);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [eventSlug]);

  const handleCreateBatch = async () => {
    if (cardCount <= 0) {
      toast({ title: 'Ungültige Anzahl', description: 'Mindestens 1 Karte erforderlich', tone: 'error' });
      return;
    }
    setGenerating(true);
    try {
      const created = await api<CateringBatchDto>(`/api/events/${eventSlug}/catering-batches`, {
        method: 'POST',
        json: {
          title: customTitle.trim() || undefined,
          mode,
          cardCount,
        },
      });

      toast({
        title: `${created.title} generiert`,
        description: `${created.cardCount} physische Bons wurden angelegt. PDF wird geöffnet…`,
        tone: 'success',
      });

      setBatches((prev) => [created, ...prev]);
      setCustomTitle('');

      // Direkt das A4-PDF im neuen Tab öffnen
      window.open(`/api/events/${eventSlug}/catering-batches/${created.id}/pdf`, '_blank');
    } catch (err) {
      toast({
        title: 'Fehler beim Generieren',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleBlock = async (batchId: string) => {
    try {
      const updated = await api<CateringBatchDto>(
        `/api/events/${eventSlug}/catering-batches/${batchId}/toggle-block`,
        { method: 'PATCH' }
      );
      setBatches((prev) => prev.map((b) => (b.id === batchId ? updated : b)));
      toast({
        title: updated.isBlocked ? 'Tranche gesperrt' : 'Tranche freigegeben',
        description: updated.isBlocked
          ? 'Bons dieser Tranche können am Stand nicht mehr entwertet werden.'
          : 'Bons dieser Tranche sind am Stand wieder gültig.',
        tone: updated.isBlocked ? 'info' : 'success',
      });
    } catch (err) {
      toast({ title: 'Fehler', description: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <div className="space-y-5 pt-2">
      {/* 1. NEUE TRANCHE GENERIEREN */}
      <div className="rounded-xl border border-line bg-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-display text-sm font-bold text-fg flex items-center gap-2">
              <Printer className="size-4 text-accent-ink" /> Neue Druck-Tranche anlegen
            </h4>
            <p className="text-xs text-fg-muted mt-0.5">
              Generiert unpersönliche A4-Druckbögen (10 Bons pro Seite) mit QR-Codes zum Ausschneiden.
            </p>
          </div>
          {helperCount !== null && (
            <Badge tone="neutral" className="text-xs">
              👥 {helperCount} Helfende angemeldet
            </Badge>
          )}
        </div>

        {/* Modus: Kombi-Bon vs Einzel-Bons */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-fg">Bon-Typ &amp; Format</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setMode('COMBI')}
              className={cn(
                'rounded-lg border p-3 text-left transition relative flex flex-col justify-between',
                mode === 'COMBI'
                  ? 'border-accent bg-accent/10 ring-1 ring-accent'
                  : 'border-line bg-surface hover:border-line-strong'
              )}
            >
              <div>
                <div className="font-bold text-xs text-fg flex items-center justify-between">
                  <span>Kombi-Bon (1 QR-Code)</span>
                  {mode === 'COMBI' && <CheckCircle2 className="size-3.5 text-accent-ink" />}
                </div>
                <p className="text-[11px] text-fg-muted mt-1 leading-snug">
                  1 gedruckter Zettel enthält alle Gutscheine der Schicht (z. B.{' '}
                  {items.slice(0, 2).join(' & ')}). Am Stand flexibel einzeln oder zusammen entwertbar.
                </p>
              </div>
              <span className="mt-2 text-[10px] font-semibold text-accent-ink">Empfohlen für Festbetriebe</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('SINGLE')}
              className={cn(
                'rounded-lg border p-3 text-left transition relative flex flex-col justify-between',
                mode === 'SINGLE'
                  ? 'border-accent bg-accent/10 ring-1 ring-accent'
                  : 'border-line bg-surface hover:border-line-strong'
              )}
            >
              <div>
                <div className="font-bold text-xs text-fg flex items-center justify-between">
                  <span>Einzel-Bons (1 QR-Code pro Bon)</span>
                  {mode === 'SINGLE' && <CheckCircle2 className="size-3.5 text-accent-ink" />}
                </div>
                <p className="text-[11px] text-fg-muted mt-1 leading-snug">
                  Separater Zettel pro Artikel (z. B. 1 Zettel für {items[0] || 'Essen'}, 1 Zettel für{' '}
                  {items[1] || 'Trinken'}).
                </p>
              </div>
              <span className="mt-2 text-[10px] text-fg-muted">Klassische Abreiss-Bons</span>
            </button>
          </div>
        </div>

        {/* Anzahl & Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <Field
            label="Anzahl Sätze / Karten"
            hint={
              mode === 'COMBI'
                ? `${cardCount} Karten insgesamt (ergibt ${Math.ceil(cardCount / 10)} A4-Seiten)`
                : `${cardCount} Karten pro Artikel = ${cardCount * items.length} Karten (${Math.ceil(
                    (cardCount * items.length) / 10
                  )} A4-Seiten)`
            }
          >
            <div className="space-y-1.5">
              <Input
                type="number"
                min={1}
                max={1000}
                value={cardCount}
                onChange={(e) => setCardCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
              {helperCount !== null && helperCount > 0 && helperCount !== cardCount && (
                <button
                  type="button"
                  onClick={() => setCardCount(helperCount)}
                  className="text-[11px] text-accent-ink hover:underline font-semibold flex items-center gap-1"
                >
                  <Sparkles className="size-3" /> Exakt für alle {helperCount} Helfenden setzen
                </button>
              )}
            </div>
          </Field>

          <Field label="Optionaler Tranchen-Name" hint="z. B. «Reservekarten Grillstand» oder «Hauptdruck»">
            <Input
              placeholder={`z. B. Tranche ${(batches[0]?.batchNumber ?? 0) + 1}`}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
          </Field>
        </div>

        <div className="pt-2 flex justify-end">
          <Button
            type="button"
            variant="primary"
            loading={generating}
            onClick={handleCreateBatch}
            className="w-full sm:w-auto"
          >
            <Printer className="size-4 mr-1.5" />
            Tranche generieren &amp; A4-PDF öffnen
          </Button>
        </div>
      </div>

      {/* 2. BESTEHENDE TRANCHEN (HISTORIE) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-display text-xs font-bold uppercase tracking-wider text-fg-subtle">
            Bisherige Druck-Tranchen ({batches.length})
          </h4>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="text-xs text-accent-ink hover:underline font-medium inline-flex items-center gap-1"
          >
            <RefreshCw className={cn('size-3', loading && 'animate-spin')} /> Aktualisieren
          </button>
        </div>

        {batches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-fg-muted">
            Noch keine physischen Bons für diesen Anlass generiert.
          </div>
        ) : (
          <div className="space-y-2.5">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className={cn(
                  'rounded-xl border p-3.5 transition-all flex flex-wrap items-center justify-between gap-3',
                  batch.isBlocked
                    ? 'border-danger/40 bg-danger/5 opacity-80'
                    : 'border-line bg-surface hover:border-line-strong'
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-fg">{batch.title}</span>
                    <Badge tone={batch.isBlocked ? 'danger' : 'neutral'} size="sm">
                      {batch.isBlocked ? 'Gesperrt' : batch.mode === 'COMBI' ? 'Kombi-Bon' : 'Einzel-Bons'}
                    </Badge>
                  </div>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {batch.cardCount} Karten ({batch.tokenCount} Artikel-Gutscheine) ·{' '}
                    <span className="font-medium text-fg">{batch.redeemedTokensCount} bereits eingelöst</span> ·{' '}
                    {new Date(batch.createdAt).toLocaleDateString('de-CH', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      window.open(`/api/events/${eventSlug}/catering-batches/${batch.id}/pdf`, '_blank')
                    }
                    title="A4-Druckbogen als PDF herunterladen"
                  >
                    <Download className="size-3.5 mr-1" /> PDF Druckbogen
                  </Button>

                  <Button
                    type="button"
                    variant={batch.isBlocked ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => handleToggleBlock(batch.id)}
                    title={batch.isBlocked ? 'Tranche wieder freigeben' : 'Tranche sperren'}
                    className={batch.isBlocked ? 'text-success-ink' : 'text-danger-ink'}
                  >
                    {batch.isBlocked ? (
                      <>
                        <Unlock className="size-3.5 mr-1" /> Freigeben
                      </>
                    ) : (
                      <>
                        <Lock className="size-3.5 mr-1" /> Sperren
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
