import {
  Check,
  X,
  AlertCircle,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Reveal } from '@/components/Reveal';

interface Row {
  title: string;
  desc?: string;
  excel: { state: 'no' | 'partial' | 'yes'; text: string };
  chat: { state: 'no' | 'partial' | 'yes'; text: string };
  cevi: { state: 'yes'; text: string };
}

const rows: Row[] = [
  {
    title: 'Eintragen ohne Passwort & ohne App',
    desc: 'Helfer*innen klicken einfach auf den Link und tragen sich ein.',
    excel: { state: 'partial', text: 'Konto oder Excel-App nötig' },
    chat: { state: 'partial', text: 'Unübersichtlich im Gruppenchat' },
    cevi: { state: 'yes', text: 'In 10 Sek. via Link (auch für Eltern)' },
  },
  {
    title: 'Cevi.DB-Anbindung für Leitende',
    desc: 'Login mit den bestehenden Cevi.DB-Zugangsdaten.',
    excel: { state: 'no', text: 'Alles manuell abtippen' },
    chat: { state: 'no', text: 'Keine Schnittstelle' },
    cevi: { state: 'yes', text: 'Name, Abteilung & Stufen synchron' },
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
    desc: 'Chilbi oder Lager-Schichten einfach wiederverwenden.',
    excel: { state: 'partial', text: 'Fehleranfälliges Copy-Paste' },
    chat: { state: 'no', text: 'Jedes Mal von vorne anfangen' },
    cevi: { state: 'yes', text: '1 Klick: Vom Vorjahr übernehmen' },
  },
  {
    title: 'Datenschutz & Schweizer Vereinsrecht',
    desc: 'Wer sieht welche Telefonnummern und Kontaktdaten?',
    excel: { state: 'no', text: 'Alle sehen alle Handynummern' },
    chat: { state: 'no', text: 'Nummern für alle sichtbar' },
    cevi: { state: 'yes', text: 'Nur das OK sieht Kontaktdaten' },
  },
  {
    title: 'Kosten & Werbung',
    desc: 'Frei von Werbebannern und versteckten Gebühren.',
    excel: { state: 'partial', text: 'Microsoft 365 Lizenz / Google' },
    chat: { state: 'partial', text: 'Doodle voller Werbung' },
    cevi: { state: 'yes', text: '0 CHF & 100% werbefrei' },
  },
];

export function ComparisonTable() {
  return (
    <section className="py-20 md:py-28 border-t border-line/60 bg-surface/25 relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4">
        {/* Section Header */}
        <Reveal className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-2xs font-bold uppercase tracking-wider bg-accent/12 text-accent-ink border border-accent/25 mb-4 shadow-sm">
            <Sparkles className="size-3 text-accent" />
            <span>Der direkte Vergleich</span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            Warum nicht einfach Excel, WhatsApp oder Doodle?
          </h2>
          <p className="mt-3 text-base text-fg-muted leading-relaxed">
            Wie sich der Cevi Schichtplan gegenüber typischen Notlösungen und Bezahl-Tools schlägt:
          </p>
        </Reveal>

        {/* Comparison Table Container */}
        <Reveal className="rounded-2xl sm:rounded-card border border-line bg-surface shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[620px]">
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
                      <span>Cevi Schichtplan</span>
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

                    {/* Excel Column */}
                    <td className="py-3.5 sm:py-4 px-3 sm:px-4 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        {row.excel.state === 'no' ? (
                          <X className="size-4 text-danger-ink shrink-0" />
                        ) : (
                          <AlertCircle className="size-4 text-warning-ink shrink-0" />
                        )}
                        <span className="text-2xs text-fg-muted font-medium text-center">
                          {row.excel.text}
                        </span>
                      </div>
                    </td>

                    {/* WhatsApp Column */}
                    <td className="py-3.5 sm:py-4 px-3 sm:px-4 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        {row.chat.state === 'no' ? (
                          <X className="size-4 text-danger-ink shrink-0" />
                        ) : (
                          <AlertCircle className="size-4 text-warning-ink shrink-0" />
                        )}
                        <span className="text-2xs text-fg-muted font-medium text-center">
                          {row.chat.text}
                        </span>
                      </div>
                    </td>

                    {/* Cevi Schichtplan (Highlight Column) */}
                    <td className="py-3.5 sm:py-4 px-4 sm:px-6 text-center bg-accent/8 border-l border-r border-accent/20">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0 shadow-sm">
                          <Check className="size-3 stroke-[3]" />
                        </span>
                        <span className="text-2xs font-bold text-fg text-center">
                          {row.cevi.text}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Footer Banner */}
          <div className="p-4 sm:p-5 border-t border-line bg-surface-2/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-fg-subtle">
            <span>
              Entwickelt von Cevi-Leitenden für den echten Schweizer Abteilungs- und Lageralltag.
            </span>
            <span className="font-semibold text-accent-ink shrink-0">
              ✓ Speziell auf das Cevi-Vereinsleben zugeschnitten
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
