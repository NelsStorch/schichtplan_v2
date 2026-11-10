'use client';

import { Building2, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { getOrganization, helpUrl } from '@schichtplan/shared';
import { Callout, buttonClasses } from '@schichtplan/ui';
import { departmentSetupUrl, useLoginHref } from '@/lib/api';
import type { EventDetails } from '@/lib/types';

/** Zeigt, ob und warum man sich (nicht) eintragen kann, mit dem passenden nächsten Schritt. */
export function AccessNotice({ event, loggedIn }: { event: EventDetails; loggedIn: boolean }) {
  const loginHref = useLoginHref();
  const org = getOrganization(typeof window !== 'undefined' ? window.location.host : 'cevi-schichtplan.ch');
  const { access } = event.viewer;

  if (access.via === 'MANAGER' || access.via === 'RULES' || access.via === 'LINK') return null;

  const linkHint = 'Hast du vom OK einen persönlichen Link bekommen? Öffne ihn, dann geht es.';

  switch (access.reason) {
    case 'LOGIN_REQUIRED':
      return (
        <Callout tone="info" title="Zum Eintragen anmelden">
          <p>Ein {org.nicknameTerm} ohne Passwort reicht.</p>
          <a href={loginHref} className={buttonClasses({ size: 'sm', className: 'mt-3' })}>
            <LogIn /> Anmelden
          </a>
        </Callout>
      );
    case 'NO_DEPARTMENT':
      return (
        <Callout tone="warning" title={`Gib zuerst deine ${org.unitTerm} an`}>
          <p>Dieser Anlass ist für {event.audience}.</p>
          <a href={departmentSetupUrl()} className={buttonClasses({ size: 'sm', className: 'mt-3' })}>
            <Building2 /> {org.unitTerm} angeben
          </a>
        </Callout>
      );
    case 'CEVIDB_REQUIRED':
      return (
        <Callout tone="warning" title={`Nur mit ${org.authProviderShort || 'Verbands'}-Login`}>
          <p>{access.message}</p>
          <a href={loginHref} className={buttonClasses({ size: 'sm', className: 'mt-3' })}>
            <ShieldCheck /> Mit {org.authProviderShort || 'Verband'} anmelden
          </a>
        </Callout>
      );
    case 'SIGNUP_CLOSED':
      return <Callout tone="info" title="Eintragen geschlossen">{access.message}</Callout>;
    case 'SIGNUP_NOT_YET_OPEN':
      return (
        <Callout tone="info" title="Anmeldung noch nicht geöffnet">
          <p>{access.message}</p>
          <p className="mt-1 text-xs text-fg-muted">
            Du kannst dir die Schichten und Arbeiten bereits in der Vorschau ansehen.
          </p>
        </Callout>
      );
    default:
      return (
        <Callout tone="info" title="Für dich nicht freigeschaltet">
          <p>{access.message}</p>
          <p className="mt-2 flex items-start gap-1.5 text-xs">
            <KeyRound className="mt-0.5 size-3.5 shrink-0" /> {linkHint}
          </p>
          <a
            href={helpUrl('/helfen/nicht-freigeschaltet/')}
            className="mt-2 inline-block text-xs font-semibold underline-offset-2 hover:underline"
          >
            Warum? Alle Gründe erklärt
          </a>
          {loggedIn && access.reason !== 'LEADERS_ONLY' && (
            <a
              href={departmentSetupUrl()}
              className={buttonClasses({ size: 'sm', variant: 'secondary', className: 'mt-3' })}
            >
              <Building2 /> Abteilung oder Stufe ändern
            </a>
          )}
        </Callout>
      );
  }
}
