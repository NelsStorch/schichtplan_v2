import {
  Check,
  X,
  AlertCircle,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import type { OrganizationConfig } from '@schichtplan/shared';

interface Row {
  title: string;
  desc?: string;
  excel: { state: 'no' | 'partial' | 'yes'; text: string };
  chat: { state: 'no' | 'partial' | 'yes'; text: string };
  cevi: { state: 'yes'; text: string };
}

export function ComparisonTable({ org }: { org?: OrganizationConfig }) {
  const name = org?.name ?? 'Cevi Schichtplan';
  const authShort = org?.authProviderShort ?? 'Cevi.DB';
  const unitTerm = org?.unitTerm ?? 'Abteilung';

  const rows: Row[] = [
    {
      title: 'Eintragen ohne Passwort & ohne App',
      desc: 'Helfer*innen klicken einfach auf den Link und tragen sich ein.',
      excel: { state: 'partial', text: 'Konto oder Excel-App nötig' },
      chat: { state: 'partial', text: 'Unübersichtlich im Gruppenchat' },
      cevi: { state: 'yes', text: 'In 10 Sek. via Link (auch für Eltern)' },
    },
    {
      title: `${authShort}-Anbindung für Leitende`,
      desc: `Login mit den bestehenden ${authShort}-Zugangsdaten.`,
      excel: { state: 'no', text: 'Alles manuell abtippen' },
      chat: { state: 'no', text: 'Keine Schnittstelle' },
      cevi: { state: 'yes', text: `Name, ${unitTerm} & Stufen synchron` },
    },
    {
      title: 'Automatische Mindestalter-Prüfung',
      desc: 'Schichten mit Altersgrenze (z. B. Bar ab 16 oder 18 Jahren).',
      excel: { state: 'no', text: 'Manuell nachrechnen' },
      chat: { state: 'no', text: 'Keine Kontrolle' },
      cevi: { state: 'yes', text: 'Automatische Prüfung vor Eintrag' },
    },
    {
      title: 'Kalender-Sync & Erinnerungen',
      desc: 'Einsatz direkt im eigenen Handy-Kalender.',
      excel: { state: 'no', text: 'Keine Erinnerung' },
      chat: { state: 'no', text: 'Geht im Chatverlauf unter' },
      cevi: { state: 'yes', text: 'Automatischer Kalender-Eintrag' },
    },
    {
      title: 'Live-Übersicht für das OK',
      desc: 'Sofort sehen, wo noch Schichten frei sind.',
      excel: { state: 'partial', text: 'Mühsame manuelle Zählung' },
      chat: { state: 'no', text: 'Niemand hat den Überblick' },
      cevi: { state: 'yes', text: 'Echtzeit-Balken pro Schicht' },
    },
    {
      title: 'Vorlage fürs nächste Jahr',
      desc: 'Lager- und Fest-Schichten einfach wiederverwenden.',
      excel: { state: 'partial', text: 'Fehleranfälliges Copy-Paste' },
      chat: { state: 'no', text: 'Jedes Mal von vorne anfangen' },
      cevi: { state: 'yes', text: '1 Klick: Vom Vorjahr übernehmen' },
    },
    {
      title: 'Datenschutz nach Schweizer nDSG',
      desc: 'Nummern und E-Mails nur für das OK sichtbar.',
      excel: { state: 'no', text: 'Jeder sieht alle privaten Nummern' },
      chat: { state: 'no', text: 'Daten öffentlich im Gruppenchat' },
      cevi: { state: 'yes', text: 'Kontaktdaten geschützt' },
    },
    {
      title: 'Verpflegungs-Bons digital einlösen',
      desc: 'QR-Code für Helfer-Verpflegung am Stand scannen.',
      excel: { state: 'no', text: 'Papierschnipsel oder Listen' },
      chat: { state: 'no', text: 'Keine Bon-Funktion' },
      cevi: { state: 'yes', text: 'Digitaler Bon mit 1-Klick-Scan' },
    },
  ];

  return (
    <section className="py-20 md:py-28 border-t border-line/60 relative">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="max-w-2xl mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-2xs font-bold uppercase tracking-[0.16em] bg-surface-2 border border-line text-fg-subtle mb-3">
            <Sparkles className="size-3 text-accent" />
            Direkter Vergleich
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            Warum nicht einfach Excel oder WhatsApp?
          </h2>
          <p className="mt-3 text-base text-fg-muted leading-relaxed">
            Fast jedes Festkomitee und Leitungsteam startet mit einer geteilten Excel-Liste oder einem Gruppenchat – und stösst
            schnell an dieselben Frustgrenzen. Hier siehst du den Unterschied auf einen Blick.
          </p>
        </Reveal>

        {/* The Comparison Table */}
        <Reveal delay={100} className="rounded-card border border-line/80 bg-surface shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-line bg-surface-2/70">
                  {/* Sticky First Column Header on Mobile */}
                  <th className="sticky left-0 z-20 py-4 px-4 sm:px-6 text-xs font-bold uppercase tracking-wider text-fg-subtle w-2/5 bg-surface-2 border-r border-line sm:border-r-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    <div className="flex items-center justify-between gap-2">
                      <span>Funktion / Kriterium</span>
                      <span className="sm:hidden text-[10px] font-normal normal-case text-fg-subtle">
                        ← Wischen →
                      </span>
                    </div>
                  </th>
                  <th className="py-4 px-3 sm:px-4 text-xs font-bold text-fg-muted text-center w-1/5">
                    Excel / Sheets
                  </th>
                  <th className="py-4 px-3 sm:px-4 text-xs font-bold text-fg-muted text-center w-1/5">
                    WhatsApp / Doodle
                  </th>
                  <th className="py-4 px-4 sm:px-6 text-xs font-bold text-accent text-center w-1/5 bg-accent/8 border-l border-r border-accent/20">
                    <div className="inline-flex items-center gap-1.5 font-display text-sm font-extrabold text-accent-ink">
                      <span>{name}</span>
                      <ShieldCheck className="size-4 text-accent shrink-0" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs">
                {rows.map((row, idx) => (
                  <tr
                    key={row.title}
                    className={`transition-colors hover:bg-surface-2/40 ${
                      idx % 2 === 1 ? 'bg-surface-2/20' : ''
                    }`}
                  >
                    {/* Sticky Feature Title on Mobile */}
                    <td
                      className={`sticky left-0 z-10 py-3.5 sm:py-4 px-4 sm:px-6 border-r border-line sm:border-r-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] ${
                        idx % 2 === 1 ? 'bg-surface-2' : 'bg-surface'
                      }`}
                    >
                      <div className="font-semibold text-fg text-xs sm:text-sm">{row.title}</div>
                      {row.desc && (
                        <div className="text-2xs text-fg-subtle mt-0.5 leading-snug hidden sm:block">
                          {row.desc}
                        </div>
                      )}
                    </td>

                    {/* Column 2: Excel / Sheets */}
                    <td className="py-3.5 sm:py-4 px-3 sm:px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {row.excel.state === 'yes' ? (
                          <Check className="size-4 text-emerald-500" />
                        ) : row.excel.state === 'partial' ? (
                          <AlertCircle className="size-4 text-amber-500" />
                        ) : (
                          <X className="size-4 text-fg-subtle/50" />
                        )}
                        <span className="text-2xs text-fg-muted leading-tight text-balance">
                          {row.excel.text}
                        </span>
                      </div>
                    </td>

                    {/* Column 3: WhatsApp / Doodle */}
                    <td className="py-3.5 sm:py-4 px-3 sm:px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {row.chat.state === 'yes' ? (
                          <Check className="size-4 text-emerald-500" />
                        ) : row.chat.state === 'partial' ? (
                          <AlertCircle className="size-4 text-amber-500" />
                        ) : (
                          <X className="size-4 text-fg-subtle/50" />
                        )}
                        <span className="text-2xs text-fg-muted leading-tight text-balance">
                          {row.chat.text}
                        </span>
                      </div>
                    </td>

                    {/* Column 4: Schichtplan (Highlight Column) */}
                    <td className="py-3.5 sm:py-4 px-4 sm:px-6 text-center bg-accent/4 border-l border-r border-accent/20">
                      <div className="flex flex-col items-center gap-1">
                        <div className="size-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                          <Check className="size-3.5 text-emerald-500 font-bold" />
                        </div>
                        <span className="text-2xs font-semibold text-fg leading-tight text-balance">
                          {row.cevi.text}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
