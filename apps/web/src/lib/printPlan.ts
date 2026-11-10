import { getOrganization, type DepartmentDto, type ShiftDto, type ShiftSignupDto } from '@schichtplan/shared';
import { dayKeyToIso, fmtDateRange, fmtDayMonth, fmtShortDate, fmtShortWeekday, fmtWeekday, groupByBusinessDay, fmtTimeRange } from './format';
import type { EventDetails } from './types';

export type PrintLayout = 'plan' | 'aushang' | 'personen';

export interface PrintPlanOptions {
  layout: PrintLayout;
  /** Geschäftstage (YYYY-MM-DD), die gedruckt werden */
  days: string[];
  landscape: boolean;
  /** Jeder Tag auf einer neuen Seite */
  pageBreakPerDay: boolean;
  /** Kategorie, Beschreibung, Altersgrenze und Verantwortliche */
  showDetails: boolean;
  /** Nur Arbeiten mit freien Plätzen */
  onlyOpen: boolean;
}

export const PRINT_LAYOUTS: { value: PrintLayout; label: string; text: string }[] = [
  { value: 'plan', label: 'Übersicht', text: 'Kompakt: alle Schichten pro Tag mit Besetzung und Namen.' },
  { value: 'aushang', label: 'Zum Aufhängen', text: 'Grosse Schrift, jeder Platz eine Zeile. Freie Plätze zum Eintragen von Hand.' },
  { value: 'personen', label: 'Pro Person', text: 'Wer wann wo hilft, nach Namen sortiert. Zum Verteilen oder Nachschauen.' },
];

export interface PlanTask {
  /** null, wenn die Schicht nur eine gleichnamige Arbeit hat */
  title: string | null;
  required: number;
  names: string[];
}

export interface PlanShift {
  id: string;
  time: string;
  duration: string;
  title: string;
  category: string | null;
  color: string;
  tags: string[];
  description: string | null;
  tasks: PlanTask[];
}

export interface PlanDay {
  key: string;
  label: string;
  responsibles: string | null;
  shiftCount: number;
  required: number;
  filled: number;
  shifts: PlanShift[];
}

export interface PersonEntry {
  name: string;
  items: { day: string; time: string; shift: string; task: string | null }[];
}

/** Alles, was das PDF braucht: fertig aufbereitet, ohne Bezug zu React */
export interface PlanDocument {
  layout: PrintLayout;
  landscape: boolean;
  pageBreakPerDay: boolean;
  title: string;
  subtitle: string;
  dateRange: string;
  stand: string;
  department: string | null;
  accent: string;
  /** PNG als Data-URL */
  logo: string | null;
  ceviLogo: string | null;
  days: PlanDay[];
  people: PersonEntry[];
}

interface TaskRow {
  title: string;
  requiredSlots: number;
  signups: ShiftSignupDto[];
}

/** Arbeiten einer Schicht. Schichten ohne Arbeit gelten als eine Arbeit mit allen Eingetragenen. */
function taskRows(shift: ShiftDto): TaskRow[] {
  const tasks = shift.tasks ?? [];
  const signups = shift.signups ?? [];
  if (tasks.length === 0) return [{ title: shift.title || 'Schicht', requiredSlots: shift.requiredSlots, signups }];
  return tasks.map((t) => ({
    title: t.title,
    requiredSlots: t.requiredSlots,
    signups: signups.filter((su) => su.taskId === t.id).sort((a, b) => a.displayName.localeCompare(b.displayName, 'de')),
  }));
}

/** Gut unterscheidbar und auch auf Graustufen-Druckern nicht zu hell */
const CATEGORY_COLORS = ['#1d4ed8', '#b91c1c', '#15803d', '#a16207', '#7e22ce', '#0f766e', '#c2410c', '#be185d'];

