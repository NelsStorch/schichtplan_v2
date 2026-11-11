'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Database, Search, UsersRound } from 'lucide-react';
import type { DepartmentDirectoryItemDto, StufeRole, UserDto } from '@schichtplan/shared';
import { Button, Callout, BrandLogo, Input, ThemeToggle, cn, useOrganization } from '@schichtplan/ui';
import { cleanReturnTo, finalDestination } from '@/lib/destination';
import { AuthFooter } from '@/components/AuthFooter';

const NONE = 'NONE';

const ROLE_OPTIONS: { value: StufeRole | null; label: string }[] = [
  { value: null, label: 'Nein' },
  { value: 'TEILNEHMER', label: 'Teilnehmer*in' },
  { value: 'LEITUNG', label: 'Leitung' },
];

function DepartmentSetup() {
  const searchParams = useSearchParams();
  const returnTo = cleanReturnTo(searchParams.get('return_to'));

  // Verband der Domain, vom Server-Layout bereitgestellt (richtig schon beim ersten Rendern)
  const org = useOrganization();

  const [user, setUser] = useState<UserDto | null>(null);
  const [departments, setDepartments] = useState<DepartmentDirectoryItemDto[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [stufen, setStufen] = useState<Record<string, StufeRole>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
      if (meRes.status === 401) {
        window.location.href = `/?return_to=${encodeURIComponent(window.location.href)}`;
        return;
      }
      const me = (await meRes.json()) as UserDto;
      setUser(me);
      if (me.homeDepartment) setSelected(me.homeDepartment.id);
      else if (!me.needsDepartmentSetup) setSelected(NONE);
      setStufen(Object.fromEntries((me.stufen ?? []).map((s) => [s.stufeId, s.role])));

      const dirRes = await fetch('/api/departments/directory');
      setDepartments(dirRes.ok ? await dirRes.json() : []);
    })().catch(() => setError('Die Angaben konnten nicht geladen werden. Bitte lade die Seite neu.'));
  }, [returnTo]);

  const fromCeviDb = Boolean(user?.homeDepartmentFromCeviDb);
  const lockedStufen = useMemo(
    () => new Set((user?.stufen ?? []).filter((s) => s.source === 'CEVIDB').map((s) => s.stufeId)),
    [user]
  );
  const selectedDepartment = departments?.find((d) => d.id === selected) ?? null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = departments ?? [];
    return q ? list.filter((d) => d.name.toLowerCase().includes(q) || d.slug.includes(q)) : list;
  }, [departments, query]);

  const choose = (id: string) => {
    if (fromCeviDb) return;
    setSelected(id);
    if (id !== selected) setStufen({});
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const departmentId = selected === NONE ? null : selected;
      const res = await fetch('/api/auth/me/department', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId,
          stufen: departmentId
            ? Object.entries(stufen)
                .filter(([stufeId]) => selectedDepartment?.stufen.some((s) => s.id === stufeId))
                .map(([stufeId, role]) => ({ stufeId, role }))
            : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Speichern hat nicht geklappt.');
      window.location.href = finalDestination(returnTo, data as UserDto, org.dbType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern hat nicht geklappt.');
      setSaving(false);
    }
  };

  const loading = !user || !departments;
  const rootHost = typeof window === 'undefined' ? '' : window.location.hostname.replace(/^login\./, '');

  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      <div aria-hidden className="bg-campfire pointer-events-none fixed inset-x-0 top-0 h-[60vh] opacity-70" />

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <BrandLogo className="size-8" alt="" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">{org.name}</span>
        </span>
        <ThemeToggle />
      </header>

      <main id="inhalt" className="relative mx-auto w-full max-w-[30rem] flex-1 px-5 pb-16 pt-6 sm:pt-10">
        <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
          {user ? `Hallo ${user.nickname || user.ceviName || user.firstName}.` : `Deine ${org.unitTerm}`} Zu welcher {org.unitTerm} gehörst du?
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
          Manche Anlässe sind nur für eine {org.unitTerm} oder einzelne Stufen. Du kannst das später jederzeit ändern.
        </p>

        <div className="mt-8 space-y-6">
          {error && <Callout tone="danger">{error}</Callout>}

          {loading ? (
            <div className="space-y-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-field bg-surface-2" />
              ))}
            </div>
          ) : (
            <>
              {fromCeviDb && selectedDepartment ? (
                <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent/10 text-accent-ink">
                    <Database className="size-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">{selectedDepartment.name}</span>
                    <span className="block text-[13px] text-fg-subtle">Aus deinem {org.authProviderShort}-Profil übernommen</span>
                  </span>
                </div>
              ) : (
                <section aria-label={`${org.unitTerm} wählen`} className="space-y-3">
                  {departments.length > 6 && (
                    <div className="relative">
                      <Search
                        aria-hidden
                        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                      />
                      <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`${org.unitTerm} suchen`}
                        aria-label={`${org.unitTerm} suchen`}
                        className="pl-11"
                      />
                    </div>
                  )}
                  <ul
                    role="radiogroup"
                    className="max-h-[22rem] divide-y divide-line overflow-y-auto rounded-card border border-line bg-surface/70"
                  >
                    {visible.map((d) => (
                      <DepartmentOption
                        key={d.id}
                        selected={selected === d.id}
                        onSelect={() => choose(d.id)}
                        title={d.name}
                        subtitle={`${d.slug}.${rootHost}`}
                        logoUrl={d.logoUrl}
                      />
                    ))}
                    {visible.length === 0 && (
                      <li className="px-5 py-4 text-sm text-fg-subtle">Keine {org.unitTerm} gefunden.</li>
                    )}
                  </ul>
                  <ul role="radiogroup" className="overflow-hidden rounded-card border border-line bg-surface/70">
                    <DepartmentOption
                      selected={selected === NONE}
                      onSelect={() => choose(NONE)}
                      title={`Ich gehöre zu keiner ${org.unitTerm}`}
                      subtitle="Eltern, Ehemalige, Freund*innen und Gäste"
                      icon={<UsersRound className="size-[18px]" />}
                    />
                  </ul>
                </section>
              )}

              {selectedDepartment && selectedDepartment.stufen.length > 0 && (
                <section aria-labelledby="stufen-titel" className="animate-fade-in">
                  <h2 id="stufen-titel" className="text-sm font-semibold text-fg">
                    In welchen Stufen bist du dabei?
                  </h2>
                  <p className="mt-1 text-[13px] text-fg-subtle">Wähle alle, die passen. Keine ist auch in Ordnung.</p>
                  <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-surface/70">
                    {selectedDepartment.stufen.map((stufe) => {
                      const locked = lockedStufen.has(stufe.id);
                      const role = stufen[stufe.id] ?? null;
                      return (
                        <li key={stufe.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-fg">{stufe.name}</span>
                            {locked && <span className="block text-xs text-fg-subtle">aus Cevi.DB</span>}
                          </span>
                          <div
                            role="radiogroup"
                            aria-label={`Rolle in ${stufe.name}`}
                            className="flex rounded-full bg-surface-2 p-0.5"
                          >
                            {ROLE_OPTIONS.map((option) => {
                              const active = role === option.value;
                              return (
                                <button
                                  key={option.label}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  disabled={locked}
                                  onClick={() =>
                                    setStufen((prev) => {
                                      const next = { ...prev };
                                      if (option.value) next[stufe.id] = option.value;
                                      else delete next[stufe.id];
                                      return next;
                                    })
                                  }
                                  className={cn(
                                    'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                                    active ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                                    locked && 'cursor-not-allowed opacity-70'
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <Button size="lg" className="w-full" disabled={!selected} loading={saving} onClick={save}>
                Speichern und weiter
              </Button>
            </>
          )}
        </div>
      </main>

      <AuthFooter />
    </div>
  );
}

function DepartmentOption({
  selected,
  onSelect,
  title,
  subtitle,
  logoUrl,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  logoUrl?: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
          selected && 'bg-accent/8'
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-tile bg-surface-2 text-fg-muted">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-full object-cover" />
          ) : (
            (icon ?? <BrandLogo className="size-6" alt="" />)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-fg-subtle">{subtitle}</span>
        </span>
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border transition',
            selected ? 'border-accent bg-accent text-white' : 'border-line-strong'
          )}
        >
          {selected && <Check className="size-3" />}
        </span>
      </button>
    </li>
  );
}

export default function DepartmentSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <DepartmentSetup />
    </Suspense>
  );
}
