
import { ArrowLeft } from 'lucide-react';
import { helpUrl, privacyUrl, statusUrl } from '@schichtplan/shared/redirect';
import { useOrganization } from '@schichtplan/ui';

export interface AuthFooterProps {
  returnTo?: string | null;
  landingHref?: string;
  showBackLink?: boolean;
}

/** Fusszeile der Login-Unterseiten mit Status, Hilfe, Datenschutz und optionalem Zurück-Link */
export function AuthFooter({ returnTo, landingHref = '/', showBackLink = false }: AuthFooterProps = {}) {
  const backTarget = returnTo ?? landingHref;
  const org = useOrganization();
  const appName = org.name;

  return (
    <footer className="relative mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-fg-subtle sm:px-8">
      <span>
        &copy; {new Date().getFullYear()} {appName}
        {org.independentNotice && <> · {org.independentNotice}</>}
      </span>
      <div className="flex flex-wrap items-center gap-5">
        <a href={statusUrl('/', org.domain)} className="font-medium text-fg-muted transition hover:text-fg">
          Status
        </a>
        <a href={helpUrl('/start/anmelden/', org.domain)} className="font-medium text-fg-muted transition hover:text-fg">
          Hilfe zum Anmelden
        </a>
        <a href={privacyUrl(org.domain)} className="font-medium text-fg-muted transition hover:text-fg">
          Datenschutz
        </a>
        {showBackLink && (
          <a
            href={backTarget}
            className="inline-flex items-center gap-1.5 font-medium text-fg-muted transition hover:text-fg"
          >
            <ArrowLeft className="size-3.5" />
            Ohne Anmeldung zurück
          </a>
        )}
      </div>
    </footer>
  );
}
