'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, errorMessage } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';
import { EVENT_CAPABILITIES, departmentRoleLabel, type EventCapability } from '@schichtplan/shared';

/** Auswahl, die von «Helfende» oder «Schichten» an «Nachrichten» übergeben wird */
export type MessageDraft =
  | { target: 'PEOPLE'; userIds: string[]; label: string }
  | { target: 'SHIFTS'; shiftIds: string[]; label: string };

export interface OkPermissions {
  /** Sieht den OK-Bereich: Abteilungsleitung, OK, «Alle Anlässe sehen», globale Admins */
  canManage: boolean;
  /** Anlass-Einstellungen: Abteilungsleitung, OK-Leitung, «Anlässe bearbeiten» */
  canEditSettings: boolean;
  /** Anlass löschen: Abteilungsleitung oder «Anlässe löschen», nicht die OK-Leitung */
  canDeleteEvent: boolean;
  /** Alle Fähigkeiten im Anlass, so wie das Backend sie prüft */
  can: Record<EventCapability, boolean>;
  roleLabel: string;
}

export interface OkStats {
  totalSlots: number;
  filledSlots: number;
  freeSlots: number;
  percentFilled: number;
  helperCount: number;
  openShiftCount: number;
}

interface OkState {
  slug: string;
  base: string;
  event: EventDetails | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  permissions: OkPermissions;
  stats: OkStats;
  messageDraft: MessageDraft | null;
  setMessageDraft: (draft: MessageDraft | null) => void;
}

const OkContext = createContext<OkState | null>(null);

export function computeStats(event: EventDetails | null): OkStats {
  const shifts = event?.shifts ?? [];
  const totalSlots = shifts.reduce((sum, s) => sum + s.requiredSlots, 0);
  const filledSlots = shifts.reduce((sum, s) => sum + Math.min(s.signups?.length ?? 0, s.requiredSlots), 0);
  const helpers = new Set<string>();
  for (const s of shifts) for (const su of s.signups ?? []) helpers.add(su.userId || su.guestName || su.id);
  return {
    totalSlots,
    filledSlots,
    freeSlots: Math.max(0, totalSlots - filledSlots),
    percentFilled: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0,
    helperCount: helpers.size,
    openShiftCount: shifts.filter((s) => (s.signups?.length ?? 0) < s.requiredSlots).length,
  };
}

/** Lädt den Anlass einmal für alle Seiten des OK-Bereichs */
export function OkProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const { user, isDeptAdmin, permissions: departmentPermissions, loading: portalLoading } = usePortal();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState<MessageDraft | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api<EventDetails>(`/api/events/${slug}`);
      setEvent(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'Anlass nicht gefunden' : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    reload();
  }, [reload]);

  const permissions = useMemo<OkPermissions>(() => {
    const caps = new Set(event?.viewer.access.capabilities ?? []);
    const can = Object.fromEntries(EVENT_CAPABILITIES.map((c) => [c, caps.has(c)])) as Record<EventCapability, boolean>;
    const organizer = user ? event?.organizers?.find((o) => o.userId === user.id) : undefined;
    const roleLabel = organizer
      ? organizer.role === 'OK_LEAD'
        ? 'OK-Leitung'
        : 'OK-Mitglied'
      : user?.isGlobalAdmin && user.departmentRole !== 'ADMIN'
        ? 'Plattform-Admin'
        : user
          ? departmentRoleLabel({
              isLeader: isDeptAdmin,
              permissions: [...departmentPermissions],
              isHomeDepartment: true,
            })
          : '';
    return {
      canManage: can.VIEW,
      canEditSettings: can.SETTINGS,
      canDeleteEvent: can.DELETE,
      can,
      roleLabel,
    };
  }, [user, event, isDeptAdmin, departmentPermissions]);

  const stats = useMemo(() => computeStats(event), [event]);

  return (
    <OkContext.Provider
      value={{
        slug,
        base: `/events/${slug}/ok`,
        event,
        loading: loading || portalLoading,
        error,
        reload,
        permissions,
        stats,
        messageDraft,
        setMessageDraft,
      }}
    >
      {children}
    </OkContext.Provider>
  );
}

export function useOk() {
  const ctx = useContext(OkContext);
  if (!ctx) throw new Error('useOk() braucht <OkProvider>');
  return ctx;
}

/** Für Seiten innerhalb des Layouts: dort ist der Anlass bereits geladen */
export function useOkEvent() {
  const ctx = useOk();
  if (!ctx.event) throw new Error('useOkEvent() vor dem Laden des Anlasses');
  return { ...ctx, event: ctx.event };
}
