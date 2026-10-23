'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Avatar, Input, cn } from '@schichtplan/ui';
import type { AdminUserListDto, AdminUserListItemDto } from '@schichtplan/shared';
import { api } from '../lib/api';
import { fullName } from '../lib/format';
import { LoginMethodBadges } from './LoginMethodBadges';

/** Person über alle Konten suchen und auswählen (Name, Cevi-Name, E-Mail, Cevi.DB-ID). */
export function PersonPicker({
  value,
  onChange,
  placeholder = 'Name, Cevi-Name oder E-Mail',
  disabledIds = [],
}: {
  value: AdminUserListItemDto | null;
  onChange: (user: AdminUserListItemDto | null) => void;
  placeholder?: string;
  disabledIds?: string[];
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminUserListItemDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      api<AdminUserListDto>(`/api/admin/users?q=${encodeURIComponent(q)}&pageSize=8&sort=name`, {
        signal: controller.signal,
      })
        .then((r) => setResults(r.items))
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-field border border-line bg-surface-2 px-3 py-2.5">
        <Avatar name={fullName(value)} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{fullName(value)}</span>
          <span className="block truncate text-xs text-fg-subtle">{value.email ?? value.ceviName ?? ''}</span>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Auswahl entfernen"
          className="flex size-8 items-center justify-center rounded-full text-fg-subtle transition hover:bg-surface-3 hover:text-fg"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          aria-label="Person suchen"
          autoComplete="off"
          className="pl-10"
        />
      </div>
      {search.trim().length >= 2 && (
        <ul
          className={cn(
            'mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-card border border-line transition-opacity',
            loading && 'opacity-60'
          )}
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-fg-subtle">{loading ? 'Suche läuft …' : 'Niemand gefunden'}</li>
          ) : (
            results.map((user) => {
              const disabled = disabledIds.includes(user.id);
              return (
                <li key={user.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(user);
                      setSearch('');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Avatar name={fullName(user)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">
                        {fullName(user)}
                        {user.ceviName && user.ceviName !== user.firstName && (
                          <span className="font-normal text-fg-muted"> · {user.ceviName}</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {disabled ? 'Bereits zugeordnet' : (user.email ?? '–')}
                      </span>
                    </span>
                    <LoginMethodBadges methods={user.loginMethods} />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
