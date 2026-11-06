'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  CalendarDays,
  ChartColumn,
  Command,
  Copy,
  ExternalLink,
  FileCode,
  History,
  LayoutDashboard,
  Mail,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Avatar, Badge, Dialog, cn, useToast } from '@schichtplan/ui';
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
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchedUsers, setSearchedUsers] = useState<AdminUserListItemDto[]>([]);
  const [searchedEvents, setSearchedEvents] = useState<AdminEventListItemDto[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const copyToClipboard = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${title} kopiert`, tone: 'success' });
    } catch {
      toast({ title: 'Kopieren fehlgeschlagen', tone: 'error' });
    }
  };

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

  // Navigation & System Items
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
    {
      id: 'action-api-docs',
      label: 'Admin-API Dokumentation öffnen (Scalar)',
      icon: <FileCode />,
      action: () => window.open('/docs', '_blank'),
    },
    {
      id: 'action-system-status',
      label: 'System-Status prüfen',
      icon: <ExternalLink />,
      action: () => window.open('https://status.cevi-schichtplan.ch', '_blank'),
    },
    {
      id: 'action-copy-slugs',
      label: 'Alle Abteilungs-Subdomains kopieren',
      icon: <Copy />,
      action: () => {
        const text = departments.map((d) => `${d.slug}.cevi-schichtplan.ch`).join('\n');
        copyToClipboard(text, `${departments.length} Subdomains`);
      },
    },
  ].filter((item) => !q || item.label.toLowerCase().includes(q));

  // Matched Departments
  const matchedDepartments = departments
    .filter((d) => !q || d.name.toLowerCase().includes(q) || d.slug.includes(q))
    .slice(0, 6);

  interface FlatItem {
    id: string;
    category: string;
    render: (isSelected: boolean) => React.ReactNode;
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
    ...matchedDepartments.map((d) => {
      const deptUrl = `https://${d.slug}.cevi-schichtplan.ch`;
      return {
        id: `dept-${d.id}`,
        category: 'Abteilungen',
        render: (isSelected: boolean) => (
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2.5 min-w-0">
              <Building2 className="size-4 shrink-0 text-accent-ink" />
              <span className="truncate font-semibold text-fg">{d.name}</span>
              <span className="truncate font-mono text-xs text-fg-subtle">{d.slug}</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge tone="outline" className="text-2xs shrink-0">
                {d.upcomingEventCount} kommend
              </Badge>
              {isSelected && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Portal im neuen Tab öffnen"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(deptUrl, '_blank');
                    }}
                    className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-accent-ink"
                  >
                    <ExternalLink className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title="URL kopieren"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(deptUrl, 'Portal-URL');
                    }}
                    className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          </span>
        ),
        action: () => {
          onOpenDepartment(d.id);
          onClose();
        },
      };
    }),
    ...searchedUsers.map((u) => ({
      id: `user-${u.id}`,
      category: 'Personen',
      render: (isSelected: boolean) => (
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2.5 min-w-0">
            <Avatar name={fullName(u)} size="sm" />
            <span className="truncate font-semibold text-fg">{fullName(u)}</span>
            {u.email && <span className="truncate text-xs text-fg-subtle">{u.email}</span>}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge tone="outline" className="text-2xs shrink-0">
              {u.memberships[0]?.departmentName ?? u.homeDepartmentName ?? 'Konto'}
            </Badge>
            {isSelected && u.email && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="E-Mail schreiben"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.location.href = `mailto:${u.email}`;
                  }}
                  className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-accent-ink"
                >
                  <Mail className="size-3.5" />
                </button>
                <button
                  type="button"
                  title="E-Mail kopieren"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(u.email!, 'E-Mail');
                  }}
                  className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
            )}
          </div>
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
      render: (isSelected: boolean) => (
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2.5 min-w-0">
            <CalendarDays className="size-4 shrink-0 text-accent-ink" />
            <span className="truncate font-semibold text-fg">{e.title}</span>
            <span className="truncate text-xs text-fg-subtle">{e.departmentName}</span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge tone="outline" className="text-2xs shrink-0">
              {e.slotCount ? `${e.signupCount}/${e.slotCount}` : 'Anlass'}
            </Badge>
            {isSelected && (
              <button
                type="button"
                title="Titel kopieren"
                onClick={(e_click) => {
                  e_click.stopPropagation();
                  copyToClipboard(e.title, 'Anlass-Titel');
                }}
                className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg"
              >
                <Copy className="size-3.5" />
              </button>
            )}
          </div>
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
                    <div className="min-w-0 flex-1">{item.render(isSelected)}</div>
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
