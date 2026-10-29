import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { PlanDay, PlanDocument, PlanShift, PlanTask, PersonEntry } from '@/lib/printPlan';

// Schicht-PDF (Übersicht, Aushang, pro Person). Nur über `createShiftPlanPdf` laden (eigener Chunk).

const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const LINE_STRONG = '#9ca3af';

let fontsRegistered = false;

/** Geist wie in der App. Schriftdateien liegen in public/fonts/pdf (SIL OFL). */
export function registerPdfFonts(base: string) {
  if (fontsRegistered) return;
  Font.register({
    family: 'Geist',
    fonts: [
      { src: `${base}/Geist-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/Geist-SemiBold.ttf`, fontWeight: 600 },
      { src: `${base}/Geist-Bold.ttf`, fontWeight: 700 },
    ],
  });
  // Namen nie trennen
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

export async function renderShiftPlanPdf(doc: PlanDocument, fontBase: string) {
  registerPdfFonts(fontBase);
  return pdf(<ShiftPlanPdf doc={doc} />).toBlob();
}

/** Farbe mit Weiss mischen (0 = Farbe, 1 = weiss) */
function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

const s = StyleSheet.create({
  page: { fontFamily: 'Geist', fontSize: 9, color: INK, paddingTop: 36, paddingBottom: 46, paddingHorizontal: 32, lineHeight: 1.3 },
  runningHead: { position: 'absolute', top: 14, left: 32, right: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  runningText: { fontSize: 7.5, color: MUTED },
  footerLine: { position: 'absolute', bottom: 30, left: 32, right: 32, borderTopWidth: 0.5, borderTopColor: LINE },
  footerLogo: { position: 'absolute', bottom: 16, left: 32, width: 10, height: 10 },
  footerText: { position: 'absolute', bottom: 17, fontSize: 7, color: MUTED },
  pageNumber: { position: 'absolute', right: 32, width: 80, fontSize: 7, color: MUTED, textAlign: 'right' },

  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, objectFit: 'contain' },
  title: { fontSize: 20, fontWeight: 700, lineHeight: 1.1 },
  subtitle: { fontSize: 9.5, color: MUTED, marginTop: 3 },
  stand: { marginLeft: 'auto', alignItems: 'flex-end' },
  standLabel: { fontSize: 6.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 },
  standValue: { fontSize: 8.5, fontWeight: 600, marginTop: 1 },
  accentBar: { height: 3, marginTop: 10, marginBottom: 14, borderRadius: 2 },

  day: { marginBottom: 14 },
  dayHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderLeftWidth: 4, borderRadius: 3, marginBottom: 2 },
  dayLabel: { fontSize: 13, fontWeight: 700, lineHeight: 1.2 },
  dayMeta: { fontSize: 8, color: MUTED, marginTop: 1 },
  progress: { marginLeft: 'auto', alignItems: 'flex-end' },
  progressText: { fontSize: 8, fontWeight: 600 },
  progressTrack: { width: 90, height: 4, backgroundColor: '#ffffff', borderRadius: 2, marginTop: 3 },
  progressFill: { height: 4, borderRadius: 2 },

  colHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingVertical: 4 },
  colLabel: { fontSize: 6.5, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 },

  shift: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE_STRONG },
  timeCell: { borderLeftWidth: 3, paddingLeft: 6, paddingVertical: 5 },
  time: { fontWeight: 700, fontSize: 9.5 },
  small: { fontSize: 7.5, color: MUTED },
  shiftCell: { paddingVertical: 5, paddingHorizontal: 6 },
  shiftTitle: { fontWeight: 700, fontSize: 9.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 },
  tag: { fontSize: 6.8, borderWidth: 0.6, borderColor: LINE_STRONG, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 0.5, color: '#374151' },
  desc: { fontSize: 7.5, color: MUTED, marginTop: 3 },
  tasks: { flex: 1 },
  task: { flexDirection: 'row', paddingVertical: 5, alignItems: 'flex-start' },
  taskBorder: { borderTopWidth: 0.5, borderTopColor: LINE },
  pill: { fontSize: 7.5, fontWeight: 700, borderRadius: 6, paddingVertical: 1, textAlign: 'center' },
  pillFull: { backgroundColor: '#dcfce7', color: '#166534' },
  pillOpen: { backgroundColor: '#ffedd5', color: '#9a3412' },
  names: { flex: 1, paddingLeft: 8 },
  free: { color: '#c2410c', fontWeight: 600 },

  slots: { flexDirection: 'row', flexWrap: 'wrap' },
  slot: { flexDirection: 'row', alignItems: 'flex-end', height: 21, paddingRight: 10, paddingBottom: 2, borderBottomWidth: 0.75 },
  slotNo: { width: 12, fontSize: 6.5, color: LINE_STRONG },
  slotName: { fontSize: 10.5, flex: 1 },

  person: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  personName: { width: 150, paddingLeft: 6 },
  entry: { flexDirection: 'row', paddingVertical: 1.5 },

  empty: { color: MUTED, paddingVertical: 14 },
});

