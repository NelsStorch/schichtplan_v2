'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, Building2, Check, Copy, Share2 } from 'lucide-react';
import type { DepartmentCreationEligibilityDto, UserDto } from '@schichtplan/shared';
import { getDepartmentUrl } from '@schichtplan/shared/redirect';
import { type OrganizationConfig } from '@schichtplan/shared';
import { Button, Callout, BrandLogo, Field, Input, ThemeToggle, buttonClasses, useOrganization } from '@schichtplan/ui';
import { afterLogin, cleanReturnTo } from '@/lib/destination';
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

/** Verbandsname davor, ausser die Gruppe heisst schon so (z. B. «Cevi Region Zürich») */
const withOrgName = (groupName: string, org: OrganizationConfig) =>
  groupName.toLowerCase().startsWith(org.orgName.toLowerCase()) ? groupName : `${org.orgName} ${groupName}`;

/** Name der Ortsgruppe ohne Zusatz, z. B. «Illnau-Effretikon» -> Subdomain «illnau-effretikon» */
const suggestedName = (e: DepartmentCreationEligibilityDto, org: OrganizationConfig) => {
  if (org.slug === 'verein') return '';
  return e.ortsgruppeName ? withOrgName(e.ortsgruppeName, org) : e.leaderGroupName ? withOrgName(e.leaderGroupName, org) : '';
};

const slugFromName = (name: string, org: OrganizationConfig) =>
  slugify(name.replace(new RegExp(`^${org.orgName}\\s+`, 'i'), ''));

/**
 * Abteilung anlegen: erscheint nach dem Cevi.DB-Login einer Abteilungsleitung, deren Ortsgruppe
 * noch keinen Schichtplan hat. Die anlegende Person wird Hauptverantwortliche*r (Abteilungsleitung).
 */
