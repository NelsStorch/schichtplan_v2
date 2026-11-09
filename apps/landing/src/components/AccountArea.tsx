'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, LogIn } from 'lucide-react';
import { getDepartmentUrl, getLandingUrl, getLoginUrl, type UserDto } from '@schichtplan/shared';
import { Avatar, buttonClasses } from '@schichtplan/ui';

/**
 * Die Landingpage wird auf dem Server gerendert. Nur die Teile, die von der angemeldeten Person abhängen
 * (Cookie gilt für alle Subdomains), laufen im Browser: so bleibt das JavaScript für die Startseite klein.
 */
const MeContext = createContext<UserDto | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<UserDto | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/** Kopfzeile: Name statt «Anmelden», sobald jemand angemeldet ist */
export function HeaderAccount() {
  const me = useContext(MeContext);

  if (!me) {
    return (
      <Link
        href="/login"
        className={buttonClasses({
          variant: 'primary',
          size: 'sm',
          className: 'gap-1.5 text-xs font-semibold px-3 sm:px-4',
        })}
      >
        <LogIn className="size-3.5" />
        <span>Anmelden</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {me.homeDepartment && (
        <a
          href={getDepartmentUrl(me.homeDepartment.slug)}
          className={buttonClasses({
            variant: 'secondary',
            size: 'sm',
            className: 'hidden sm:inline-flex text-xs font-semibold gap-1.5 px-3',
          })}
        >
          <span>{me.homeDepartment.name}</span>
          <ArrowRight className="size-3 text-fg-subtle" />
        </a>
      )}
      <Link
        href="/profil"
        className="flex items-center gap-1.5 sm:gap-2 rounded-full py-1 pl-1 pr-2.5 sm:pr-3 text-xs font-semibold text-fg transition hover:bg-surface-2"
        aria-label="Dein Profil und Schichten"
      >
        <Avatar name={me.ceviName || me.firstName} size="sm" highlight className="size-7 text-[10px]" />
        <span className="max-w-20 sm:max-w-28 truncate">{me.ceviName || me.firstName}</span>
      </Link>
    </div>
  );
}

/** Hauptknopf: zur eigenen Abteilung, zu den eigenen Schichten oder zum Login */
export function PrimaryCta({ loginLabel, className }: { loginLabel: string; className: string }) {
  const me = useContext(MeContext);
  const classes = buttonClasses({ variant: 'primary', size: 'md', className });

  if (me?.homeDepartment) {
    return (
      <a href={getDepartmentUrl(me.homeDepartment.slug)} className={classes}>
        <span>Zu deiner Abteilung ({me.homeDepartment.name})</span>
        <ArrowRight className="size-4" />
      </a>
    );
  }

  if (me) {
    return (
      <Link href="/profil" className={classes}>
        <span>Zu deinen Schichten ({me.ceviName || me.firstName})</span>
        <ArrowRight className="size-4" />
      </Link>
    );
  }

  return (
    <Link href="/login" className={classes}>
      <LogIn className="size-4" />
      <span>{loginLabel}</span>
    </Link>
  );
}

/** Abteilung anlegen passiert im Login-Portal (nur Abteilungsleitung mit Cevi.DB) */
export function CreateDepartmentButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = getLoginUrl(getLandingUrl(), '/abteilung-erstellen');
      }}
      className="font-semibold text-accent hover:underline inline-flex items-center gap-0.5"
    >
      Schichtplan für deine Abteilung einrichten <ArrowRight className="size-3" />
    </button>
  );
}
