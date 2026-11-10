import { useEffect, useState, type ReactNode } from 'react';
import { BrandLogo, ThemeToggle, cn } from '@schichtplan/ui';
import { getOrganization } from '@schichtplan/shared';
import { AuthFooter, type AuthFooterProps } from './AuthFooter';

export interface AuthShellProps extends AuthFooterProps {
  children: ReactNode;
  contentClassName?: string;
}

/** Einheitlicher Rahmen für alle Login-Seiten (Kopf mit Logo, zentrierter Inhaltsbereich, Fusszeile) */
export function AuthShell({
  children,
  returnTo,
  landingHref,
  showBackLink,
  contentClassName,
}: AuthShellProps) {
  const [appName, setAppName] = useState('Cevi Schichtplan');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppName(getOrganization(window.location.host).name);
    }
  }, []);

  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      <div aria-hidden className="bg-campfire pointer-events-none fixed inset-x-0 top-0 h-[60vh] opacity-70" />

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <BrandLogo className="size-8" alt="" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">{appName}</span>
        </span>
        <ThemeToggle />
      </header>

      <main
        id="inhalt"
        className={cn(
          'relative mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center px-5 pb-16 pt-6 sm:pt-0',
          contentClassName
        )}
      >
        {children}
      </main>

      <AuthFooter returnTo={returnTo} landingHref={landingHref} showBackLink={showBackLink} />
    </div>
  );
}
