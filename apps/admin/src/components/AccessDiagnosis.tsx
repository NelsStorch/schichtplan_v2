'use client';

import { useEffect, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { Badge, Button, Callout, Skeleton, type BadgeTone } from '@schichtplan/ui';
import {
  getVocabulary,
  type AdminUserAccessDiagnosisDto,
  type DepartmentCreationEligibilityDto,
  type HitobitoRoleKindDto,
} from '@schichtplan/shared';
import { api, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';

type Vocabulary = ReturnType<typeof getVocabulary>;

function kindLabel(kind: HitobitoRoleKindDto, vocab: Vocabulary): { label: string; tone: BadgeTone } {
  switch (kind) {
    case 'DEPARTMENT_LEADER':
      return { label: vocab.departmentLeader, tone: 'accent' };
    case 'LEITUNG':
      return { label: vocab.groupLeader, tone: 'success' };
    case 'TEILNEHMER':
      return { label: `${vocab.group}: Teilnehmer*in`, tone: 'neutral' };
    case 'ANDERE':
      return { label: `${vocab.group}: andere Rolle`, tone: 'neutral' };
    default:
      return { label: 'nicht ausgewertet', tone: 'outline' };
  }
}

/** Ergebnis der Prüfung «Abteilung anlegen» in Worten, mit dem wahrscheinlichen nächsten Schritt */
function creationVerdict(
  c: DepartmentCreationEligibilityDto,
  vocab: Vocabulary
): { tone: 'success' | 'warning' | 'info'; text: string } {
  const where = c.ortsgruppeName ? ` für «${c.ortsgruppeName}»` : '';
  switch (c.reason) {
    case null:
      return { tone: 'success', text: `Darf eine ${vocab.department}${where} anlegen.` };
    case 'NOT_CEVIDB':
      return {
        tone: 'info',
        text: `Kein ${vocab.authProvider}-Login für diesen Verband. Anlegen geht nur mit einem Konto aus ${vocab.authProvider}.`,
      };
    case 'NOT_LEADER':
      return {
        tone: 'warning',
        text: `Keine Rolle zählt als ${vocab.departmentLeader}. Entweder fehlt die Rolle in ${vocab.authProvider}, oder ihr Rollentyp ist nicht als Leitung konfiguriert (siehe Rollen unten, «nicht ausgewertet»).`,
      };
    case 'UNVERIFIED':
      return {
        tone: 'warning',
        text: `Leitungsrolle vorhanden${c.leaderGroupName ? ` («${c.leaderGroupName}»)` : ''}, aber ihre Gruppe fehlt in der Gruppenstruktur. Meist hilft es, sich neu anzumelden (Gruppen-API, Scope «groups»).`,
      };
    case 'NO_ORTSGRUPPE':
      return {
        tone: 'warning',
        text: `Die Gruppe der Leitungsrolle hängt an keiner bekannten übergeordneten ${vocab.department}, oder deren Struktur ist unvollständig.`,
      };
    case 'EXISTS':
      return {
        tone: 'info',
        text: `Für die eigene Gruppe gibt es schon einen Schichtplan${c.existingDepartment ? `: «${c.existingDepartment.name}» (${c.existingDepartment.slug})` : ''}.`,
      };
    case 'LIMIT':
      return { tone: 'info', text: 'Leitet schon die maximale Zahl an Vereinen.' };
  }
}

/**
 * Berechtigungs-Diagnose: Rollen aus Hitobito vom letzten Login und was der Schichtplan daraus ableitet.
 * Wird erst auf Knopfdruck geladen (Rollen sind Personendaten und nur zur Fehlersuche gedacht).
 */
export function AccessDiagnosis({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AdminUserAccessDiagnosisDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bei einer anderen Person setzt der Aufrufer `key={userId}`: dann beginnt alles wieder zugeklappt
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(null);
    api<AdminUserAccessDiagnosisDto>(`/api/admin/users/${encodeURIComponent(userId)}/access-diagnosis`, {
      signal: controller.signal,
    })
      .then(setData)
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [open, userId]);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Stethoscope className="size-3.5" aria-hidden />
          Diagnose anzeigen
        </Button>
        <span className="text-xs text-fg-subtle">
          Rollen aus der Verbands-Datenbank und warum die Person etwas darf oder nicht.
        </span>
      </div>
    );
  }

  if (error) return <Callout tone="danger">{error}</Callout>;
  if (!data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const vocab = getVocabulary(data.provider);
  const verdict = creationVerdict(data.departmentCreation, vocab);

  return (
    <div className="space-y-4">
      <Callout tone={verdict.tone} title={`${vocab.department} anlegen`}>
        <p className="text-sm">{verdict.text}</p>
        {data.departmentCreation.options && data.departmentCreation.options.length > 1 && (
          <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
            {data.departmentCreation.options.map((o) => (
              <li key={o.hitobitoGroupId}>
                {o.name} {o.groupType && <span>({o.groupType})</span>}
                {o.existingDepartment ? ` – hat schon «${o.existingDepartment.name}»` : ' – frei'}
              </li>
            ))}
          </ul>
        )}
      </Callout>

      <div>
        <p className="mb-2 text-xs text-fg-subtle">
          {data.hasProvider
            ? `Rollen in ${vocab.authProvider}${data.syncedAt ? `, Stand letzter Login ${formatDateTime(data.syncedAt)}` : ''}. Die Auswertung nutzt die aktuelle Konfiguration.`
            : `Kein Login über ${vocab.authProvider}: keine Rollen.`}
        </p>
        {data.roles === null ? (
          <p className="text-sm text-fg-muted">
            Noch kein Stand gespeichert. Die Rollen werden beim nächsten Login der Person übernommen.
          </p>
        ) : data.roles.length === 0 ? (
          data.hasProvider ? <p className="text-sm text-fg-muted">Keine Rollen.</p> : null
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
            {data.roles.map((r) => {
              const kind = kindLabel(r.kind, vocab);
              return (
                <li key={`${r.roleClass}-${r.groupId ?? ''}`} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-fg">{r.roleName ?? r.roleClass}</span>
                    <Badge tone={kind.tone}>{kind.label}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-muted">
                    <span>
                      {r.groupName ?? 'ohne Gruppe'}
                      {r.groupId !== null && <span className="ml-1 font-mono tabular">(ID {r.groupId})</span>}
                    </span>
                    {r.groupId !== null && !r.group && <span className="text-warning-ink">Gruppe nicht in der Gruppenstruktur</span>}
                    {r.group?.groupType && <span>{r.group.groupType}</span>}
                    {r.departments.length > 0 && <span>→ {r.departments.map((d) => d.name).join(', ')}</span>}
                  </div>
                  <div className="mt-0.5 break-all font-mono text-2xs text-fg-subtle">{r.roleClass}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {data.memberships.some((m) => m.role === 'ADMIN') && (
        <div>
          <p className="mb-1 text-xs text-fg-subtle">Herkunft der {vocab.departmentLeader}</p>
          <ul className="space-y-0.5 text-sm">
            {data.memberships
              .filter((m) => m.role === 'ADMIN')
              .map((m) => (
                <li key={m.departmentSlug} className="flex flex-wrap items-baseline gap-2">
                  <span>{m.departmentName}</span>
                  <span className="text-xs text-fg-muted">
                    {m.leaderSource === 'CEVIDB'
                      ? `aus ${vocab.authProvider} (wird beim Login entzogen, wenn die Rolle fehlt)`
                      : m.leaderSource === 'MANUAL'
                        ? 'im Admin-Portal gesetzt'
                        : 'Herkunft unbekannt (älterer Eintrag)'}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
