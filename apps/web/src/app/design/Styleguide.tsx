'use client';

import { useState, type ReactNode } from 'react';
import { CalendarX2, Plus, Ticket, UserMinus } from 'lucide-react';
import type { ShiftDto } from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  ChipRow,
  Dialog,
  EmptyState,
  Field,
  Input,
  ProgressRing,
  Select,
  Skeleton,
  SlotMeter,
  Switch,
  ThemeToggle,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { SignupModeBadge } from '@/components/event-meta';
import { ShiftTicket } from '@/components/ShiftTicket';

const COLORS = [
  ['canvas', 'bg-canvas'],
  ['surface', 'bg-surface'],
  ['surface-2', 'bg-surface-2'],
  ['surface-3', 'bg-surface-3'],
  ['line-strong', 'bg-line-strong'],
  ['fg-subtle', 'bg-fg-subtle'],
  ['fg', 'bg-fg'],
  ['accent', 'bg-accent'],
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
  ['danger', 'bg-danger'],
] as const;

// Feste Beispielzeit (Server und Client müssen identisch rendern) – liegt weit in der Zukunft
const BASE = Date.parse('2030-10-18T17:00:00Z');
const iso = (hours: number) => new Date(BASE + hours * 3_600_000).toISOString();
const sampleShift = (filled: number, total: number, extra: Partial<ShiftDto> = {}): ShiftDto => ({
  id: `demo-${filled}-${total}`,
  eventId: 'demo',
  title: 'Bar & Ausschank',
  category: 'Bar & Getränke',
  isSetupTeardown: false,
  description: 'Getränke ausgeben, Zapfanlage bedienen, Gläser abwaschen.',
  startTime: iso(48),
  endTime: iso(52.5),
  requiredSlots: total,
  freeSlots: total - filled,
  signups: ['Helfer 1', 'Helfer 2', 'Helfer 3', 'Helfer 4'].slice(0, filled).map((name, i) => ({
    id: `s${i}`,
    shiftId: 'demo',
    displayName: name,
    createdAt: iso(0),
    isConfirmed: true,
  })),
  ...extra,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-10">
      <h2 className="mb-6 font-display text-2xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function Styleguide() {
  const toast = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);
  const [chip, setChip] = useState('Alle');

  return (
    <div className="grain min-h-[100dvh] bg-campfire bg-no-repeat">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-5xl font-extrabold tracking-[-0.04em] sm:text-7xl">Lagerfeuer</h1>
            <p className="mt-3 max-w-xl text-fg-muted">
              Design-System des Cevi Schichtplans. Quelle: <code className="font-mono text-sm">packages/ui</code>.
              Die Akzentfarbe kommt pro Abteilung aus <code className="font-mono text-sm">department.primaryColor</code>.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <Section title="Farben">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {COLORS.map(([name, cls]) => (
              <div key={name}>
                <div className={`h-16 rounded-tile border border-line ${cls}`} />
                <p className="mt-1.5 font-mono text-xs text-fg-muted">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typografie">
          <div className="space-y-4">
            <p className="font-display text-6xl font-extrabold leading-none tracking-[-0.04em]">Chilbi 2026</p>
            <p className="font-display text-3xl font-bold tracking-tight">Freitag, 16. Oktober</p>
            <p className="max-w-[65ch] text-base leading-relaxed text-fg-muted">
              Fliesstext in Geist. Max. 65 Zeichen pro Zeile, Zeilenhöhe relaxed, sekundär in fg-muted.
            </p>
            <p className="tabular font-mono text-2xl font-semibold">19:00 bis 23:30</p>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              <Plus /> Primär
            </Button>
            <Button variant="secondary">Sekundär</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">
              <UserMinus /> Austragen
            </Button>
            <Button variant="inverse">Invertiert</Button>
            <Button loading>Speichere</Button>
            <Button disabled>Deaktiviert</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm">Klein</Button>
            <Button size="lg">Gross</Button>
            <Button size="icon" variant="secondary" aria-label="Hinzufügen">
              <Plus />
            </Button>
          </div>
        </Section>

        <Section title="Badges & Chips">
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Akzent</Badge>
            <Badge tone="success">Du bist dabei</Badge>
            <Badge tone="warning">ab 18 Jahren</Badge>
            <Badge tone="danger">Abgesagt</Badge>
            <Badge tone="outline">Outline</Badge>
            <SignupModeBadge mode="NAME_ONLY" />
            <SignupModeBadge mode="CEVIDB_ONLY" />
          </div>
          <ChipRow className="mt-5">
            {['Alle', 'Fr 16.', 'Sa 17.', 'So 18.'].map((c) => (
              <Chip key={c} selected={chip === c} onClick={() => setChip(c)} count={c === 'Alle' ? 14 : undefined}>
                {c}
              </Chip>
            ))}
          </ChipRow>
        </Section>

        <Section title="Formulare">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Cevi-Name" required hint="So erkennt dich das OK">
              <Input placeholder="Dein Cevi-Name" />
            </Field>
            <Field label="E-Mail" error="Diese Adresse sieht nicht gültig aus">
              <Input defaultValue="name@" />
            </Field>
            <Field label="Kategorie">
              <Select defaultValue="bar">
                <option value="bar">Bar & Getränke</option>
                <option value="grill">Grill & Essensausgabe</option>
              </Select>
            </Field>
            <div className="rounded-field bg-surface-2 p-4">
              <Switch checked={switchOn} onChange={setSwitchOn} label="Handynummer verlangen" description="Für kurzfristige Rückfragen" />
            </div>
          </div>
        </Section>

        <Section title="Belegung">
          <div className="flex flex-wrap items-center gap-10">
            <ProgressRing value={13} max={22} label="59%" sublabel="belegt" />
            <ProgressRing value={22} max={22} label="100%" sublabel="voll" tone="success" />
            <div className="space-y-3">
              <SlotMeter filled={1} total={4} />
              <SlotMeter filled={2} total={3} />
              <SlotMeter filled={3} total={3} />
              <SlotMeter filled={9} total={20} />
            </div>
            <div className="flex -space-x-2">
              {['Helfer 1', 'Helfer 2', 'Helfer 3', 'Helfer 4'].map((n, i) => (
                <Avatar key={n} name={n} highlight={i === 0} className="ring-2 ring-canvas" />
              ))}
            </div>
          </div>
        </Section>

        <Section title="Schicht-Tickets">
          <div className="grid gap-4 lg:grid-cols-2">
            <ShiftTicket shift={sampleShift(1, 4)} isMine={false} canManage={false} needsLogin={false} onSignup={() => {}} onCancel={() => {}} onRemoveHelper={() => {}} />
            <ShiftTicket shift={sampleShift(2, 3, { minAge: 18 })} isMine canManage needsLogin={false} onSignup={() => {}} onCancel={() => {}} onRemoveHelper={() => {}} />
            <ShiftTicket shift={sampleShift(3, 3)} isMine={false} canManage={false} needsLogin={false} onSignup={() => {}} onCancel={() => {}} onRemoveHelper={() => {}} />
            <ShiftTicket shift={sampleShift(0, 2)} isMine={false} canManage={false} needsLogin onSignup={() => {}} onCancel={() => {}} onRemoveHelper={() => {}} />
          </div>
        </Section>

        <Section title="Rückmeldungen">
          <div className="grid gap-3 sm:grid-cols-2">
            <Callout tone="info" title="Hinweis">Kein Passwort nötig, dein Cevi-Name reicht.</Callout>
            <Callout tone="success" title="Gespeichert">Die Abteilung wurde aktualisiert.</Callout>
            <Callout tone="warning" title="Fast voll">Nur noch ein Platz frei.</Callout>
            <Callout tone="danger" title="Fehler">Diese Schicht ist bereits voll belegt.</Callout>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => toast({ title: 'Du bist eingetragen!', description: 'Bar & Ausschank, Freitag ab 19:00' })}>
              Toast zeigen
            </Button>
            <Button variant="secondary" onClick={() => toast({ title: 'Hat nicht geklappt', description: 'Die Schicht ist voll.', tone: 'error' })}>
              Fehler-Toast
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const ok = await confirm({ title: 'Aus Schicht austragen?', description: 'Der Platz wird für andere frei.', confirmLabel: 'Austragen', tone: 'danger' });
                toast({ title: ok ? 'Bestätigt' : 'Abgebrochen', tone: 'info' });
              }}
            >
              Bestätigung
            </Button>
            <Button variant="secondary" onClick={() => setDialog(true)}>
              Dialog / Sheet
            </Button>
          </div>
        </Section>

        <Section title="Leer & Laden">
          <div className="grid gap-5 sm:grid-cols-2">
            <EmptyState icon={<CalendarX2 />} title="Gerade keine Anlässe" description="Leere Zustände erklären immer, wie es weitergeht." action={<Button size="sm">Anlass erstellen</Button>} />
            <Card className="space-y-3 p-6">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-28 rounded-card" />
            </Card>
          </div>
        </Section>
      </div>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        icon={<Ticket />}
        title="Für Schicht eintragen"
        description="Mobile: Bottom-Sheet. Desktop: zentrierter Dialog."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => setDialog(false)}>Verbindlich eintragen</Button>
          </>
        }
      >
        <Field label="Cevi-Name oder Vorname" required>
          <Input autoFocus placeholder="Dein Cevi-Name" />
        </Field>
      </Dialog>
    </div>
  );
}
