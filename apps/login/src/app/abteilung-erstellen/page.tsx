'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, Building2 } from 'lucide-react';
import type { DepartmentCreationEligibilityDto, UserDto } from '@schichtplan/shared';
import { getDepartmentUrl } from '@schichtplan/shared/redirect';
import { Button, Callout, CeviLogo, Field, Input, ThemeToggle, buttonClasses } from '@schichtplan/ui';
import { cleanReturnTo, finalDestination, withReturnTo } from '@/lib/destination';
import { AuthFooter } from '@/components/AuthFooter';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

/** Name der Ortsgruppe ohne Zusatz, z. B. «Illnau-Effretikon» -> Subdomain «illnau-effretikon» */
const suggestedName = (e: DepartmentCreationEligibilityDto) =>
  e.ortsgruppeName ? `Cevi ${e.ortsgruppeName}` : e.leaderGroupName ? `Cevi ${e.leaderGroupName}` : '';

/**
 * Abteilung anlegen: erscheint nach dem Cevi.DB-Login einer Abteilungsleitung, deren Ortsgruppe
 * noch keinen Schichtplan hat. Die anlegende Person wird Hauptverantwortliche*r (Abteilungsleitung).
 */
function CreateDepartment() {
  const searchParams = useSearchParams();
  const returnTo = cleanReturnTo(searchParams.get('return_to'));

  const [eligibility, setEligibility] = useState<DepartmentCreationEligibilityDto | null>(null);
  const [user, setUser] = useState<UserDto | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
      if (meRes.status === 401) {
        window.location.href = `/?return_to=${encodeURIComponent(window.location.href)}`;
        return;
      }
      setUser((await meRes.json()) as UserDto);
      const res = await fetch('/api/departments/creation-eligibility', { cache: 'no-store' });
      const data = (await res.json()) as DepartmentCreationEligibilityDto;
      setEligibility(data);
      const proposal = suggestedName(data);
      setName(proposal);
      setSlug(slugify(data.ortsgruppeName ?? proposal.replace(/^Cevi /, '')));
    })().catch(() => setError('Die Angaben konnten nicht geladen werden. Bitte lade die Seite neu.'));
  }, []);

  /** «Später»: weiter wie nach einem normalen Login */
  const later = () => {
    window.location.href = user?.needsDepartmentSetup
      ? withReturnTo('/abteilung', returnTo)
      : finalDestination(returnTo, user);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/departments/cevidb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentName: name.trim(), slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Anlegen hat nicht geklappt.');
      window.location.href = getDepartmentUrl(data.department.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anlegen hat nicht geklappt.');
      setSaving(false);
    }
  };

  const rootHost = typeof window === 'undefined' ? '' : window.location.hostname.replace(/^login\./, '');

  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      <div aria-hidden className="bg-campfire pointer-events-none fixed inset-x-0 top-0 h-[60vh] opacity-70" />

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <CeviLogo className="size-8" alt="" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Cevi Schichtplan</span>
        </span>
        <ThemeToggle />
      </header>

      <main id="inhalt" className="relative mx-auto w-full max-w-[30rem] flex-1 px-5 pb-16 pt-6 sm:pt-10">
        {!eligibility ? (
          error ? (
            <Callout tone="danger">{error}</Callout>
          ) : (
            <div className="space-y-3" aria-busy>
              <div className="h-10 w-3/4 animate-pulse rounded-field bg-surface-2" />
              <div className="h-40 animate-pulse rounded-card bg-surface-2" />
            </div>
          )
        ) : eligibility.eligible ? (
          <form onSubmit={submit} className="animate-fade-up">
            <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
              <Building2 className="size-6" />
            </span>
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
              {eligibility.ortsgruppeName ?? 'Deine Abteilung'} hat noch keinen Schichtplan
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
              Du bist laut Cevi.DB Abteilungsleitung
              {eligibility.leaderGroupName ? ` (${eligibility.leaderGroupName})` : ''}. Lege den Schichtplan für eure
              Abteilung jetzt an. Alle aus eurer Ortsgruppe, die sich mit Cevi.DB anmelden, gehören automatisch dazu.
            </p>

            <div className="mt-8 space-y-5">
              {error && <Callout tone="danger">{error}</Callout>}
              <Field label="Name der Abteilung" required>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value.replace(/^Cevi\s+/i, '')));
                  }}
                  minLength={2}
                  maxLength={80}
                  required
                />
              </Field>
              <Field
                label="Subdomain"
                required
                hint={`${slug || 'abteilung'}.${rootHost}. Lässt sich später nicht ändern.`}
              >
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                  minLength={3}
                  maxLength={30}
                  className="font-mono"
                  required
                />
              </Field>

              <Callout tone="info">
                <p>
                  Du wirst Hauptverantwortliche*r (Abteilungsleitung im Schichtplan). Das lässt sich später unter
                  «Abteilung → Personen» ändern. Name, Logo, Farbe und Stufen kannst du jederzeit anpassen, nur die
                  Subdomain bleibt fest.
                </p>
              </Callout>

              <Button type="submit" size="lg" className="w-full" loading={saving} disabled={name.trim().length < 2 || slug.length < 3}>
                Abteilung anlegen
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={later}>
                Später
              </Button>
            </div>
          </form>
        ) : (
          <div className="animate-fade-up space-y-6">
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              Abteilung anlegen
            </h1>
            {eligibility.reason === 'EXISTS' && eligibility.existingDepartment ? (
              <>
                <p className="text-[15px] leading-relaxed text-fg-muted">
                  Für deine Ortsgruppe gibt es schon einen Schichtplan: {eligibility.existingDepartment.name}.
                </p>
                <a
                  href={getDepartmentUrl(eligibility.existingDepartment.slug)}
                  className={buttonClasses({ size: 'lg', className: 'w-full justify-between' })}
                >
                  Zu {eligibility.existingDepartment.name} <ArrowUpRight />
                </a>
              </>
            ) : eligibility.reason === 'NOT_CEVIDB' ? (
              <>
                <p className="text-[15px] leading-relaxed text-fg-muted">
                  Eine neue Abteilung kann nur die Abteilungsleitung anlegen. Melde dich dazu mit Cevi.DB an, dort
                  sehen wir deine Rolle und eure Ortsgruppe.
                </p>
                <a
                  href={`/api/auth/cevidb/login?returnTo=${encodeURIComponent(
                    typeof window === 'undefined' ? '' : window.location.href
                  )}`}
                  className={buttonClasses({ size: 'lg', className: 'w-full justify-between' })}
                >
                  Mit Cevi.DB anmelden <ArrowUpRight />
                </a>
              </>
            ) : eligibility.reason === 'NO_ORTSGRUPPE' ? (
              <p className="text-[15px] leading-relaxed text-fg-muted">
                In Cevi.DB ist für dich keine Ortsgruppe hinterlegt. Melde dich bei der Cevi.DB-Verwaltung eurer Abteilung.
              </p>
            ) : (
              <div className="space-y-4">
                <Callout tone="info" title="Nur für die Abteilungsleitung">
                  <p className="text-[14px] leading-relaxed">
                    Einen neuen Schichtplan für eine Abteilung kann nur die Abteilungsleitung anlegen (offizielle Rolle «Abteilungsleiter*in» in Cevi.DB).
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed">
                    <strong>Was du tun kannst:</strong> Bitte eure Abteilungsleitung, den Schichtplan einmalig anzulegen. Danach kann sie dir unter <em>Abteilung → Personen</em> die Rolle <strong>Planung</strong> geben, damit du selbstständig Events erstellen kannst – oder sie erstellt den Anlass direkt für dich.
                  </p>
                </Callout>
              </div>
            )}
            <Button variant="ghost" className="w-full" onClick={later}>
              Weiter
            </Button>
          </div>
        )}
      </main>

      <AuthFooter />
    </div>
  );
}

export default function CreateDepartmentPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <CreateDepartment />
    </Suspense>
  );
}