function CreateDepartment() {
  const searchParams = useSearchParams();
  const returnTo = cleanReturnTo(searchParams.get('return_to'));

  // Verband der Domain, vom Server-Layout bereitgestellt (richtig schon beim ersten Rendern)
  const org = useOrganization();

  const [eligibility, setEligibility] = useState<DepartmentCreationEligibilityDto | null>(null);
  const [user, setUser] = useState<UserDto | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  // Leitet die Person mehrere Ebenen (z. B. Abteilung und Region): die gewählte Hitobito-Gruppe
  const [groupId, setGroupId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

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
      setGroupId(data.ortsgruppeId);
      const proposal = suggestedName(data, org);
      setName(proposal);
      setSlug(data.ortsgruppeName ? slugify(data.ortsgruppeName) : slugFromName(proposal, org));
    })().catch(() => setError('Die Angaben konnten nicht geladen werden. Bitte lade die Seite neu.'));
  }, [org]);

  // Ebenen ohne Schichtplan, unter denen die Person wählen kann (die unterste zuerst)
  const choices = (eligibility?.options ?? []).filter((o) => o.existingDepartment === null);
  const chosen = choices.find((o) => o.hitobitoGroupId === groupId) ?? null;
  const chosenName = chosen?.name ?? eligibility?.ortsgruppeName ?? null;

  const choose = (id: number) => {
    const option = choices.find((o) => o.hitobitoGroupId === id);
    if (!option) return;
    setGroupId(id);
    if (!nameTouched) setName(withOrgName(option.name, org));
    if (!slugTouched) setSlug(slugFromName(option.name, org));
  };

  /** «Später»: weiter wie nach einem normalen Login */
  const later = () => {
    window.location.href = afterLogin(user, returnTo, org.dbType);
  };

  const shareUrl = typeof window === 'undefined' ? '/abteilung-erstellen' : `${window.location.origin}/abteilung-erstellen`;
  const groupLabel = eligibility?.ortsgruppeName ? withOrgName(eligibility.ortsgruppeName, org) : `unsere ${org.unitTerm}`;
  const shareMessage = `Hey! Könntest du für ${groupLabel} kurz den Schichtplan auf ${org.name} einrichten? Als ${org.unitTerm}-Leitung in ${org.authProviderShort} geht das mit einem Klick:`;

  const copyForLeader = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(`${shareMessage} ${shareUrl}`);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 3000);
  };

  const shareWithLeader = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${org.name} für ${groupLabel} einrichten`,
          text: shareMessage,
          url: shareUrl,
        });
        return;
      } catch {
        // Abbruch des nativen Share-Dialogs ignorieren, bei Fehler auf Copy zurückfallen
      }
    }
    await copyForLeader();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/departments/cevidb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentName: name.trim(),
          slug,
          ...(org.slug !== 'verein' && groupId !== null ? { hitobitoGroupId: groupId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Anlegen hat nicht geklappt.');
      window.location.href = getDepartmentUrl(data.department.slug, '/', data.department?.organization ?? org.dbType);
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
          <BrandLogo className="size-8" alt="" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">{org.name}</span>
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
              {org.slug === 'verein'
                ? 'Neuen Verein anlegen'
                : choices.length > 1
                  ? 'Für welche Ebene willst du einen Schichtplan anlegen?'
                  : (chosenName ?? `Deine ${org.unitTerm}`) + ' hat noch keinen Schichtplan'}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
              {org.slug === 'verein'
                ? 'Lege jetzt einen Schichtplan für deinen Verein an. Du wirst automatisch Vereinsleitung und kannst weitere Mitglieder einladen sowie Helferlisten verwalten.'
                : `Du bist laut ${org.authProviderShort} Leitung${
                    eligibility.leaderGroupName ? ` (${eligibility.leaderGroupName})` : ''
                  }. Lege den Schichtplan für eure ${org.unitTerm} jetzt an. Alle aus eurer ${
                    org.unitTerm
                  }, die sich mit ${org.authProviderShort} anmelden, gehören automatisch dazu.`}
            </p>

            <div className="mt-8 space-y-5">
              {error && <Callout tone="danger">{error}</Callout>}
              {choices.length > 1 && (
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-[13px] font-semibold text-fg">Du leitest mehrere Ebenen</legend>
                  {choices.map((option) => (
                    <label
                      key={option.hitobitoGroupId}
                      className={`flex cursor-pointer items-center gap-3 rounded-field border px-4 py-3 transition-colors ${
                        option.hitobitoGroupId === groupId ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:bg-surface-2'
                      }`}
                    >
                      <input
                        type="radio"
                        name="ebene"
                        className="accent-[rgb(var(--accent))]"
                        checked={option.hitobitoGroupId === groupId}
                        onChange={() => choose(option.hitobitoGroupId)}
                      />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-fg">{option.name}</span>
                        {option.groupType && <span className="block text-[13px] text-fg-muted">{option.groupType}</span>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <Field label={org.slug === 'verein' ? 'Name des Vereins' : `Name der ${org.unitTerm}`} required>
                <Input
                  value={name}
                  onChange={(e) => {
                    setNameTouched(true);
                    setName(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value.replace(new RegExp(`^${org.orgName}\\s+`, 'i'), '')));
                  }}
                  minLength={2}
                  maxLength={80}
                  required
                />
              </Field>
              <Field
                label="Subdomain"
                required
                hint={`${slug || 'portal'}.${rootHost}. Lässt sich später nicht ändern.`}
              >
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
                  minLength={3}
                  maxLength={30}
                  className="font-mono"
                  required
                />
              </Field>

              <Callout tone="info">
                <p>
                  Du wirst Hauptverantwortliche*r ({org.unitTerm}-Leitung im Schichtplan). Das lässt sich später unter
                  «{org.unitTerm} → Personen» ändern. Name, Logo, Farbe und Stufen kannst du jederzeit anpassen, nur die
                  Subdomain bleibt fest.
                </p>
              </Callout>

              <Button type="submit" size="lg" className="w-full" loading={saving} disabled={name.trim().length < 2 || slug.length < 3}>
                {org.unitTerm} anlegen
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={later}>
                Später
              </Button>
            </div>
          </form>
        ) : (
          <div className="animate-fade-up space-y-6">
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              {org.unitTerm} anlegen
            </h1>
            {eligibility.reason === 'EXISTS' && eligibility.existingDepartment ? (
              <>
                <p className="text-[15px] leading-relaxed text-fg-muted">
                  Für eure {org.unitTerm} gibt es schon einen Schichtplan: {eligibility.existingDepartment.name}.
                </p>
                <a
                  href={getDepartmentUrl(eligibility.existingDepartment.slug)}
                  className={buttonClasses({ size: 'lg', className: 'w-full justify-between' })}
                >
                  Zu {eligibility.existingDepartment.name} <ArrowUpRight />
                </a>
              </>
            ) : eligibility.reason === 'LIMIT' ? (
              <p className="text-[15px] leading-relaxed text-fg-muted">
                Du leitest bereits 3 Vereine. Für einen weiteren Verein melde dich bitte beim Support.
              </p>
            ) : eligibility.reason === 'NOT_CEVIDB' ? (
              org.slug === 'verein' ? (
                <>
                  <p className="text-[15px] leading-relaxed text-fg-muted">
                    Einen neuen Verein kann nur eine angemeldete Person mit E-Mail-Adresse und Passwort anlegen.
                  </p>
                  <a
                    href={`/?return_to=${encodeURIComponent(
                      typeof window === 'undefined' ? '' : window.location.href
                    )}`}
                    className={buttonClasses({ size: 'lg', className: 'w-full justify-between' })}
                  >
                    Anmelden oder Registrieren <ArrowUpRight />
                  </a>
                </>
              ) : (
                <>
                  <p className="text-[15px] leading-relaxed text-fg-muted">
                    Eine neue {org.unitTerm} kann nur die Leitung anlegen. Melde dich dazu mit {org.authProviderShort} an, dort
                    sehen wir deine Rolle und eure Gruppe.
                  </p>
                  <a
                    href={`/api/auth/cevidb/login?returnTo=${encodeURIComponent(
                      typeof window === 'undefined' ? '' : window.location.href
                    )}&org=${encodeURIComponent(org.slug)}`}
                    className={buttonClasses({ size: 'lg', className: 'w-full justify-between' })}
                  >
                    Mit {org.authProviderShort} anmelden <ArrowUpRight />
                  </a>
                </>
              )
            ) : eligibility.reason === 'UNVERIFIED' ? (
              <p className="text-[15px] leading-relaxed text-fg-muted">
                Wir konnten deine Gruppe in {org.authProviderShort} gerade nicht prüfen. Melde dich bitte nochmals mit {org.authProviderShort} an.
              </p>
            ) : eligibility.reason === 'NO_ORTSGRUPPE' ? (
              <p className="text-[15px] leading-relaxed text-fg-muted">
                In {org.authProviderShort} ist für dich keine Gruppe hinterlegt. Melde dich bei der Mitgliederverwaltung eurer {org.unitTerm}.
              </p>
            ) : (
              <div className="space-y-5">
                <Callout
                  tone="info"
                  title={
                    org.slug === 'verein'
                      ? 'Verein anlegen'
                      : eligibility.ortsgruppeName
                        ? `${withOrgName(eligibility.ortsgruppeName, org)} hat noch keinen Schichtplan`
                        : `Nur für die ${org.unitTerm}-Leitung`
                  }
                >
                  {org.slug === 'verein' ? (
                    <p className="text-[14px] leading-relaxed">
                      Um einen neuen Verein anzulegen, melde dich bitte mit deinem E-Mail- und Passwort-Konto an.
                    </p>
                  ) : (
                    <>
                      <p className="text-[14px] leading-relaxed">
                        Du bist selbst nicht als {org.unitTerm}-Leitung in {org.authProviderShort} eingetragen – deshalb kannst du die {org.unitTerm} nicht direkt selbst eröffnen.
                      </p>
                      <p className="mt-2 text-[14px] leading-relaxed">
                        <strong>So klappt es trotzdem sofort:</strong> Schicke deiner {org.unitTerm}-Leitung den Einrichtungslink. Sobald sie den Schichtplan mit einem Klick angelegt hat, kann sie dir unter <em>{org.unitTerm} → Personen</em> das Recht <strong>Anlässe erstellen</strong> geben.
                      </p>
                    </>
                  )}
                </Callout>

                {org.slug !== 'verein' && (
                  <div className="space-y-2.5">
                    <Button type="button" size="lg" className="w-full" onClick={shareWithLeader}>
                      <Share2 className="size-4" />
                      <span>An {org.unitTerm}-Leitung senden</span>
                    </Button>
                    <Button type="button" variant="secondary" size="md" className="w-full" onClick={copyForLeader}>
                      {copiedShare ? <Check className="size-4" /> : <Copy className="size-4" />}
                      <span>{copiedShare ? 'Nachricht & Link kopiert!' : 'Nachricht & Link kopieren'}</span>
                    </Button>
                  </div>
                )}
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
