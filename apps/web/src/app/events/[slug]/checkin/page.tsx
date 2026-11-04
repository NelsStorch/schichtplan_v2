'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, CheckCircle2, LogIn, QrCode, TriangleAlert, UtensilsCrossed } from 'lucide-react';
import type { CateringTokenDto, CheckinResultDto } from '@schichtplan/shared';
import { Card, EmptyState, Skeleton, buttonClasses } from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { CateringTokenCard } from '@/components/CateringTokenCard';
import { api, errorMessage, loginUrl } from '@/lib/api';
import { fmtTime, fmtWeekday, fmtTimeRange } from '@/lib/format';
import { displayName, usePortal } from '@/lib/portal';

type State =
  | { kind: 'loading' }
  | { kind: 'done'; result: CheckinResultDto }
  | { kind: 'error'; message: string };

/** Ziel des QR-Codes am Anlass: eigene, gerade laufende Schichten als anwesend markieren */
export default function CheckinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, loading: portalLoading } = usePortal();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (portalLoading || started.current) return;
    if (!user) {
      // Nach dem Login kommt die Person mit demselben Code hierher zurück
      window.location.href = loginUrl(window.location.href);
      return;
    }
    started.current = true;
    const code = (new URLSearchParams(window.location.search).get('code') ?? '').trim();
    if (!code || code.length < 10) {
      setState({
        kind: 'error',
        message: 'Im Link fehlt ein gültiger Check-in-Code. Bitte scanne den offiziellen QR-Code direkt auf dem Plakat am Anlass vor Ort.',
      });
      return;
    }
    api<CheckinResultDto>(`/api/events/${slug}/checkin`, { method: 'POST', json: { code } })
      .then((result) => setState({ kind: 'done', result }))
      .catch((err) => setState({ kind: 'error', message: errorMessage(err) }));
  }, [portalLoading, user, slug]);

  return (
    <AppShell>
      <div className="mx-auto max-w-xl px-4 pt-10 pb-16 sm:pt-16">
        {portalLoading || (!user && state.kind === 'loading') ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3 rounded-card" />
            <Skeleton className="h-32 w-full rounded-card" />
            {!portalLoading && (
              <p className="pt-2 text-center text-sm text-fg-muted">
                <a href={loginUrl()} className="inline-flex items-center gap-1.5 font-semibold text-accent-ink">
                  <LogIn className="size-4" /> Zur Anmeldung
                </a>
              </p>
            )}
          </div>
        ) : state.kind === 'loading' ? (
          <div className="space-y-3" aria-busy="true">
            <p className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
              <QrCode className="size-4" /> Check-in läuft…
            </p>
            <Skeleton className="h-32 w-full rounded-card" />
          </div>
        ) : state.kind === 'error' ? (
          <EmptyState
            icon={<TriangleAlert />}
            title="Check-in nicht möglich"
            description={state.message}
            action={
              <Link href={`/events/${slug}`} className={buttonClasses({ variant: 'secondary' })}>
                Zum Schichtplan
              </Link>
            }
          />
        ) : (
          <CheckinResult slug={slug} result={state.result} name={user ? displayName(user) : ''} />
        )}
      </div>
    </AppShell>
  );
}

function CheckinResult({ slug, result, name }: { slug: string; result: CheckinResultDto; name: string }) {
  const [tokens, setTokens] = useState<CateringTokenDto[]>(result.cateringTokens ?? []);

  // Falls beim Check-in keine Tokens mitgegeben wurden (z. B. noch nicht im Check-in-Fenster),
  // laden wir allfällige Verpflegungs-Bons nach, da sie dank Kulanzfenster bereits verfügbar sein könnten.
  useEffect(() => {
    if (result.cateringTokens) {
      setTokens(result.cateringTokens);
    } else {
      api<CateringTokenDto[]>(`/api/events/${slug}/my-catering-tokens`)
        .then((data) => setTokens(data))
        .catch(() => {});
    }
  }, [slug, result]);

  const actions = (
    <div className="flex flex-wrap justify-center gap-2">
      <Link href="/meine-schichten" className={buttonClasses({ variant: 'secondary' })}>
        Meine Schichten
      </Link>
      <Link href={`/events/${slug}`} className={buttonClasses({ variant: 'ghost' })}>
        Zum Schichtplan
      </Link>
    </div>
  );

  const cateringSection = tokens.length > 0 && (
    <div className="space-y-3 pt-3 text-left">
      <div className="flex items-center gap-2">
        <UtensilsCrossed className="size-5 text-accent-ink" />
        <h2 className="font-display text-lg font-bold text-fg">Deine Verpflegungs-Bons</h2>
      </div>
      <p className="text-xs text-fg-muted">
        Zeige deinen Bon am Essens- oder Getränkestand vor und wische zum Entwerten direkt vor dem Personal.
      </p>
      <div className="grid gap-3">
        {tokens.map((token) => (
          <CateringTokenCard
            key={token.id}
            token={token}
            slug={slug}
            onRedeemed={(updated) => {
              setTokens((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            }}
          />
        ))}
      </div>
    </div>
  );

  if (result.checkedIn.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={<CalendarClock />}
          title={result.nextShift ? 'Deine Schicht hat noch nicht begonnen' : 'Gerade keine Schicht für dich'}
          description={
            result.nextShift
              ? `Deine nächste Schicht${result.nextShift.shiftTitle?.trim() ? ` «${result.nextShift.shiftTitle}»` : ''} beginnt ${fmtWeekday(result.nextShift.startTime)} um ${fmtTime(result.nextShift.startTime)}. ${(() => {
              const early = result.checkinEarlyMinutes ?? 30;
              const late = result.checkinLateMinutes ?? 30;
              const earlyPart = early === 0 ? 'ab Schichtbeginn' : `ab ${early} Minuten vorher`;
              const latePart = late === 0 ? 'bis Schichtende' : `bis ${late} Minuten nach Schichtende`;
              return `Einchecken geht ${earlyPart} ${latePart}: scann den QR-Code dann nochmals.`;
            })()}`
              : `Du bist bei «${result.eventTitle}» in keiner laufenden oder kommenden Schicht eingetragen. Melde dich beim OK, wenn du trotzdem hilfst.`
          }
          action={actions}
        />
        {cateringSection}
      </div>
    );
  }

  const allAlready = result.checkedIn.every((c) => c.alreadyPresent);
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/15 text-success-ink">
        <CheckCircle2 className="size-9" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-extrabold text-fg">
          {allAlready ? 'Du bist schon eingecheckt' : `Danke${name ? `, ${name}` : ''}! Du bist eingecheckt.`}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">{result.eventTitle}</p>
      </div>

      <div className="space-y-2 text-left">
        {result.checkedIn.map((c) => (
          <Card key={c.signupId} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-bold text-fg">{c.shiftTitle?.trim() || c.taskTitle || fmtTimeRange(c.startTime, c.endTime)}</p>
              <p className="text-xs text-fg-muted">
                {[c.shiftTitle?.trim() ? c.taskTitle : null, `${fmtWeekday(c.startTime)}, ${fmtTimeRange(c.startTime, c.endTime)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <CheckCircle2 className="size-5 shrink-0 text-success-ink" />
          </Card>
        ))}
      </div>

      {/* VERPFLEGUNGSGUTSCHEINE */}
      {cateringSection}

      {actions}
    </div>
  );
}
