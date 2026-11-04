'use client';

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  Copy,
  Download,
  History,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Menu,
  MessageSquareText,
  Settings,
  Shield,
  Users,
  UtensilsCrossed,
  Wrench,
  type LucideProps,
} from 'lucide-react';
import { helpUrl, type EventCapability, type OK_PAGES } from '@schichtplan/shared';
import { Badge, Dialog, EmptyState, Skeleton, buttonClasses, cn, trackUi } from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { useCommandPalette } from '@/components/command';
import { fmtDateRange } from '@/lib/format';
import { OkProvider, useOk } from './OkContext';

interface NavItem {
  /** Pfad relativ zum OK-Bereich ('' = Übersicht) */
  path: string;
  label: string;
  icon: ComponentType<LucideProps>;
  /** Nur sichtbar mit dieser Fähigkeit im Anlass */
  capability?: EventCapability;
  count?: (ctx: ReturnType<typeof useOk>) => number | null;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/** Reihenfolge wie die Arbeit am Anlass: planen, Helfende betreuen, durchführen, verwalten */
const NAV: NavGroup[] = [
  { label: null, items: [{ path: '', label: 'Übersicht', icon: LayoutDashboard }] },
  {
    label: 'Planen',
    items: [
      { path: 'schichten', label: 'Schichten', icon: CalendarDays, count: (c) => c.event?.shifts.length ?? null },
      { path: 'schichten/arbeiten', label: 'Arbeiten-Katalog', icon: Wrench, capability: 'SHIFTS' },
      { path: 'schichten/vorlagen', label: 'Vorlagen', icon: Copy, capability: 'TEMPLATES' },
    ],
  },
  {
    label: 'Helfende',
    items: [
      { path: 'helfende', label: 'Helfende', icon: Users, count: (c) => c.stats.helperCount },
      { path: 'fragen', label: 'Fragen', icon: MessageSquareText, count: (c) => c.event?.questions.length ?? null },
      { path: 'helfende/zugang', label: 'Zugang & Antworten', icon: KeyRound },
      { path: 'nachrichten', label: 'Nachrichten', icon: Mail, capability: 'MESSAGES' },
    ],
  },
  {
    label: 'Am Anlass',
    items: [
      { path: 'anwesenheit', label: 'Anwesenheit', icon: ClipboardCheck, capability: 'ATTENDANCE' },
      { path: 'verpflegung', label: 'Verpflegungs-Bons', icon: UtensilsCrossed, capability: 'ATTENDANCE' },
      { path: 'export', label: 'Export & Drucken', icon: Download, capability: 'EXPORT' },
    ],
  },
  {
    label: 'Verwaltung',
    items: [
      { path: 'einstellungen', label: 'Einstellungen', icon: Settings, capability: 'SETTINGS' },
      { path: 'protokoll', label: 'Protokoll', icon: History },
    ],
  },
];

function itemHref(base: string, path: string) {
  return path ? `${base}/${path}` : base;
}

function OkNav({ onNavigate }: { onNavigate?: () => void }) {
  const ctx = useOk();
  const pathname = usePathname();
  const { base, permissions } = ctx;

  // Längster passender Pfad gewinnt (schichten/arbeiten vor schichten)
  const allItems = NAV.flatMap((g) => g.items);
  const active = allItems
    .filter((i) => {
      const href = itemHref(base, i.path);
      return i.path === '' ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
    })
    .sort((a, b) => b.path.length - a.path.length)[0];

  // Auf kleinen Bildschirmen scrollt die Navigation selbst: aktiven Bereich sichtbar halten
  const activeLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const link = activeLink.current;
    const box = link?.closest('[data-ok-nav-scroll]');
    if (!link || !box) return;
    const top = link.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = top - (box.clientHeight - link.offsetHeight) / 2;
  }, [active]);

  return (
    <nav aria-label="OK-Bereich" className="space-y-5">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.capability || permissions.can[i.capability]);
        if (items.length === 0) return null;
        return (
          <div key={group.label ?? 'start'}>
            {group.label && (
              <p className="mb-1.5 px-3 text-2xs font-bold uppercase tracking-wider text-fg-subtle">{group.label}</p>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item;
                const count = item.count?.(ctx);
                return (
                  <li key={item.path}>
                    <Link
                      ref={isActive ? activeLink : undefined}
                      href={itemHref(base, item.path)}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-field px-3 py-2 text-sm font-semibold transition-colors',
                        isActive ? 'bg-accent/12 text-accent-ink' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {count !== null && count !== undefined && (
                        <span className="tabular text-2xs font-semibold text-fg-subtle">{count}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <a
        href={helpUrl('/ok/ok-bereich/')}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2.5 rounded-field px-3 py-2 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <LifeBuoy className="size-4 shrink-0" /> Hilfe zum OK-Bereich
      </a>
    </nav>
  );
}

/** Aktueller Bereich (längster passender Pfad) */
function useCurrentItem() {
  const { base } = useOk();
  const pathname = usePathname();
  return NAV.flatMap((g) => g.items)
    .filter((i) => {
      const href = itemHref(base, i.path);
      return i.path === '' ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
    })
    .sort((a, b) => b.path.length - a.path.length)[0];
}

function OkFrame({ children }: { children: ReactNode }) {
  const { event, loading, error, permissions } = useOk();
  const { registerContextData } = useCommandPalette();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentItem = useCurrentItem();
  const currentLabel = currentItem?.label ?? 'Übersicht';
  const currentPath = currentItem?.path ?? '';

  // Welche Bereiche das OK nutzt (nur der Bereich, nicht der Anlass)
  useEffect(() => {
    trackUi('UI_OK_PAGE', (currentPath || 'uebersicht') as keyof typeof OK_PAGES);
  }, [currentPath]);

  useEffect(() => {
    if (!event) return;
    return registerContextData({
      event,
      slug: event.slug,
      isOkArea: true,
    });
  }, [event, registerContextData]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <Skeleton className="mb-6 h-10 w-64" />
        <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
          <Skeleton className="hidden h-96 rounded-card lg:block" />
          <Skeleton className="h-96 rounded-card" />
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-16">
        <EmptyState
          icon={<AlertTriangle />}
          title="Anlass nicht gefunden"
          description={error || 'Der Anlass konnte nicht geladen werden.'}
          action={
            <Link href="/" className={buttonClasses()}>
              Zur Startseite
            </Link>
          }
        />
      </div>
    );
  }

  // Ganzer OK-Bereich oder ein Teil davon (direkt aufgerufen) ohne das passende Recht
  const missingCapability = Boolean(currentItem?.capability && !permissions.can[currentItem.capability]);
  if (!permissions.canManage || missingCapability) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-16">
        <EmptyState
          icon={<Shield className="size-12 text-warning-ink" />}
          title="Keine Berechtigung"
          description={
            missingCapability
              ? `Für «${currentLabel}» fehlt dir in diesem Anlass das Recht. Frag die OK-Leitung oder die Abteilungsleitung.`
              : 'Der OK-Bereich ist für das OK dieses Anlasses, die Abteilungsleitung und wer «Alle Anlässe sehen» darf.'
          }
          action={
            <Link href={`/events/${event.slug}`} className={buttonClasses()}>
              Zum Schichtplan
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      {/* Kopf: welcher Anlass, welche Rolle */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/events/${event.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted transition hover:text-fg"
          >
            <ArrowLeft className="size-4" /> Zum Schichtplan für Helfende
          </Link>
          <h1 className="mt-2 truncate font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
            {event.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <CalendarDays className="size-4" /> {fmtDateRange(event.startDate, event.endDate, event.dayCutoffTime)}
            <Badge tone="accent" size="sm">
              <Shield className="size-3" /> OK-Bereich
            </Badge>
            {permissions.roleLabel && (
              <Badge tone="neutral" size="sm">
                Du: {permissions.roleLabel}
              </Badge>
            )}
          </p>
        </div>
      </div>

      {/* Handy: aktueller Bereich + Menü */}
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="sticky top-[4.5rem] z-10 mb-5 flex w-full items-center justify-between gap-3 rounded-card border border-line bg-surface/95 px-4 py-3 text-left shadow-soft backdrop-blur lg:hidden"
        aria-haspopup="dialog"
      >
        <span className="min-w-0">
          <span className="block text-2xs font-bold uppercase tracking-wider text-fg-subtle">Bereich</span>
          <span className="block truncate font-semibold text-fg">{currentLabel}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink">
          <Menu className="size-4" /> Wechseln
        </span>
      </button>
      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="OK-Bereich" size="sm">
        <OkNav onNavigate={() => setMenuOpen(false)} />
      </Dialog>

      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div data-ok-nav-scroll className="sticky top-24 -m-1 max-h-[calc(100dvh-7rem)] overflow-y-auto p-1">
            <OkNav />
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

export function OkLayout({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <AppShell>
      <OkProvider slug={slug}>
        <OkFrame>{children}</OkFrame>
      </OkProvider>
    </AppShell>
  );
}

/** Seitenkopf innerhalb des OK-Bereichs: Titel, kurze Erklärung, Hilfe-Link, Aktionen */
export function OkPageHeader({
  title,
  description,
  help,
  actions,
}: {
  title: string;
  description?: ReactNode;
  /** Pfad im Hilfe-Center, z. B. '/ok/schichten-planen/' */
  help?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        <h2 className="font-display text-xl font-extrabold tracking-tight text-fg sm:text-2xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        {help && (
          <a
            href={helpUrl(help)}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline"
          >
            <LifeBuoy className="size-3.5" /> Anleitung im Hilfe-Center
          </a>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
