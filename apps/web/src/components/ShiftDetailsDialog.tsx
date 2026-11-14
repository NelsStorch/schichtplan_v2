'use client';

import { useMemo } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Edit,
  HelpCircle,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  Phone,
  Repeat,
  Share2,
  Shield,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import {
  formatZurichDateTime,
  isSignupTimeOpen,
  replacementDeadline,
  type ShiftDto,
  type ShiftSignupDto,
  type ShiftTaskDto,
} from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Dialog,
  SlotMeter,
  buttonClasses,
  cn,
  slotStatus,
  useOrganization,
  useToast,
} from '@schichtplan/ui';
import { fmtDuration, fmtWeekday, fmtDayMonth, isPast, businessDayKey, fmtTimeRange } from '@/lib/format';
import { loginUrl } from '@/lib/api';
import { SignupCountdown } from './SignupCountdown';
import type { EventDetails } from '@/lib/types';

export interface ShiftDetailsDialogProps {
  shift: ShiftDto | null;
  event: EventDetails;
  isOpen: boolean;
  onClose: () => void;
  currentUser: { id: string; ceviName?: string | null; firstName?: string } | null;
  needsLogin: boolean;
  /** Angemeldet, aber nicht freigeschaltet: Grund statt Eintragen-Knopf */
  blockedReason?: string | null;
  canManage: boolean;
  busy?: boolean;
  onRedeemLink?: () => void;
  onSignup: (task?: ShiftTaskDto) => void;
  onCancel: (signupId?: string) => void;
  onRemoveHelper: (signupId: string, name: string) => void;
  onAssignHelper?: (shift: ShiftDto, task?: ShiftTaskDto) => void;
  onEditShift?: (shift: ShiftDto) => void;
  /** «Ersatz gesucht» setzen: personName null = für sich selbst */
  onOfferReplacement?: (signupId: string, personName: string | null) => void;
  onWithdrawReplacement?: (signupId: string) => void;
  /** Schicht mit «Ersatz gesucht» übernehmen */
  onTakeOver?: (offer: ShiftSignupDto, task?: ShiftTaskDto) => void;
}

