import { Database, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { Badge } from '@schichtplan/ui';
import type { LoginMethod, OrganizationType } from '@schichtplan/shared';
import { methodLabels } from '../lib/format';
import { providerLabel } from '../lib/organizations';

const icons: Record<LoginMethod, React.ReactNode> = {
  CEVIDB: <Database aria-hidden />,
  PASSWORD: <KeyRound aria-hidden />,
  CEVINAME: <UserRound aria-hidden />,
};

/**
 * Anmeldearten als neutrale Badges, globale Admins als einziger Farbakzent.
 * Mit `provider` steht beim Hitobito-Konto die Datenbank des Verbands (Cevi.DB, PBS MiData, Jubla-DB).
 */
export function LoginMethodBadges({
  methods,
  isAdmin,
  provider,
}: {
  methods: LoginMethod[];
  isAdmin?: boolean;
  provider?: OrganizationType | null;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {isAdmin && (
        <Badge tone="accent">
          <ShieldCheck aria-hidden />
          Admin
        </Badge>
      )}
      {methods.map((method) => (
        <Badge key={method}>
          {icons[method]}
          {method === 'CEVIDB' && provider ? (providerLabel(provider) ?? methodLabels[method]) : methodLabels[method]}
        </Badge>
      ))}
    </span>
  );
}
