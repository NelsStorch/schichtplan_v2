import type { ReactNode } from 'react';
import { CeviLogo, ThemeToggle } from '@schichtplan/ui';
import { AuthFooter } from './AuthFooter';

/** Rahmen der kleinen Login-Seiten (Kopf mit Logo, schmale Mitte) wie bei «Konto verknüpfen» */
export function AuthShell({ children }: { children: ReactNode }) {
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

      <main id="inhalt" className="relative mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center px-5 pb-16">
        {children}
      </main>

      <AuthFooter />
    </div>
  );
}