export function ShiftDetailsDialog({
  shift,
  event,
  isOpen,
  onClose,
  currentUser,
  needsLogin,
  blockedReason,
  canManage,
  busy,
  onRedeemLink,
  onSignup,
  onCancel,
  onRemoveHelper,
  onAssignHelper,
  onEditShift,
  onOfferReplacement,
  onWithdrawReplacement,
  onTakeOver,
}: ShiftDetailsDialogProps) {
  // Hooks müssen vor dem frühen return stehen (sonst wechselt die Hook-Anzahl, wenn shift gesetzt wird)
  const org = useOrganization();
  const toast = useToast();
  const conflictingShift = useMemo(() => {
    if (!currentUser || !shift || !event?.shifts) return null;
    const sStart = new Date(shift.startTime).getTime();
    const sEnd = new Date(shift.endTime).getTime();
    return (
      event.shifts.find((other) => {
        if (other.id === shift.id) return false;
        const isSignedUp = (other.signups ?? []).some((su) => su.userId === currentUser.id);
        if (!isSignedUp) return false;
        const otherStart = new Date(other.startTime).getTime();
        const otherEnd = new Date(other.endTime).getTime();
        return sStart < otherEnd && sEnd > otherStart;
      }) || null
    );
  }, [currentUser, shift, event?.shifts]);

  if (!shift) return null;

  const signups = shift.signups ?? [];
  const filled = signups.length;
  const total = shift.requiredSlots;
  const status = slotStatus(filled, total);
  const free = Math.max(0, total - filled);
  const over = isPast(shift.endTime);

  const mySignupInShift = currentUser
    ? signups.find((s) => s.userId === currentUser.id)
    : null;
  const isMine = Boolean(mySignupInShift);

  // «Ersatz gesucht»: bis zur Frist des Anlasses vor Schichtbeginn
  const replacementOpen =
    event.allowReplacement !== false &&
    Date.now() < replacementDeadline(shift.startTime, event.replacementCutoffHours ?? 0).getTime();
  const offerCount = signups.filter((s) => s.replacementWantedAt).length;

  const tasks =
    shift.tasks && shift.tasks.length > 0
      ? shift.tasks
      : [
          {
            id: 'default',
            shiftId: shift.id,
            title: shift.title?.trim() || fmtTimeRange(shift.startTime, shift.endTime),
            description: shift.description,
            requiredSlots: shift.requiredSlots,
            minAge: shift.minAge,
            ageRequirementType: 'ALL' as const,
          },
        ];

  const dayKey = businessDayKey(shift.startTime, event.dayCutoffTime);
  const effectiveResponsibles =
    event.responsibleMode === 'BY_DAY'
      ? (event.dayResponsibles?.[dayKey] ?? [])
      : (shift.responsibles ?? []);

  // Sucht jemand Ersatz, teilt «Teilen» die Ersatz-Suche (eigene Vorschau «Ersatz gesucht»)
  const sharesReplacement = offerCount > 0 && replacementOpen && !over;

  /** Schicht-Link teilen (Handy: Teilen-Menü, sonst kopieren). Der Link bekommt eine eigene Vorschau. */
  const shareShift = async () => {
    const url = `${window.location.origin}/events/${encodeURIComponent(event.slug)}?schicht=${shift.id}${sharesReplacement ? '&ersatz=1' : ''}`;
    const name = shift.title?.trim() || (shift.tasks?.length === 1 ? shift.tasks[0].title : '') || 'Schicht';
    const when = `${fmtWeekday(shift.startTime)} ${fmtDayMonth(shift.startTime)}, ${fmtTimeRange(shift.startTime, shift.endTime)}`;
    const need = free > 0 ? ` Noch ${free === 1 ? '1 Platz' : `${free} Plätze`} frei.` : '';
    const text = sharesReplacement
      ? `Ersatz gesucht: ${name} am ${event.title} (${when}). Übernimmst du?`
      : `${name} am ${event.title} (${when}).${need} Trägst du dich ein?`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `${name} – ${event.title}`, text, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast({ title: 'Link kopiert', description: 'Einfach in WhatsApp oder E-Mail einfügen.' });
    } catch {
      toast({ title: 'Kopieren nicht möglich', description: url, tone: 'error' });
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-fg text-balance sm:text-2xl">
              {shift.title?.trim() || fmtTimeRange(shift.startTime, shift.endTime)}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {shift.isSetupTeardown && (
              <Badge tone="warning" className="border-warning/30 bg-warning/15 font-bold text-warning-ink">
                🛠️ Aufbau- / Abbau-Schicht
              </Badge>
            )}
            {shift.category ? <Badge>{shift.category}</Badge> : null}
            {shift.minAge && (
              <Badge tone="warning">
                <Shield className="size-3" /> Schicht ab {shift.minAge} J.
              </Badge>
            )}
            {isMine && (
              <Badge tone="success">
                <Check className="size-3" /> Du bist dabei
              </Badge>
            )}
            {offerCount > 0 && !over && (
              <Badge tone="warning">
                <Repeat className="size-3" /> Ersatz gesucht{offerCount > 1 ? ` (${offerCount})` : ''}
              </Badge>
            )}
            {over && <Badge tone="neutral">Vergangen</Badge>}
          </div>
        </div>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-fg-muted">
            <span className="tabular font-mono font-bold text-fg">{filled}</span> von{' '}
            <span className="tabular font-mono font-bold text-fg">{total}</span> Plätzen besetzt
          </div>
          <div className="flex items-center gap-2">
            {canManage && onAssignHelper && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAssignHelper(shift)}
              >
                <UserPlus className="size-3.5" /> Person einteilen
              </Button>
            )}
            {canManage && onEditShift && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  onEditShift(shift);
                }}
              >
                <Edit className="size-3.5" /> Bearbeiten
              </Button>
            )}
            {!over && (
              <Button variant="secondary" size="sm" onClick={() => shareShift()}>
                {sharesReplacement ? (
                  <>
                    <Repeat className="size-3.5" /> Ersatz-Suche teilen
                  </>
                ) : (
                  <>
                    <Share2 className="size-3.5" /> Teilen
                  </>
                )}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Schliessen
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 pt-1">
        {/* Zeit, Datum & Gesamtkapazität (Double-Bezel Card) */}
        <div className="rounded-card border border-line bg-surface-2/60 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-tile border border-accent/20 bg-accent/12 text-accent-ink shadow-sm">
                <Clock className="size-5" />
              </div>
              <div>
                <p className="font-display text-sm font-bold text-fg sm:text-base">
                  {fmtWeekday(shift.startTime)}, {fmtDayMonth(shift.startTime)}
                </p>
                <p className="font-mono text-xs text-fg-muted sm:text-sm">
                  {fmtTimeRange(shift.startTime, shift.endTime)}{' '}
                  <span className="text-fg-subtle">({fmtDuration(shift.startTime, shift.endTime)})</span>
                </p>
              </div>
            </div>

            <div className="text-right max-sm:w-full max-sm:border-t max-sm:border-line max-sm:pt-3">
              <SlotMeter filled={filled} total={total} className="w-32 max-sm:w-full" />
              <p
                className={cn(
                  'mt-1.5 text-xs font-semibold',
                  status === 'full'
                    ? 'text-success-ink'
                    : status === 'last'
                    ? 'text-warning-ink'
                    : 'text-fg-muted'
                )}
              >
                {status === 'full'
                  ? 'Voll besetzt'
                  : status === 'last'
                  ? 'Noch 1 Platz frei'
                  : `Noch ${free} Plätze frei`}
              </p>
            </div>
          </div>

          {shift.description && (
            <p className="mt-3.5 border-t border-line/80 pt-3 text-sm leading-relaxed text-fg-muted">
              {shift.description}
            </p>
          )}
        </div>

        {/* Freischaltung ausstehend */}
        {event.signupOpensAt && !isSignupTimeOpen(event.signupOpensAt) && !canManage && (
          <SignupCountdown opensAt={event.signupOpensAt} autoReload reloadShiftId={shift.id} />
        )}

        {/* Einladungs-Link Hinweis */}
        {event.viewer?.pendingLink && !event.viewer.pendingLink.alreadyRedeemed && (
          event.viewer.pendingLink.isExpired ? (
            <Callout tone="warning" title="Einladungs-Link abgelaufen">
              <p>Die Einlösefrist für diesen Zugangs-Link ist abgelaufen. Melde dich beim OK für einen neuen Link.</p>
            </Callout>
          ) : event.viewer.pendingLink.isBoundToOther ? (
            <Callout tone="danger" title="Persönlicher Link bereits vergeben">
              <p>Dieser persönliche Zugangs-Link wurde bereits von einer anderen Person eingelöst.</p>
            </Callout>
          ) : needsLogin ? (
            <Callout tone="info" title="Du wurdest eingeladen">
              <p>
                Melde dich an, um deinen Zugang zu «{event.title}» freizuschalten (ein {org.nicknameTerm} ohne Passwort
                reicht).
              </p>
              <a href={loginUrl()} className={buttonClasses({ size: 'sm', className: 'mt-2' })}>
                <LogIn className="size-3.5" /> Anmelden und Zugang freischalten
              </a>
            </Callout>
          ) : !event.viewer.access?.canSignup && onRedeemLink ? (
            <Callout tone="info" title="Du wurdest eingeladen">
              <p>
                Schalte jetzt deinen Zugang zu «{event.title}» frei
                {event.viewer.pendingLink.label ? ` («${event.viewer.pendingLink.label}»)` : ''}, um dich für diese Schicht einzutragen.
              </p>
              <Button size="sm" loading={busy} onClick={onRedeemLink} className="mt-2">
                <KeyRound className="size-3.5" /> Jetzt freischalten
              </Button>
            </Callout>
          ) : null
        )}

        {/* Schicht voll: Kontaktperson für Fragen */}
        {status === 'full' && event.contactUser && (
          <div className="rounded-card border border-accent/40 bg-accent/8 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent-ink">
                <HelpCircle className="size-5" />
              </div>
              <div className="space-y-1 text-xs">
                <h4 className="font-semibold text-fg text-sm">Schicht ist voll besetzt</h4>
                <p className="text-fg-muted">
                  Hast du Fragen zu dieser Schicht oder möchtest dich als Springer melden? Wende dich an die verantwortliche Person:
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-fg">{event.contactUser.displayName}</span>
                  {event.contactUser.phone && (
                    <a
                      href={`tel:${event.contactUser.phone}`}
                      className="inline-flex items-center gap-1 text-accent-ink hover:underline font-mono"
                    >
                      <Phone className="size-3.5" />
                      <span>{event.contactUser.phone}</span>
                    </a>
                  )}
                  {event.contactUser.email && (
                    <a
                      href={`mailto:${event.contactUser.email}`}
                      className="inline-flex items-center gap-1 text-accent-ink hover:underline"
                    >
                      <Mail className="size-3.5" />
                      <span>{event.contactUser.email}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Schicht- oder Tages-Verantwortliche */}
        {effectiveResponsibles.length > 0 && (
          <div className="rounded-card border border-line bg-surface p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
                {event.responsibleMode === 'BY_DAY' ? 'Tages-Verantwortliche*r' : 'Schicht-Verantwortliche*r'}
              </h4>
              <Badge tone="neutral" size="sm">
                {effectiveResponsibles.length} {effectiveResponsibles.length === 1 ? 'Person' : 'Personen'}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {effectiveResponsibles.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-field border border-line/70 bg-surface-2 p-2.5">
                  <div className="min-w-0">
                    <span className="font-semibold text-xs text-fg block truncate">{r.displayName}</span>
                    {(r.phone || r.email) && (
                      <div className="flex items-center gap-2 mt-0.5 text-2xs text-fg-muted">
                        {r.phone && (
                          <a href={`tel:${r.phone}`} className="inline-flex items-center gap-0.5 hover:text-accent-ink font-mono">
                            <Phone className="size-3" /> {r.phone}
                          </a>
                        )}
                        {r.email && (
                          <a href={`mailto:${r.email}`} className="inline-flex items-center gap-0.5 hover:text-accent-ink">
                            <Mail className="size-3" /> Mail
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Liste aller Arbeiten & Zuteilungen */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-fg sm:text-lg">
              Arbeiten in dieser Schicht
            </h3>
            <span className="font-mono text-xs font-semibold text-fg-subtle">
              {tasks.length} {tasks.length === 1 ? 'Arbeit' : 'Arbeiten'}
            </span>
          </div>

          <p className="mb-4 text-xs text-fg-muted">
            Wähle eine konkrete Arbeit aus, um dich einzutragen. Die Anforderungen und Jugendschutz-Regeln gelten pro Arbeit.
          </p>

          <div className="grid gap-3.5">
            {tasks.map((task) => {
              const taskSignups = signups.filter(
                (s) => s.taskId === task.id || (tasks.length === 1 && !s.taskId)
              );
              const taskFilled = taskSignups.length;
              const taskTotal = task.requiredSlots;
              const taskFull = taskFilled >= taskTotal;
              const taskMineSignup = currentUser
                ? taskSignups.find((s) => s.userId === currentUser.id)
                : null;
              const isMineInThisTask = Boolean(taskMineSignup);
              const isMineInOtherTask = isMine && !isMineInThisTask;
              const offers = over ? [] : taskSignups.filter((s) => s.replacementWantedAt && s.userId !== currentUser?.id);
              const canTakeOverHere =
                replacementOpen && !isMine && !conflictingShift && (needsLogin || event.viewer.canTakeOver);

              return (
                <div
                  key={task.id}
                  className={cn(
                    'group relative flex flex-col justify-between gap-4 rounded-card border p-4 transition-all duration-300 sm:p-5',
                    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]',
                    isMineInThisTask
                      ? 'border-accent/60 bg-[linear-gradient(135deg,rgb(var(--accent)/0.10),transparent_65%)] shadow-glow ring-1 ring-accent/30'
                      : 'border-line bg-surface hover:border-line-strong'
                  )}
                >
                  <div className="space-y-2.5">
                    {/* Titel & Status-Badge */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-display text-base font-bold text-fg sm:text-lg">
                            {task.title}
                          </h4>
                          {isMineInThisTask && (
                            <Badge tone="success" size="sm">
                              <Check className="size-3" /> Deine Arbeit
                            </Badge>
                          )}
                        </div>
                        {task.description && (
                          <p className="mt-1 text-xs leading-relaxed text-fg-muted sm:text-sm">
                            {task.description}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold',
                            taskFull
                              ? 'bg-success/15 text-success-ink'
                              : 'bg-surface-2 text-fg-muted'
                          )}
                        >
                          {taskFilled}/{taskTotal} belegt
                        </span>
                      </div>
                    </div>

                    {/* Jugendschutz / Mindestalter Regelungen */}
                    {task.minAge ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <Badge tone="warning" size="sm">
                          {task.ageRequirementType === 'ALL' ? (
                            <>
                              <AlertCircle className="size-3" /> Mindestalter ab {task.minAge} Jahren (alle Helfenden dieser Arbeit)
                            </>
                          ) : (
                            <>
                              <Shield className="size-3" /> Mindestalter ab {task.minAge} Jahren (mindestens 1 Person in Schicht)
                            </>
                          )}
                        </Badge>
                      </div>
                    ) : null}
                  </div>

                  {/* Eingetragene Personen */}
                  <div className="rounded-field border border-line/60 bg-surface-2/40 p-3">
                    <span className="mb-2 block text-2xs font-bold uppercase tracking-wider text-fg-subtle">
                      Eingeteilte Helfende ({taskFilled}/{taskTotal})
                    </span>

                    {taskSignups.length === 0 ? (
                      <p className="text-xs italic text-fg-subtle">
                        Noch niemand eingetragen. Sei die erste Person!
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Eingetragene Helfende">
                        {taskSignups.map((s) => {
                          const isCurrentUser = currentUser && s.userId === currentUser.id;
                          const wanted = Boolean(s.replacementWantedAt) && !over;
                          return (
                            <li
                              key={s.id}
                              title={wanted ? 'Sucht Ersatz' : undefined}
                              className={cn(
                                'inline-flex h-7 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-xs font-medium transition-colors',
                                wanted
                                  ? 'border border-dashed border-warning/60 bg-warning/10 text-warning-ink'
                                  : isCurrentUser
                                  ? 'border border-accent/40 bg-accent/15 text-accent-ink font-semibold'
                                  : 'bg-surface text-fg border border-line'
                              )}
                            >
                              <Avatar
                                name={s.displayName}
                                size="sm"
                                className="size-5 text-[8px]"
                              />
                              <span>
                                {s.displayName} {isCurrentUser && '(Du)'}
                              </span>
                              {wanted && <Repeat className="size-3" aria-label="sucht Ersatz" />}
                              {canManage && !isCurrentUser && !over && (s.replacementWantedAt || replacementOpen) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    s.replacementWantedAt
                                      ? onWithdrawReplacement?.(s.id)
                                      : onOfferReplacement?.(s.id, s.displayName)
                                  }
                                  aria-label={
                                    s.replacementWantedAt
                                      ? `Ersatz-Suche für ${s.displayName} beenden`
                                      : `Ersatz für ${s.displayName} suchen`
                                  }
                                  title={s.replacementWantedAt ? 'Ersatz-Suche beenden' : 'Ersatz suchen'}
                                  className="-mr-1 ml-0.5 rounded-full p-0.5 text-fg-subtle transition hover:bg-warning/15 hover:text-warning-ink"
                                >
                                  <Repeat className="size-3" />
                                </button>
                              )}
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveHelper(s.id, s.displayName)}
                                  aria-label={`${s.displayName} austragen`}
                                  className="-mr-1 ml-0.5 rounded-full p-0.5 text-fg-subtle transition hover:bg-danger/10 hover:text-danger-ink"
                                >
                                  <X className="size-3" />
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {/* «Ersatz gesucht»: wer und warum, mit Übernehmen */}
                    {offers.length > 0 && (
                      <ul className="mt-3 space-y-2" aria-label="Ersatz gesucht">
                        {offers.map((o) => (
                          <li
                            key={o.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-warning/40 bg-warning/10 p-2.5"
                          >
                            <div className="min-w-0 text-xs">
                              <p className="font-semibold text-warning-ink">
                                <Repeat className="mr-1 inline size-3.5" />
                                {o.userId || o.guestName ? `${o.displayName} sucht Ersatz` : 'Ersatz gesucht'}
                              </p>
                              {o.replacementNote && <p className="mt-0.5 text-fg-muted">«{o.replacementNote}»</p>}
                              {o.replacementByName && (
                                <p className="mt-0.5 text-2xs text-fg-subtle">eingetragen durch {o.replacementByName}</p>
                              )}
                            </div>
                            {canTakeOverHere &&
                              (needsLogin ? (
                                <a
                                  href={loginUrl()}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg hover:brightness-110"
                                >
                                  <Lock className="size-3" /> Anmelden &amp; übernehmen
                                </a>
                              ) : (
                                <Button size="sm" disabled={busy} onClick={() => onTakeOver?.(o, task.id === 'default' ? undefined : task)}>
                                  <UserCheck className="size-3.5" /> Übernehmen
                                </Button>
                              ))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Aktions-Button mit Button-in-Button Muster */}
                  {!over && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-line/60">
                      {isMineInThisTask && taskMineSignup?.replacementWantedAt ? (
                        <div className="flex w-full flex-wrap items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-ink">
                            <Repeat className="size-3.5" /> Du suchst Ersatz. Bis jemand übernimmt, bist du eingetragen.
                          </p>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => onWithdrawReplacement?.(taskMineSignup.id)}
                          >
                            Zurückziehen
                          </Button>
                        </div>
                      ) : isMineInThisTask ? (
                        <>
                        {replacementOpen && onOfferReplacement && taskMineSignup && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => onOfferReplacement(taskMineSignup.id, null)}
                          >
                            <Repeat className="size-3.5" /> Ersatz suchen
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => onCancel(taskMineSignup?.id)}
                          disabled={busy}
                          className="group inline-flex items-center gap-2 rounded-full border border-danger/40 bg-danger/15 py-1.5 pl-3.5 pr-2 text-xs font-semibold text-danger-ink transition-all duration-200 hover:bg-danger/25 active:scale-[0.98]"
                        >
                          <span>Aus dieser Arbeit austragen</span>
                          <span className="flex size-5 items-center justify-center rounded-full bg-danger/20 transition-transform duration-200 group-hover:scale-110">
                            <UserMinus className="size-3" />
                          </span>
                        </button>
                        </>
                      ) : isMineInOtherTask ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                          <Check className="size-3.5 text-accent-ink" /> Du bist bereits für eine andere Arbeit eingeteilt
                        </div>
                      ) : conflictingShift ? (
                        <div className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning-ink">
                          <AlertCircle className="size-3.5 shrink-0 text-warning" />
                          <span>
                            Zeitkollision mit «{conflictingShift.title}» ({fmtTimeRange(conflictingShift.startTime, conflictingShift.endTime)})
                          </span>
                        </div>
                      ) : taskFull ? (
                        <span className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg-muted border border-line">
                          Voll besetzt
                        </span>
                      ) : !event.allowPublicSignup ? (
                        <span
                          title="Das Eintragen ist geschlossen."
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg-muted"
                        >
                          <Lock className="size-3" /> Eintragen geschlossen
                        </span>
                      ) : (event.signupOpensAt && !isSignupTimeOpen(event.signupOpensAt)) ? (
                        <span
                          title={`Das Eintragen ist erst ab ${formatZurichDateTime(event.signupOpensAt!)} möglich.`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg-muted"
                        >
                          <Lock className="size-3" /> Noch nicht geöffnet
                        </span>
                      ) : needsLogin ? (
                        <a
                          href={loginUrl()}
                          className="group inline-flex items-center gap-2 rounded-full bg-accent py-1.5 pl-3.5 pr-2 text-xs font-semibold text-accent-fg transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                        >
                          <span>Anmelden &amp; eintragen</span>
                          <span className="flex size-5 items-center justify-center rounded-full bg-black/20 transition-transform duration-200 group-hover:scale-110">
                            <Lock className="size-3" />
                          </span>
                        </a>
                      ) : event.viewer?.pendingLink && !event.viewer.pendingLink.alreadyRedeemed && !event.viewer.access?.canSignup ? (
                        event.viewer.pendingLink.isExpired ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning-ink">
                            <Lock className="size-3" /> Link abgelaufen
                          </span>
                        ) : event.viewer.pendingLink.isBoundToOther ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger-ink">
                            <Lock className="size-3" /> Link vergeben
                          </span>
                        ) : onRedeemLink ? (
                          <button
                            type="button"
                            onClick={onRedeemLink}
                            disabled={busy}
                            className="group inline-flex items-center gap-2 rounded-full bg-accent py-1.5 pl-3.5 pr-2 text-xs font-semibold text-accent-fg shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                          >
                            <span>Zugang freischalten</span>
                            <span className="flex size-5 items-center justify-center rounded-full bg-black/20 transition-transform duration-200 group-hover:scale-110">
                              <KeyRound className="size-3" />
                            </span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg-muted">
                            <Lock className="size-3" /> Für dich nicht freigeschaltet
                          </span>
                        )
                      ) : blockedReason ? (
                        <span
                          title={blockedReason}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg-muted"
                        >
                          <Lock className="size-3" /> {event.viewer?.access?.reason === 'SIGNUP_NOT_YET_OPEN' ? 'Noch nicht geöffnet' : 'Für dich nicht freigeschaltet'}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSignup(task)}
                          disabled={busy}
                          className="group inline-flex items-center gap-2 rounded-full bg-accent py-1.5 pl-3.5 pr-2 text-xs font-semibold text-accent-fg shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                        >
                          <span>Für diese Arbeit eintragen</span>
                          <span className="flex size-5 items-center justify-center rounded-full bg-black/20 transition-transform duration-200 group-hover:scale-110">
                            <UserPlus className="size-3" />
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