/** Gleiche Kategorie = gleiche Farbe, ohne dass jemand Farben pflegen muss */
function categoryColor(category: string | null | undefined) {
  if (!category) return '#9ca3af';
  let hash = 0;
  for (const c of category) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

function duration(shift: ShiftDto) {
  const minutes = Math.round((+new Date(shift.endTime) - +new Date(shift.startTime)) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m}` : h ? `${h} h` : `${m} min`;
}

const DEFAULT_ACCENT = '#e11d48';

function buildDays(event: EventDetails, options: PrintPlanOptions): PlanDay[] {
  return groupByBusinessDay(event.shifts, event.dayCutoffTime)
    .filter((d) => options.days.includes(d.key))
    .map((d) => {
      const all = d.items.flatMap(taskRows);
      const shifts = d.items
        .map((shift): PlanShift => {
          const rows = taskRows(shift).filter((t) => !options.onlyOpen || t.signups.length < t.requiredSlots);
          const single = rows.length === 1 && rows[0].title === shift.title;
          const tags = options.showDetails
            ? [
                shift.isSetupTeardown ? 'Auf-/Abbau' : '',
                shift.minAge ? `ab ${shift.minAge}` : '',
                shift.responsibles?.length ? `Verantwortlich: ${shift.responsibles.map((r) => r.displayName).join(', ')}` : '',
              ].filter(Boolean)
            : [];
          return {
            id: shift.id,
            time: `${fmtTimeRange(shift.startTime, shift.endTime)}`,
            duration: duration(shift),
            title: shift.title || '',
            category: options.showDetails ? (shift.category ?? null) : null,
            color: categoryColor(shift.category),
            tags,
            description: options.showDetails ? (shift.description?.trim() || null) : null,
            tasks: rows.map((t) => ({ title: single ? null : t.title, required: t.requiredSlots, names: t.signups.map((su) => su.displayName) })),
          };
        })
        .filter((s) => s.tasks.length > 0);
      return {
        key: d.key,
        label: `${fmtWeekday(dayKeyToIso(d.key))}, ${fmtDayMonth(dayKeyToIso(d.key))}`,
        responsibles: event.dayResponsibles?.[d.key]?.map((r) => r.displayName).join(', ') || null,
        shiftCount: d.items.length,
        required: all.reduce((sum, t) => sum + t.requiredSlots, 0),
        filled: all.reduce((sum, t) => sum + Math.min(t.signups.length, t.requiredSlots), 0),
        shifts,
      };
    });
}

function buildPeople(event: EventDetails, options: PrintPlanOptions): PersonEntry[] {
  const byPerson = new Map<string, PersonEntry>();
  for (const d of groupByBusinessDay(event.shifts, event.dayCutoffTime)) {
    if (!options.days.includes(d.key)) continue;
    for (const shift of d.items) {
      for (const task of taskRows(shift)) {
        for (const su of task.signups) {
          const key = su.userId ?? `guest:${su.displayName.toLowerCase()}`;
          const entry = byPerson.get(key) ?? { name: su.displayName, items: [] };
          entry.items.push({
            day: `${fmtShortWeekday(dayKeyToIso(d.key))} ${fmtShortDate(dayKeyToIso(d.key))}`,
            time: `${fmtTimeRange(shift.startTime, shift.endTime)}`,
            shift: shift.title || '',
            task: task.title === shift.title ? null : task.title,
          });
          byPerson.set(key, entry);
        }
      }
    }
  }
  return [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Bild (auch SVG) als PNG-Data-URL, verkleinert. null, wenn es nicht lädt oder fremd ist (Canvas gesperrt). */
async function rasterize(url: string, maxSize = 360): Promise<string | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || maxSize;
    const h = img.naturalHeight || maxSize;
    const scale = Math.min(1, maxSize / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export async function buildPlanDocument(
  event: EventDetails,
  department: DepartmentDto | null,
  options: PrintPlanOptions,
  loadImage: (url: string) => Promise<string | null> = rasterize
): Promise<PlanDocument> {
  const org = getOrganization(typeof window !== 'undefined' ? window.location.host : 'cevi-schichtplan.ch');
  const brandLogo = await loadImage(org.logoUrl);
  let logo: string | null = null;
  for (const url of [event.logoUrl, department?.logoUrl]) {
    if (url && !logo) logo = await loadImage(url);
  }
  const people = options.layout === 'personen' ? buildPeople(event, options) : [];
  const subtitle =
    options.layout === 'personen'
      ? `Einteilung pro Person · ${people.length} ${people.length === 1 ? 'Person' : 'Personen'}`
      : options.onlyOpen
        ? 'Offene Plätze'
        : options.layout === 'aushang'
          ? 'Schichtplan zum Eintragen'
          : 'Schichtplan';
  return {
    layout: options.layout,
    landscape: options.landscape,
    pageBreakPerDay: options.pageBreakPerDay,
    title: event.title,
    subtitle,
    dateRange: fmtDateRange(event.startDate, event.endDate, event.dayCutoffTime),
    stand: new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Zurich' }).format(new Date()),
    department: department?.name ?? null,
    accent: /^#[0-9a-f]{6}$/i.test(department?.primaryColor ?? '') ? department!.primaryColor! : DEFAULT_ACCENT,
    logo: logo ?? brandLogo,
    ceviLogo: logo ? brandLogo : null,
    days: options.layout === 'personen' ? [] : buildDays(event, options),
    people,
  };
}

export function pdfFilename(event: EventDetails, options: PrintPlanOptions) {
  const kind = options.layout === 'personen' ? 'einteilung' : options.onlyOpen ? 'offene-plaetze' : 'schichtplan';
  return `${kind}-${event.slug}.pdf`;
}

/** PDF erzeugen. react-pdf wird erst hier geladen, damit es nicht im normalen Seiten-Bundle landet. */
export async function createShiftPlanPdf(event: EventDetails, department: DepartmentDto | null, options: PrintPlanOptions) {
  const [doc, { renderShiftPlanPdf }] = await Promise.all([
    buildPlanDocument(event, department, options),
    import('@/components/ok/ShiftPlanPdf'),
  ]);
  return renderShiftPlanPdf(doc, '/fonts/pdf');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Handy/Tablet drucken PDFs aus einem Rahmen nicht zuverlässig (iPad meldet sich als Mac) */
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** PDF über einen unsichtbaren Rahmen drucken. Auf dem Handy oder bei einem Fehler öffnet es sich im PDF-Betrachter. */
export function printBlob(blob: Blob, filename: string) {
  if (isMobile()) {
    downloadBlob(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
    } catch {
      window.open(url, '_blank');
    }
  };
  document.body.appendChild(frame);
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 120_000);
}
