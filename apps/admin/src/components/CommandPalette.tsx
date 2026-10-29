'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  CalendarDays,
  ChartColumn,
  Command,
  History,
  LayoutDashboard,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Avatar, Badge, Dialog, cn } from '@schichtplan/ui';
import type {
  AdminDepartmentListItemDto,
  AdminEventListItemDto,
  AdminUserListItemDto,
} from '@schichtplan/shared';
import { api } from '../lib/api';
import { fullName } from '../lib/format';
import type { AdminTab } from './DashboardPanel';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  departments: AdminDepartmentListItemDto[];
  onNavigate: (tab: AdminTab) => void;
  onOpenDepartment: (id: string) => void;
  onOpenUser: (user: AdminUserListItemDto) => void;
  onCreateDepartment?: () => void;
}

export function CommandPalette({
  open,
  onClose,
  departments,
  onNavigate,
  onOpenDepartment,
  onOpenUser,
  onCreateDepartment,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchedUsers, setSearchedUsers] = useState<AdminUserListItemDto[]>([]);
  const [searchedEvents, setSearchedEvents] = useState<AdminEventListItemDto[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setSearchedUsers([]);
      setSearchedEvents([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Live-Suche nach Personen und Anlässen bei mindestens 2 Zeichen
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchedUsers([]);
      setSearchedEvents([]);
      return;
    }

    const controller = new AbortController();
    setLoadingRemote(true);
    const timer = setTimeout(async () => {
      try {
        const [usersRes, eventsRes] = await Promise.all([
          api<{ items: AdminUserListItemDto[] }>(`/api/admin/users?q=${encodeURIComponent(q)}&pageSize=5`, {
            signal: controller.signal,
          }).catch(() => ({ items: [] })),
          api<{ items: AdminEventListItemDto[] }>(`/api/admin/events?q=${encodeURIComponent(q)}&pageSize=5&when=all`, {
            signal: controller.signal,
          }).catch(() => ({ items: [] })),
        ]);
        setSearchedUsers(usersRes.items || []);
        setSearchedEvents(eventsRes.items || []);
      } finally {
        if (!controller.signal.aborted) setLoadingRemote(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const q = query.trim().toLowerCase();

  // Navigation Items
  const navItems = [
    { id: 'nav-uebersicht', label: 'Zur Übersicht wechseln', icon: <LayoutDashboard />, action: () => onNavigate('uebersicht') },
    { id: 'nav-abteilungen', label: 'Zu Abteilungen wechseln', icon: <Building2 />, action: () => onNavigate('abteilungen') },
    { id: 'nav-anlaesse', label: 'Zu Anlässen wechseln', icon: <CalendarDays />, action: () => onNavigate('anlaesse') },
    { id: 'nav-personen', label: 'Zu Personen wechseln', icon: <Users />, action: () => onNavigate('personen') },
    { id: 'nav-statistik', label: 'Zur Statistik wechseln', icon: <ChartColumn />, action: () => onNavigate('statistik') },
    { id: 'nav-protokoll', label: 'Zum Protokoll wechseln', icon: <History />, action: () => onNavigate('protokoll') },
    ...(onCreateDepartment
      ? [{ id: 'action-create-dept', label: 'Neue Abteilung anlegen', icon: <Plus />, action: onCreateDepartment }]
      : []),
  ].filter((item) => !q || item.label.toLowerCase().includes(q));

  // Matched Departments
  const matchedDepartments = departments
    .filter((d) => !q || d.name.toLowerCase().includes(q) || d.slug.includes(q))
    .slice(0, 5);

  interface FlatItem {
    id: string;
    category: string;
    render: () => React.ReactNode;
    action: () => void;
  }

  const allItems: FlatItem[] = [
    ...navItems.map((n) => ({
      id: n.id,
      category: 'Navigation & Aktionen',
      render: () => (
        <span className="flex items-center gap-2.5">
          <span className="text-fg-subtle [&_svg]:size-4">{n.icon}</span>
          <span className="font-medium text-fg">{n.label}</span>
        </span>
      ),
      action: () => {
        n.action();
        onClose();
      },
    })),
    ...matchedDepartments.map((d) => ({
      id: `dept-${d.id}`,
      category: 'Abteilungen',
      render: () => (
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2.5 min-w-0">
            <Building2 className="size-4 shrink-0 text-accent-ink" />
            <span className="truncate font-semibold text-fg">{d.name}</span>
            <span className="truncate font-mono text-xs text-fg-subtle">{d.slug}</span>
          </span>
          <Badge tone="outline" className="text-2xs shrink-0">
            {d.upcomingEventCount} kommend
          </Badge>
        </span>
      ),
      action: () => {
        onOpenDepartment(d.id);
        onClose();
      },
    })),
    ...searchedUsers.map((u) => ({
      id: `user-${u.id}`,
      category: 'Personen',
      render: () => (
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2.5 min-w-0">
            <Avatar name={fullName(u)} size="sm" />
            <span className="truncate font-semibold text-fg">{fullName(u)}</span>
            {u.email && <span className="truncate text-xs text-fg-subtle">{u.email}</span>}
          </span>
          <Badge tone="outline" className="text-2xs shrink-0">
            {u.memberships[0]?.departmentName ?? u.homeDepartmentName ?? 'Konto'}
          </Badge>
        </span>
      ),
      action: () => {
        onOpenUser(u);
        onClose();
      },
    })),
    ...searchedEvents.map((e) => ({
      id: `event-${e.id}`,
      category: 'Anlässe',
      render: () => (
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2.5 min-w-0">
            <CalendarDays className="size-4 shrink-0 text-accent-ink" />
            <span className="truncate font-semibold text-fg">{e.title}</span>
            <span className="truncate text-xs text-fg-subtle">{e.departmentName}</span>
          </span>
          <Badge tone="outline" className="text-2xs shrink-0">
            {e.slotCount ? `${e.signupCount}/${e.slotCount}` : 'Anlass'}
          </Badge>
        </span>
      ),
      action: () => {
        onNavigate('anlaesse');
        onClose();
      },
    })),
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % Math.max(1, allItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((idx) => (idx - 1 + allItems.length) % Math.max(1, allItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Befehlsmenü & Schnellsuche"
      dismissOnBackdrop
      size="lg"
      className="p-0 overflow-hidden"
    >
      <div className="border-b border-line px-4 py-3 bg-surface-2/40">
        <div className="relative flex items-center gap-3">
          <Search className="size-5 shrink-0 text-fg-subtle" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Abteilung, Person, Anlass oder Aktion suchen … (z. B. «Zürich», «Lea», «Statistik»)"
            className="w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded-full p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg"
            >
              <X className="size-4" />
            </button>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-2xs font-mono text-fg-subtle">
            ESC
          </span>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto p-2">
        {loadingRemote && <p className="px-3 py-2 text-xs text-fg-subtle">Suche läuft …</p>}
        {allItems.length === 0 ? (
          <div className="py-10 text-center text-sm text-fg-subtle">Keine Treffer zu «{query}»</div>
        ) : (
          <ul className="space-y-1">
            {allItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-field px-3 py-2.5 text-left text-sm transition-colors',
                      isSelected ? 'bg-accent/12 text-fg' : 'hover:bg-surface-2 text-fg'
                    )}
                  >
                    <div className="min-w-0 flex-1">{item.render()}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line bg-surface-2/40 px-4 py-2 flex items-center justify-between text-2xs text-fg-subtle">
        <span className="flex items-center gap-3">
          <span><kbd className="font-mono bg-surface border border-line rounded px-1">↑↓</kbd> Navigieren</span>
          <span><kbd className="font-mono bg-surface border border-line rounded px-1">↵</kbd> Öffnen</span>
          <span><kbd className="font-mono bg-surface border border-line rounded px-1">ESC</kbd> Schliessen</span>
        </span>
        <span className="flex items-center gap-1 font-mono">
          <Command className="size-3" /> K
        </span>
      </div>
    </Dialog>
  );
}
