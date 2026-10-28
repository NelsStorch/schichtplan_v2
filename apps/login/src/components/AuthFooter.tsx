import { PRIVACY_URL, helpUrl, statusUrl } from '@schichtplan/shared/redirect';

/** Fusszeile der Login-Unterseiten mit Hilfe und Datenschutz */
export function AuthFooter() {
  return (
    <footer className="relative mx-auto flex w-full max-w-5xl items-center justify-end gap-5 px-5 py-6 text-xs text-fg-subtle sm:px-8">
      <a href={helpUrl('/start/anmelden/')} className="font-medium text-fg-muted transition hover:text-fg">
        Hilfe
      </a>
      <a href={statusUrl()} className="font-medium text-fg-muted transition hover:text-fg">
        Status
      </a>
      <a href={PRIVACY_URL} className="font-medium text-fg-muted transition hover:text-fg">
        Datenschutz
      </a>
    </footer>
  );
}
