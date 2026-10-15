import Link from 'next/link';
import { ArrowRight, CalendarDays, Layers } from 'lucide-react';
import type { EventDto } from '@schichtplan/shared';
import { Badge, CeviLogo, cn } from '@schichtplan/ui';
import { fmtRelativeDay, fmtShortDate, fmtShortWeekday, isPast } from '@/lib/format';
import { AccessTypeBadge } from './event-meta';

export function eventStatus(event: Pick<EventDto, 'startDate' | 'endDate'>) {
  if (isPast(event.endDate)) return 'past' as const;
  if (isPast(event.startDate)) return 'live' as const;
  return 'upcoming' as const;
}

/** Bild-Kachel für einen Anlass. `featured` = grosse Bühne für den nächsten Anlass. */
export function EventTile({ event, featured, index = 0 }: { event: EventDto; featured?: boolean; index?: number }) {
  const status = eventStatus(event);
  const dateLabel = `${fmtShortWeekday(event.startDate)} ${fmtShortDate(event.startDate)}`;

  return (
    <Link
      href={`/events/${event.slug}`}
      style={{ '--i': index } as React.CSSProperties}
      className={cn(
        'group relative isolate flex animate-fade-up stagger flex-col justify-end overflow-hidden rounded-card bg-surface-3 text-white shadow-lift',
        'transition-transform duration-500 ease-out-expo hover:-translate-y-1',
        featured ? 'min-h-[26rem] sm:min-h-[32rem]' : 'min-h-[19rem]'
      )}
    >
      {event.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.bannerUrl}
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-[1.2s] ease-out-expo group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_10%_0%,rgb(var(--accent)/0.9),rgb(var(--accent)/0.35)_45%,rgb(12_10_9)_100%)]">
          <CeviLogo className="absolute -right-10 -top-10 size-64 opacity-15" alt="" />
        </div>
      )}
      {/* Scrim für lesbaren Text auf jedem Foto */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/0" />

      <div className={cn('flex flex-col gap-4', featured ? 'p-6 sm:p-10' : 'p-6')}>
        <div className="flex flex-wrap items-center gap-2">
          {status === 'live' ? (
            <Badge tone="glass">
              <span className="size-2 animate-pulse rounded-full bg-success" /> Läuft gerade
            </Badge>
          ) : (
            <Badge tone="glass">
              <CalendarDays /> {dateLabel}
              {status === 'upcoming' && <span className="font-medium text-white/70">· {fmtRelativeDay(event.startDate)}</span>}
            </Badge>
          )}
          <AccessTypeBadge type={event.accessType} leadersOnly={event.leadersOnly} tone="glass" />
          {status !== 'past' && event.totalSlots ? (
            <Badge tone="glass">
              {event.totalSlots - (event.filledSlots ?? 0) > 0
                ? `${event.totalSlots - (event.filledSlots ?? 0)} Plätze frei`
                : 'Alles besetzt'}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-end gap-4">
          {event.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.logoUrl}
              alt=""
              className={cn(
                'shrink-0 rounded-tile border border-white/20 object-cover shadow-lift',
                featured ? 'size-16 sm:size-20' : 'size-12'
              )}
            />
          )}
          <h3
            className={cn(
              'font-display font-extrabold leading-[0.95] tracking-[-0.03em] text-balance',
              featured ? 'text-4xl sm:text-6xl' : 'text-3xl'
            )}
          >
            {event.title}
          </h3>
        </div>

        {event.description && (
          <p className={cn('max-w-2xl leading-relaxed text-white/80', featured ? 'line-clamp-2 text-base' : 'line-clamp-2 text-sm')}>
            {event.description}
          </p>
        )}

        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-white/75">
            <Layers className="size-4" /> {event.shiftCount ?? 0} Schichten
          </span>
          <span className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-stone-900 transition-[gap] duration-300 group-hover:gap-3">
            Schichten ansehen <ArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
