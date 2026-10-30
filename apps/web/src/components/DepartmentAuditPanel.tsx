'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEPARTMENT_PERMISSIONS, isDepartmentPermission, type DepartmentAuditEntryDto } from '@schichtplan/shared';
import { Button, EmptyState, Skeleton, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtShortDate } from '@/lib/format';

const ACTION_LABELS: Record<string, string> = {
  PERMISSIONS_SET: 'Rechte geändert',
  LEADER_GRANT: 'Abteilungsleitung erhalten',
  LEADER_REVOKE: 'Abteilungsleitung entzogen',
  STUFEN_SET: 'Stufen geändert',
  MEMBER_REMOVE: 'Aus der Abteilung entfernt',
  MEMBER_CONFIRM: 'Zugehörigkeit bestätigt',
  MEMBER_UNCONFIRM: 'Bestätigung aufgehoben',
};

const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);
const permLabel = (p: string) => (isDepartmentPermission(p) ? DEPARTMENT_PERMISSIONS[p].label : p);
const time = (iso: string) =>
  new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }).format(new Date(iso));

/** Was sich geändert hat, in Worten: «+ Anlässe erstellen · − Anlässe löschen» */
function changeText(entry: DepartmentAuditEntryDto): string | null {
  const d = entry.details ?? {};
  if (entry.action === 'PERMISSIONS_SET' || entry.action === 'STUFEN_SET') {
    const before = list(d.before);
    const after = list(d.after);
    const label = entry.action === 'PERMISSIONS_SET' ? permLabel : (s: string) => s;
    const added = after.filter((x) => !before.includes(x)).map((x) => `+ ${label(x)}`);
    const removed = before.filter((x) => !after.includes(x)).map((x) => `− ${label(x)}`);
    const parts = [...added, ...removed];
    return parts.length ? parts.join(' · ') : null;
  }
  if (entry.action === 'LEADER_REVOKE' && d.reason === 'NO_LEADER_ROLE') return 'Keine Leitungsrolle mehr in Cevi.DB';
  if (entry.action === 'LEADER_REVOKE' && d.reason === 'OTHER_DEPARTMENT') return 'Andere Ortsgruppe in Cevi.DB';
  if (entry.action === 'LEADER_GRANT' && d.source === 'CEVIDB') return 'Leitungsrolle in Cevi.DB';
  return null;
}

/** Protokoll der Abteilung: wer wem welche Rechte gegeben hat, Abteilungsleitung, Stufen */
export function DepartmentAuditPanel() {
  const toast = useToast();
  const [items, setItems] = useState<DepartmentAuditEntryDto[] | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  const load = useCallback(
    async (p: number) => {
      try {
        const res = await api<{ items: DepartmentAuditEntryDto[]; pageCount: number }>(
          `/api/departments/current/audit?page=${p}`
        );
        setItems((prev) => (p === 1 ? res.items : [...(prev ?? []), ...res.items]));
        setPageCount(res.pageCount);
        setPage(p);
      } catch (err) {
        toast({ title: 'Protokoll konnte nicht geladen werden', description: errorMessage(err), tone: 'error' });
        setItems([]);
      }
    },
    [toast]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  if (items === null) return <Skeleton className="h-40 rounded-card" />;
  if (items.length === 0) {
    return <EmptyState title="Noch keine Einträge" description="Hier erscheint, wer wem welche Rechte gegeben hat." />;
  }

  return (
    <div className="space-y-3">
      <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-card border border-line">
        {items.map((entry) => {
          const change = changeText(entry);
          return (
            <li key={entry.id} className="px-4 py-3">
              <p className="text-sm text-fg">
                <span className="font-semibold">{entry.targetLabel}</span>: {ACTION_LABELS[entry.action] ?? entry.action}
              </p>
              {change && <p className="mt-0.5 text-xs text-fg-muted">{change}</p>}
              <p className="mt-0.5 text-2xs text-fg-subtle">
                {fmtShortDate(entry.createdAt)}, {time(entry.createdAt)} · {entry.actorName}
              </p>
            </li>
          );
        })}
      </ul>
      {page < pageCount && (
        <Button size="sm" variant="ghost" onClick={() => load(page + 1)}>
          Ältere laden
        </Button>
      )}
    </div>
  );
}