export function ShiftPlanPdf({ doc }: { doc: PlanDocument }) {
  const wide = doc.landscape;
  const footerText = [doc.department, `${doc.title} · ${doc.subtitle}`, `Stand ${doc.stand}`].filter(Boolean).join('  ·  ');
  return (
    <Document title={`${doc.subtitle} – ${doc.title}`} author={doc.department ?? 'Cevi Schichtplan'} creator="Cevi Schichtplan" language="de-CH">
      <Page size="A4" orientation={wide ? 'landscape' : 'portrait'} style={s.page}>
        {/* Seitenzahl: dynamische Texte mit `bottom` landen ausserhalb der Seite, darum von oben gerechnet */}
        <Text
          fixed
          style={{ ...s.pageNumber, top: (wide ? 595.28 : 841.89) - 27 }}
          render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`}
        />
        <View fixed style={s.runningHead} render={({ pageNumber }) =>
          pageNumber > 1 ? (
            <Text style={s.runningText}>
              {doc.title} · {doc.subtitle}
            </Text>
          ) : null
        } />

        <View fixed style={s.footerLine} />
        {doc.ceviLogo && <Image fixed src={doc.ceviLogo} style={s.footerLogo} />}
        <Text fixed style={[s.footerText, { left: doc.ceviLogo ? 46 : 32, right: 110 }]}>
          {footerText}
        </Text>

        <View style={s.head}>
          {doc.logo && <Image src={doc.logo} style={s.logo} />}
          <View style={{ flexShrink: 1 }}>
            <Text style={s.title}>{doc.title}</Text>
            <Text style={s.subtitle}>
              {doc.subtitle} · {doc.dateRange}
              {doc.department ? ` · ${doc.department}` : ''}
            </Text>
          </View>
          <View style={s.stand}>
            <Text style={s.standLabel}>Stand</Text>
            <Text style={s.standValue}>{doc.stand}</Text>
          </View>
        </View>
        <View style={[s.accentBar, { backgroundColor: doc.accent }]} />

        {doc.layout === 'personen' ? (
          <PeopleTable people={doc.people} />
        ) : doc.days.length === 0 ? (
          <Text style={s.empty}>Keine Schichten ausgewählt.</Text>
        ) : (
          doc.days.map((day, i) => <DaySection key={day.key} day={day} doc={doc} breakBefore={doc.pageBreakPerDay && i > 0} />)
        )}

      </Page>
    </Document>
  );
}

function columns(doc: PlanDocument) {
  const wide = doc.landscape;
  return { time: 74, shift: wide ? 200 : 140, task: wide ? 130 : 84, count: 34 };
}

function DaySection({ day, doc, breakBefore }: { day: PlanDay; doc: PlanDocument; breakBefore: boolean }) {
  const col = columns(doc);
  const ratio = day.required ? day.filled / day.required : 1;
  const meta = [day.responsibles ? `Tagesleitung: ${day.responsibles}` : null, `${day.shiftCount} ${day.shiftCount === 1 ? 'Schicht' : 'Schichten'}`]
    .filter(Boolean)
    .join(' · ');
  const aushang = doc.layout === 'aushang';
  return (
    <View style={s.day} break={breakBefore}>
      <View wrap={false} minPresenceAhead={70}>
        <View style={[s.dayHead, { backgroundColor: tint(doc.accent, 0.9), borderLeftColor: doc.accent }]}>
          <View>
            <Text style={[s.dayLabel, aushang ? { fontSize: 16, lineHeight: 1.2 } : {}]}>{day.label}</Text>
            <Text style={s.dayMeta}>{meta}</Text>
          </View>
          <View style={s.progress}>
            <Text style={s.progressText}>
              {day.filled} von {day.required} Plätzen besetzt
            </Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: 90 * Math.min(1, ratio), backgroundColor: doc.accent }]} />
            </View>
          </View>
        </View>
        <View style={s.colHead}>
          <Text style={[s.colLabel, { width: col.time, paddingLeft: 9 }]}>Zeit</Text>
          <Text style={[s.colLabel, { width: col.shift, paddingLeft: 6 }]}>Schicht</Text>
          <Text style={[s.colLabel, { width: col.task }]}>Arbeit</Text>
          <Text style={[s.colLabel, { width: col.count, textAlign: 'center' }]}>Besetzt</Text>
          <Text style={[s.colLabel, { flex: 1, paddingLeft: 8 }]}>{aushang ? 'Namen' : 'Eingeteilt'}</Text>
        </View>
      </View>
      {day.shifts.length === 0 ? (
        <Text style={s.empty}>Keine offenen Plätze an diesem Tag.</Text>
      ) : (
        day.shifts.map((shift) => <ShiftRow key={shift.id} shift={shift} doc={doc} />)
      )}
    </View>
  );
}

function ShiftRow({ shift, doc }: { shift: PlanShift; doc: PlanDocument }) {
  const col = columns(doc);
  const slots = shift.tasks.reduce((sum, t) => sum + Math.max(t.required, t.names.length), 0);
  return (
    // Sehr grosse Schichten dürfen umbrechen, sonst passen sie auf keine Seite
    <View style={s.shift} wrap={slots > 40}>
      <View style={[s.timeCell, { width: col.time, borderLeftColor: shift.color }]}>
        <Text style={s.time}>{shift.time}</Text>
        <Text style={s.small}>{shift.duration}</Text>
      </View>
      <View style={[s.shiftCell, { width: col.shift }]}>
        {shift.title ? <Text style={s.shiftTitle}>{shift.title}</Text> : null}
        {(shift.category || shift.tags.length > 0) && (
          <View style={s.tags}>
            {shift.category && (
              <Text style={[s.tag, { borderColor: shift.color, color: shift.color, fontWeight: 600 }]}>{shift.category}</Text>
            )}
            {shift.tags.map((tag) => (
              <Text key={tag} style={s.tag}>
                {tag}
              </Text>
            ))}
          </View>
        )}
        {shift.description && <Text style={s.desc}>{shift.description}</Text>}
      </View>
      <View style={s.tasks}>
        {shift.tasks.map((task, i) => (
          <TaskRow key={i} task={task} doc={doc} first={i === 0} />
        ))}
      </View>
    </View>
  );
}

function TaskRow({ task, doc, first }: { task: PlanTask; doc: PlanDocument; first: boolean }) {
  const col = columns(doc);
  const free = Math.max(0, task.required - task.names.length);
  const full = free === 0;
  return (
    <View style={[s.task, first ? {} : s.taskBorder]}>
      <Text style={{ width: col.task, color: task.title ? INK : LINE_STRONG }}>{task.title ?? '–'}</Text>
      <View style={{ width: col.count, alignItems: 'center' }}>
        <Text style={[s.pill, full ? s.pillFull : s.pillOpen, { width: 30 }]}>
          {task.names.length}/{task.required}
        </Text>
      </View>
      <View style={s.names}>{doc.layout === 'aushang' ? <Slots task={task} landscape={doc.landscape} /> : <NameList task={task} free={free} />}</View>
    </View>
  );
}

function NameList({ task, free }: { task: PlanTask; free: number }) {
  if (task.names.length === 0) return <Text style={s.free}>{free ? `${free} frei` : '–'}</Text>;
  return (
    <Text>
      {task.names.join(', ')}
      {free > 0 && <Text style={s.free}>{`  ·  ${free} frei`}</Text>}
    </Text>
  );
}

function Slots({ task, landscape }: { task: PlanTask; landscape: boolean }) {
  const total = Math.max(task.required, task.names.length);
  const width = landscape ? '33.33%' : '50%';
  return (
    <View style={s.slots}>
      {Array.from({ length: total }, (_, i) => {
        const name = task.names[i];
        return (
          <View key={i} style={{ width, paddingRight: 8 }}>
            <View style={[s.slot, { borderBottomColor: name ? INK : LINE_STRONG, borderBottomStyle: name ? 'solid' : 'dashed' }]}>
              <Text style={s.slotNo}>{i + 1}</Text>
              <Text style={s.slotName}>{name ?? ''}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function PeopleTable({ people }: { people: PersonEntry[] }) {
  if (people.length === 0) return <Text style={s.empty}>Noch niemand eingeteilt.</Text>;
  return (
    <View>
      <View style={s.colHead}>
        <Text style={[s.colLabel, { width: 150, paddingLeft: 6 }]}>Name</Text>
        <Text style={[s.colLabel, { width: 58 }]}>Tag</Text>
        <Text style={[s.colLabel, { width: 68 }]}>Zeit</Text>
        <Text style={[s.colLabel, { flex: 1 }]}>Schicht · Arbeit</Text>
      </View>
      {people.map((p, i) => (
        <View key={`${p.name}-${i}`} style={[s.person, i % 2 ? { backgroundColor: '#f9fafb' } : {}]} wrap={false}>
          <View style={s.personName}>
            <Text style={{ fontWeight: 700, fontSize: 10 }}>{p.name}</Text>
            <Text style={s.small}>
              {p.items.length} {p.items.length === 1 ? 'Schicht' : 'Schichten'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            {p.items.map((it, j) => (
              <View key={j} style={s.entry}>
                <Text style={{ width: 58 }}>{it.day}</Text>
                <Text style={{ width: 68 }}>{it.time}</Text>
                <Text style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 600 }}>{it.shift}</Text>
                  {it.task ? ` · ${it.task}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
