import { Database, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { Badge } from '@schichtplan/ui';
import type { LoginMethod } from '@schichtplan/shared';
import { methodLabels } from '../lib/format';

const icons: Record<LoginMethod, React.ReactNode> = {
  CEVIDB: <Database aria-hidden />,
  PASSWORD: <KeyRound aria-hidden />,
  CEVINAME: <UserRound aria-hidden />,
};

/** Anmeldearten als neutrale Badges, globale Admins als einziger Farbakzent. */
export function LoginMethodBadges({ methods, isAdmin }: { methods: LoginMethod[]; isAdmin?: boolean }) {
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
          {methodLabels[method]}
        </Badge>
      ))}
    </span>
  );
}
