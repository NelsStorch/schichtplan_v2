'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Ticket,
  UtensilsCrossed,
} from 'lucide-react';
import { PhysicalBonsManager } from '@/components/ok/PhysicalBonsManager';
import type { CateringTokensOverviewDto } from '@schichtplan/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  buttonClasses,
  cn,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { useOk } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { api, errorMessage } from '@/lib/api';
import { fmtDayMonth, fmtTime, fmtTimeRange, fmtWeekday } from '@/lib/format';

type StatusFilter = 'ALL' | 'AVAILABLE' | 'REDEEMED' | 'READY_NOW';
type RoleFilter = 'ALL' | 'HELPER' | 'LEADER';

export default function OkCateringPage() {
  const { event } = useOk();
  const toast = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState<CateringTokensOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [itemFilter, setItemFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'digital' | 'physical'>('digital');

  const loadOverview = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    try {
      const res = await api<CateringTokensOverviewDto>(`/api/events/${event.slug}/catering-overview`);
      setData(res);
    } catch (err) {
      toast({
        title: 'Verpflegungs-Übersicht konnte nicht geladen werden',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [event, toast]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  if (!event) return null;

  const handleManualRedeem = async (tokenId: string, title: string, helperName: string) => {
    const ok = await confirm({
      title: 'Bon manuell entwerten?',
      description: `Möchtest du «${title}» für ${helperName} jetzt als eingelöst markieren?`,
      confirmLabel: 'Jetzt entwerten',
      tone: 'default',
    });
    if (!ok) return;

    setBusyId(tokenId);
    try {
      await api(`/api/events/${event.slug}/catering-tokens/${tokenId}/redeem`, {
        method: 'POST',
      });
      toast({
        title: 'Bon entwertet',
        description: `${title} (${helperName}) wurde als eingelöst markiert.`,
        tone: 'success',
      });
      await loadOverview();
    } catch (err) {
      toast({
        title: 'Entwertung fehlgeschlagen',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleResetToken = async (tokenId: string, title: string, helperName: string) => {
    const ok = await confirm({
      title: 'Bon wieder freigeben?',
      description: `«${title}» von ${helperName} wird wieder auf «Offen / Einlösbar» zurückgesetzt (z. B. nach versehentlichem Wischen).`,
      confirmLabel: 'Zurücksetzen',
      tone: 'danger',
    });
    if (!ok) return;

    setBusyId(tokenId);
    try {
      await api(`/api/events/${event.slug}/catering-tokens/${tokenId}/reset`, {
        method: 'POST',
      });
      toast({
        title: 'Bon zurückgesetzt',
        description: `${title} (${helperName}) kann wieder eingelöst werden.`,
      });
      await loadOverview();
    } catch (err) {
      toast({
        title: 'Zurücksetzen fehlgeschlagen',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ['Person', 'Rolle', 'Bon', 'Status', 'Eingelöst am', 'Schicht', 'Schichtbeginn', 'Schichtende'],
      ...(data.tokens ?? []).map((t) => [
        t.helperName,
        t.isResponsible ? 'Schichtleitung' : 'Helfende',
        t.title,
        t.status === 'REDEEMED' ? 'Eingelöst' : 'Offen',
        t.redeemedAt ? `${fmtDayMonth(t.redeemedAt)} ${fmtTime(t.redeemedAt)}` : '',
        t.shiftTitle || 'Schicht',
        `${fmtDayMonth(t.shiftStartTime)} ${fmtTime(t.shiftStartTime)}`,
        `${fmtDayMonth(t.shiftEndTime)} ${fmtTime(t.shiftEndTime)}`,
      ]),
    ];
    const csvContent =
      '\uFEFF' +
      rows
        .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
        .join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verpflegungs-bons-${event.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredTokens = useMemo(() => {
    const list = data?.tokens ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((t) => {
      if (statusFilter === 'AVAILABLE' && t.status !== 'AVAILABLE') return false;
      if (statusFilter === 'REDEEMED' && t.status !== 'REDEEMED') return false;
      if (statusFilter === 'READY_NOW' && (t.status !== 'AVAILABLE' || !t.isAvailableNow)) return false;
      if (roleFilter === 'HELPER' && t.isResponsible) return false;
      if (roleFilter === 'LEADER' && !t.isResponsible) return false;
      if (itemFilter !== 'ALL' && t.title !== itemFilter) return false;
      if (q) {
        const hay = `${t.helperName} ${t.title} ${t.shiftTitle ?? ''} ${t.taskTitle ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, query, statusFilter, roleFilter, itemFilter]);

  if (!event.cateringTokensEnabled) {
    return (
      <div>
        <OkPageHeader
          title="Verpflegungs- & Getränke-Bons"
          description="Digitale Essens- und Getränkegutscheine für Helfende und die Schichtleitung auswerten und verwalten."
        />
        <EmptyState
          icon={<UtensilsCrossed />}
          title="Verpflegungs-Bons sind nicht aktiviert"
          description="Aktiviere die digitalen Verpflegungs- und Getränke-Tokens in den Anlass-Einstellungen, damit Helfende und Schichtleitungen pro Schicht automatisch ihre Bons erhalten."
          action={
            <Link href={`/events/${event.slug}/ok/einstellungen`} className={buttonClasses()}>
              <Settings className="size-4" /> In den Einstellungen aktivieren
            </Link>
          }
        />
      </div>
    );
  }

  const earlyHoursLabel =
    data?.earlyHours !== undefined
      ? data.earlyHours < 0
        ? 'Immer gültig (ohne Zeitfenster)'
        : data.earlyHours === 0
          ? 'Ab Schichtbeginn oder Check-in'
          : `Ab ${data.earlyHours} ${data.earlyHours === 1 ? 'Stunde' : 'Stunden'} vor Schichtbeginn (oder Check-in)`
      : '';

  return (
    <div className="space-y-8">
      <OkPageHeader
        title="Verpflegungs- & Getränke-Bons"
        description={
          <span>
            Auswertung, Kassensturz und Verwaltung aller Bons für Helfende und Schichtleitung.{' '}
            {earlyHoursLabel && <span className="font-semibold text-fg">Gültigkeit: {earlyHoursLabel}.</span>}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void loadOverview()} disabled={loading}>
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} /> Aktualisieren
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCsv}
              disabled={!data || data.totalTokens === 0}
            >
              <Download className="size-4" /> CSV-Export
            </Button>
            <Link
              href={`/events/${event.slug}/ok/einstellungen`}
              className={buttonClasses({ variant: 'ghost', size: 'sm' })}
            >
              <Settings className="size-4" /> Konfigurieren
            </Link>
          </>
        }
      />

      {/* Reiter-Auswahl */}
      <div className="flex border-b border-line gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('digital')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition',
            activeTab === 'digital'
              ? 'border-accent text-accent-ink'
              : 'border-transparent text-fg-muted hover:text-fg'
          )}
        >
          <UtensilsCrossed className="size-4" /> Digitale Bons &amp; Live-Auswertung
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('physical')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition',
            activeTab === 'physical'
              ? 'border-accent text-accent-ink'
              : 'border-transparent text-fg-muted hover:text-fg'
          )}
        >
          <Printer className="size-4" /> Physische Bons (A4-Druckbögen)
        </button>
      </div>

      {activeTab === 'physical' ? (
        <PhysicalBonsManager
          eventSlug={event.slug}
          eventTitle={event.title}
          items={event.cateringTokenItems ?? ['1x Helfermenü', '1x Getränk']}
        />
      ) : loading && !data ? (
        <div className="py-16 text-center text-fg-muted flex flex-col items-center justify-center gap-2">
          <Loader2 className="size-6 animate-spin text-accent-ink" />
          <p className="text-sm">Bons und Statistiken werden geladen…</p>
        </div>
      ) : data ? (
        <>
          {/* 1. Kennzahlen (KPI-Karten) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">Ausgegeben (Total)</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-fg tabular">{data.totalTokens}</p>
              <p className="mt-1 text-xs text-fg-muted">Inkl. Helfende &amp; Schichtleitung</p>
            </Card>
            <Card className="p-4 sm:p-5 border-success/30 bg-success/5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-success-ink">Eingelöst / Entwertet</p>
                <span className="text-xs font-bold text-success-ink tabular">
                  {data.totalTokens > 0 ? Math.round((data.redeemedTokens / data.totalTokens) * 100) : 0}%
                </span>
              </div>
              <p className="mt-1 font-display text-3xl font-extrabold text-success-ink tabular">
                {data.redeemedTokens}
              </p>
              <p className="mt-1 text-xs text-fg-muted">Am Stand bezogen</p>
            </Card>
            <Card className="p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">Noch offen</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-fg tabular">{data.availableTokens}</p>
              <p className="mt-1 text-xs text-fg-muted">Noch nicht eingelöst</p>
            </Card>
          </div>

          {/* 2. Aufschlüsselung nach Bon-Typ (Kassensturz) */}
          {data.byItem.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold text-fg">Kassensturz nach Bon-Typ</h3>
                {itemFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setItemFilter('ALL')}
                    className="text-xs font-semibold text-accent-ink hover:underline"
                  >
                    Filter zurücksetzen
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.byItem.map((item) => {
                  const pct = item.total > 0 ? Math.round((item.redeemed / item.total) * 100) : 0;
                  const active = itemFilter === item.title;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setItemFilter(active ? 'ALL' : item.title)}
                      className={cn(
                        'text-left rounded-card border p-4 transition-all',
                        active
                          ? 'border-accent bg-accent/8 ring-2 ring-accent/30'
                          : 'border-line bg-surface hover:border-line-strong'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-fg truncate">{item.title}</span>
                        <Badge tone={item.redeemed > 0 ? 'accent' : 'neutral'} size="sm">
                          {pct}% eingelöst
                        </Badge>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-success transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-fg-muted tabular">
                        <span>
                          <strong className="text-fg">{item.redeemed}</strong> eingelöst
                        </span>
                        <span>
                          {item.available} offen (von {item.total})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3. Alle Bons durchsuchen, manuell entwerten oder zurücksetzen */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-fg">
                  Alle Bons ({filteredTokens.length}
                  {filteredTokens.length !== (data.tokens?.length ?? 0) ? ` von ${data.tokens?.length ?? 0}` : ''})
                </h3>
                <p className="text-xs text-fg-muted">
                  Für Helfende ohne Smartphone kannst du Bons hier direkt suchen und manuell entwerten – oder versehentlich eingelöste Bons zurücksetzen.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, Schicht oder Bon suchen…"
                  className="pl-9"
                />
              </div>

              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Nach Status filtern"
              >
                <option value="ALL">Status: Alle ({data.totalTokens})</option>
                <option value="AVAILABLE">Status: Offen ({data.availableTokens})</option>
                <option value="READY_NOW">Status: Jetzt einlösbar</option>
                <option value="REDEEMED">Status: Eingelöst ({data.redeemedTokens})</option>
              </Select>

              <Select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                aria-label="Nach Rolle filtern"
              >
                <option value="ALL">Rolle: Helfende &amp; Schichtleitung</option>
                <option value="HELPER">Nur Helfende</option>
                <option value="LEADER">Nur Schichtleitung</option>
              </Select>

              <Select
                value={itemFilter}
                onChange={(e) => setItemFilter(e.target.value)}
                aria-label="Nach Bon-Typ filtern"
              >
                <option value="ALL">Bon-Typ: Alle</option>
                {data.byItem.map((i) => (
                  <option key={i.title} value={i.title}>
                    {i.title} ({i.redeemed}/{i.total})
                  </option>
                ))}
              </Select>
            </div>

            {filteredTokens.length === 0 ? (
              <EmptyState
                icon={<Ticket />}
                title="Keine passenden Bons gefunden"
                description="Passe deine Suchbegriffe oder Filter an."
              />
            ) : (
              <div className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="divide-y divide-line">
                  {filteredTokens.map((t) => {
                    const isRedeemed = t.status === 'REDEEMED';
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between',
                          isRedeemed && 'bg-surface-2/40'
                        )}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-fg">{t.helperName}</span>
                            {t.isResponsible && (
                              <Badge tone="accent" size="sm">
                                <Shield className="size-3" /> Schichtleitung
                              </Badge>
                            )}
                            <Badge tone={isRedeemed ? 'neutral' : 'accent'} size="sm">
                              {t.title}
                            </Badge>
                          </div>
                          <p className="text-xs text-fg-muted">
                            {t.shiftTitle || 'Schicht'}
                            {t.taskTitle && !t.isResponsible ? ` (${t.taskTitle})` : ''} ·{' '}
                            {fmtWeekday(t.shiftStartTime)}, {fmtDayMonth(t.shiftStartTime)},{' '}
                            {fmtTimeRange(t.shiftStartTime, t.shiftEndTime)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 sm:shrink-0">
                          {isRedeemed ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-ink">
                                <CheckCircle2 className="size-3.5" />
                                Eingelöst {t.redeemedAt ? `um ${fmtTime(t.redeemedAt)} Uhr` : ''}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={busyId === t.id}
                                onClick={() => void handleResetToken(t.id, t.title, t.helperName)}
                                title="Bon zurücksetzen, falls versehentlich eingelöst"
                              >
                                <RotateCcw className="size-3.5" /> Zurücksetzen
                              </Button>
                            </>
                          ) : (
                            <>
                              {t.isAvailableNow ? (
                                <Badge tone="success" size="sm">
                                  <Check className="size-3" /> Einlösbar
                                </Badge>
                              ) : (
                                <Badge tone="neutral" size="sm">
                                  <Clock className="size-3" /> Ab {fmtTime(t.availableFrom)} Uhr
                                </Badge>
                              )}
                              <Button
                                variant="secondary"
                                size="sm"
                                loading={busyId === t.id}
                                onClick={() => void handleManualRedeem(t.id, t.title, t.helperName)}
                              >
                                <Check className="size-3.5" /> Entwerten
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 4. Letzte Einlösungen */}
          {data.recentRedemptions.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-display text-base font-bold text-fg">Letzte Einlösungen am Stand</h3>
              <div className="rounded-card border border-line bg-surface divide-y divide-line">
                {data.recentRedemptions.slice(0, 15).map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="size-4 text-success-ink shrink-0" />
                      <span className="font-semibold text-fg truncate">{r.helperName}</span>
                      <span className="text-fg-muted truncate">· {r.title}</span>
                      {r.shiftTitle && <span className="text-fg-subtle truncate hidden sm:inline">({r.shiftTitle})</span>}
                    </div>
                    <span className="font-mono text-fg-muted shrink-0 tabular">
                      {fmtTime(r.redeemedAt)} Uhr
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
