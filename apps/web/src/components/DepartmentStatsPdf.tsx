import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { DepartmentDto, DepartmentStatsResponseDto } from '@schichtplan/shared';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const LINE_STRONG = '#cbd5e1';
const BG_SUBTLE = '#f8fafc';

let fontsRegistered = false;

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
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Geist',
    fontSize: 8.5,
    color: INK,
    paddingTop: 36,
    paddingBottom: 42,
    paddingHorizontal: 36,
    lineHeight: 1.3,
  },
  runningHead: {
    position: 'absolute',
    top: 16,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingBottom: 4,
  },
  runningText: {
    fontSize: 7.5,
    color: MUTED,
  },
  footerLine: {
    position: 'absolute',
    bottom: 26,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
  },
  footerLogo: {
    position: 'absolute',
    bottom: 14,
    left: 36,
    width: 9,
    height: 9,
  },
  footerText: {
    position: 'absolute',
    bottom: 15,
    fontSize: 7,
    color: MUTED,
  },
  pageNumber: {
    position: 'absolute',
    right: 36,
    width: 80,
    fontSize: 7,
    color: MUTED,
    textAlign: 'right',
  },

  // Header
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 44,
    height: 44,
    marginRight: 12,
    objectFit: 'contain',
  },
  titleGroup: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.15,
  },
  subtitle: {
    fontSize: 8.5,
    color: MUTED,
    marginTop: 2,
  },
  metaRight: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontSize: 6.5,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 8.5,
    fontWeight: 600,
    marginTop: 1,
  },
  accentBar: {
    height: 2.5,
    marginTop: 6,
    marginBottom: 12,
    borderRadius: 1.5,
  },

  // KPI Bento Grid
  kpiRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: LINE,
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#ffffff',
    marginRight: 6,
  },
  kpiCardLast: {
    marginRight: 0,
  },
  kpiLabel: {
    fontSize: 6.5,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: MUTED,
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: 700,
    marginTop: 2,
    color: INK,
  },
  kpiSub: {
    fontSize: 7,
    color: MUTED,
    marginTop: 1,
  },
  kpiDetail: {
    fontSize: 6.5,
    color: '#0284c7',
    marginTop: 3,
  },

  // Section Header
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
    color: INK,
  },
  sectionSubtitle: {
    fontSize: 7.5,
    color: MUTED,
    marginBottom: 8,
  },

  // Podest Top 3
  podestRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  podestCard: {
    flex: 1,
    borderWidth: 0.75,
    borderRadius: 4,
    padding: 7,
    marginRight: 6,
  },
  podestCard1: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  podestCard2: {
    borderColor: '#94a3b8',
    backgroundColor: '#f8fafc',
  },
  podestCard3: {
    borderColor: '#fb923c',
    backgroundColor: '#fff7ed',
    marginRight: 0,
  },
  podestBadge: {
    fontSize: 6.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  podestName: {
    fontSize: 10,
    fontWeight: 700,
    color: INK,
  },
  podestRealName: {
    fontSize: 7.5,
    color: MUTED,
  },
  podestHours: {
    fontSize: 9,
    fontWeight: 700,
    marginTop: 4,
  },

  // Table
  table: {
    width: '100%',
    marginBottom: 14,
    borderWidth: 0.75,
    borderColor: LINE,
    borderRadius: 3,
    overflow: 'hidden',
  },
  thRow: {
    flexDirection: 'row',
    backgroundColor: BG_SUBTLE,
    borderBottomWidth: 0.75,
    borderBottomColor: LINE_STRONG,
    paddingVertical: 4.5,
    paddingHorizontal: 6,
  },
  thCell: {
    fontSize: 6.5,
    fontWeight: 700,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  trAlt: {
    backgroundColor: '#fcfcfd',
  },
  td: {
    fontSize: 7.5,
    color: INK,
  },
  badge: {
    fontSize: 6,
    backgroundColor: '#f1f5f9',
    color: '#475569',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
    marginRight: 2,
  },
});

export interface DepartmentStatsPdfProps {
  data: DepartmentStatsResponseDto;
  department: DepartmentDto | null;
  logoUrl?: string | null;
}

export function DepartmentStatsPdf({ data, department, logoUrl }: DepartmentStatsPdfProps) {
  const accent = department?.primaryColor || '#e11d48';
  const yearText = data.year === 'ALL' ? 'Gesamte Auswertung (Alle Jahre)' : `Jahresbericht ${data.year}`;
  const deptName = department?.name || 'Cevi Abteilung';
  const filterDesc = [
    data.filter.countAttendedOnly ? 'Nur bestätigte Anwesenheiten' : 'Alle eingetragenen Schichten',
    data.filter.includeSetupTeardown ? 'inkl. Auf- & Abbau' : 'ohne Auf-/Abbau',
  ].join(' · ');

  const footerText = `${deptName} · Helferstatistik ${yearText} · Stand ${new Date().toLocaleDateString('de-CH')}`;

  // Top 3 für das Podest
  const top3 = data.topHelpers.slice(0, 3);
  const helpersList = data.topHelpers.slice(0, 35); // Erste 35 Helfende für den kompakten GV-Druck

  return (
    <Document
      title={`Helferstatistik – ${deptName} – ${yearText}`}
      author={deptName}
      creator="Cevi Schichtplan"
      language="de-CH"
    >
      <Page size="A4" orientation="portrait" style={s.page}>
        {/* Seitennummerierung */}
        <Text
          fixed
          style={{ ...s.pageNumber, top: 841.89 - 24 }}
          render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`}
        />

        {/* Wiederkehrende Kopfzeile ab Seite 2 */}
        <View
          fixed
          style={s.runningHead}
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <>
                <Text style={s.runningText}>
                  {deptName} · {yearText}
                </Text>
                <Text style={s.runningText}>Helferstunden & Jahresbericht</Text>
              </>
            ) : null
          }
        />

        {/* Fusszeile */}
        <View fixed style={s.footerLine} />
        <Image fixed src="/images/cevi-logo.png" style={s.footerLogo} />
        <Text fixed style={[s.footerText, { left: 50, right: 110 }]}>
          {footerText}
        </Text>

        {/* Header */}
        <View style={s.head}>
          {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
          <View style={s.titleGroup}>
            <Text style={s.title}>{deptName}</Text>
            <Text style={s.subtitle}>
              Jahresbericht & Helferstatistik {data.year === 'ALL' ? 'aller Anlässe' : data.year}
            </Text>
            <Text style={[s.subtitle, { fontSize: 7, color: MUTED }]}>
              {filterDesc}
            </Text>
          </View>
          <View style={s.metaRight}>
            <Text style={s.metaLabel}>Stand</Text>
            <Text style={s.metaValue}>{new Date().toLocaleDateString('de-CH')}</Text>
            <Text style={[s.metaLabel, { marginTop: 3 }]}>Anlässe</Text>
            <Text style={s.metaValue}>{data.summary.totalEvents}</Text>
          </View>
        </View>

        {/* Akzent-Balken */}
        <View style={[s.accentBar, { backgroundColor: accent }]} />

        {/* KPI Kacheln */}
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Helferstunden</Text>
            <Text style={s.kpiValue}>{data.summary.totalHours} h</Text>
            <Text style={s.kpiSub}>{data.summary.formattedTime}</Text>
            <Text style={s.kpiDetail}>{data.summary.eventHours}h Anlass / {data.summary.setupHours}h Auf-/Abbau</Text>
          </View>

          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Aktive Helfende</Text>
            <Text style={s.kpiValue}>{data.summary.totalHelpers}</Text>
            <Text style={s.kpiSub}>Ø {data.summary.averageHoursPerHelper} h pro Person</Text>
            <Text style={s.kpiDetail}>in {data.summary.totalEvents} {data.summary.totalEvents === 1 ? 'Anlass' : 'Anlässen'}</Text>
          </View>

          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Besetzungsgrad</Text>
            <Text style={s.kpiValue}>{data.summary.fillRatePct} %</Text>
            <Text style={s.kpiSub}>{data.summary.totalFilledSlots} von {data.summary.totalRequiredSlots} besetzt</Text>
            <Text style={s.kpiDetail}>{data.summary.totalShifts} Schichten gesamt</Text>
          </View>

          <View style={[s.kpiCard, s.kpiCardLast]}>
            <Text style={s.kpiLabel}>Anwesenheit</Text>
            <Text style={s.kpiValue}>{data.summary.attendedRatePct} %</Text>
            <Text style={s.kpiSub}>{data.summary.attendedHours} h bestätigt</Text>
            <Text style={s.kpiDetail}>{data.filter.countAttendedOnly ? 'Filter aktiv' : 'Präsenzquote'}</Text>
          </View>
        </View>

        {/* Podest für die GV */}
        {top3.length === 3 && (
          <View wrap={false} style={{ marginBottom: 10 }}>
            <Text style={s.sectionTitle}>Ehrentafel für die Generalversammlung (GV)</Text>
            <Text style={s.sectionSubtitle}>
              Besonderer Dank an die fleissigsten Helfenden des Jahres für ihren grossartigen Einsatz!
            </Text>

            <View style={s.podestRow}>
              {/* 2. Platz */}
              <View style={[s.podestCard, s.podestCard2]}>
                <Text style={[s.podestBadge, { color: '#64748b' }]}>2. Rang (Silber)</Text>
                <Text style={s.podestName}>{top3[1].ceviName || top3[1].displayName}</Text>
                {top3[1].ceviName && top3[1].firstName && (
                  <Text style={s.podestRealName}>{top3[1].firstName} {top3[1].lastName || ''}</Text>
                )}
                <Text style={[s.podestHours, { color: '#475569' }]}>
                  {top3[1].hours} h ({top3[1].shiftCount} Schichten)
                </Text>
              </View>

              {/* 1. Platz */}
              <View style={[s.podestCard, s.podestCard1]}>
                <Text style={[s.podestBadge, { color: '#b45309' }]}>1. Rang (Gold) 🏆</Text>
                <Text style={[s.podestName, { fontSize: 11 }]}>{top3[0].ceviName || top3[0].displayName}</Text>
                {top3[0].ceviName && top3[0].firstName && (
                  <Text style={s.podestRealName}>{top3[0].firstName} {top3[0].lastName || ''}</Text>
                )}
                <Text style={[s.podestHours, { color: '#b45309' }]}>
                  {top3[0].hours} h ({top3[0].shiftCount} Schichten)
                </Text>
              </View>

              {/* 3. Platz */}
              <View style={[s.podestCard, s.podestCard3]}>
                <Text style={[s.podestBadge, { color: '#c2410c' }]}>3. Rang (Bronze)</Text>
                <Text style={s.podestName}>{top3[2].ceviName || top3[2].displayName}</Text>
                {top3[2].ceviName && top3[2].firstName && (
                  <Text style={s.podestRealName}>{top3[2].firstName} {top3[2].lastName || ''}</Text>
                )}
                <Text style={[s.podestHours, { color: '#c2410c' }]}>
                  {top3[2].hours} h ({top3[2].shiftCount} Schichten)
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Rangliste der Helfenden */}
        <View wrap={false} style={{ marginBottom: 12 }}>
          <Text style={s.sectionTitle}>Rangliste & geleistete Stunden</Text>
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={[s.thCell, { width: 22, textAlign: 'center' }]}>#</Text>
              <Text style={[s.thCell, { flex: 1 }]}>Name / Cevi-Name</Text>
              <Text style={[s.thCell, { width: 110 }]}>Stufen</Text>
              <Text style={[s.thCell, { width: 44, textAlign: 'right' }]}>Anlässe</Text>
              <Text style={[s.thCell, { width: 44, textAlign: 'right' }]}>Schichten</Text>
              <Text style={[s.thCell, { width: 44, textAlign: 'right' }]}>Bestätigt</Text>
              <Text style={[s.thCell, { width: 55, textAlign: 'right' }]}>Stunden</Text>
            </View>

            {helpersList.map((h, i) => (
              <View key={i} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]}>
                <Text style={[s.td, { width: 22, textAlign: 'center', fontWeight: i < 3 ? 700 : 400, color: i === 0 ? '#b45309' : MUTED }]}>
                  {i + 1}
                </Text>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  {h.ceviName ? (
                    <>
                      <Text style={[s.td, { fontWeight: 700, color: INK }]}>«{h.ceviName}»</Text>
                      {h.firstName && (
                        <Text style={[s.td, { fontSize: 6.8, color: MUTED, marginLeft: 3 }]}>
                          ({h.firstName} {h.lastName || ''})
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[s.td, { fontWeight: 600 }]}>{h.displayName}</Text>
                  )}
                  {h.isGuest && <Text style={[s.badge, { marginLeft: 3 }]}>Gast</Text>}
                </View>

                <View style={{ width: 110, flexDirection: 'row', flexWrap: 'wrap' }}>
                  {h.stufen.length > 0 ? (
                    h.stufen.map((st, sIdx) => (
                      <Text key={sIdx} style={s.badge}>
                        {st}
                      </Text>
                    ))
                  ) : (
                    <Text style={[s.td, { color: MUTED, fontSize: 6.8 }]}>-</Text>
                  )}
                </View>

                <Text style={[s.td, { width: 44, textAlign: 'right', color: MUTED }]}>{h.eventCount}</Text>
                <Text style={[s.td, { width: 44, textAlign: 'right', color: MUTED }]}>{h.shiftCount}</Text>
                <Text style={[s.td, { width: 44, textAlign: 'right', fontWeight: 600, color: h.attendedShiftCount > 0 ? '#166534' : MUTED }]}>
                  {h.attendedShiftCount}
                </Text>
                <View style={{ width: 55, alignItems: 'flex-end' }}>
                  <Text style={[s.td, { fontWeight: 700 }]}>{h.hours} h</Text>
                  <Text style={{ fontSize: 6, color: MUTED }}>{h.formattedTime}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Anlässe & Stufen */}
        <View wrap={false} style={{ marginBottom: 10 }}>
          <Text style={s.sectionTitle}>Anlässe des Jahres</Text>
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={[s.thCell, { flex: 1 }]}>Anlass</Text>
              <Text style={[s.thCell, { width: 70 }]}>Datum</Text>
              <Text style={[s.thCell, { width: 48, textAlign: 'right' }]}>Helfende</Text>
              <Text style={[s.thCell, { width: 48, textAlign: 'right' }]}>Schichten</Text>
              <Text style={[s.thCell, { width: 60, textAlign: 'right' }]}>Besetzung</Text>
              <Text style={[s.thCell, { width: 55, textAlign: 'right' }]}>Stunden</Text>
            </View>

            {data.events.map((ev, i) => (
              <View key={ev.id} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]}>
                <Text style={[s.td, { flex: 1, fontWeight: 600 }]}>{ev.title}</Text>
                <Text style={[s.td, { width: 70, color: MUTED, fontSize: 7 }]}>
                  {new Date(ev.startDate).toLocaleDateString('de-CH')}
                </Text>
                <Text style={[s.td, { width: 48, textAlign: 'right', color: MUTED }]}>{ev.helpersCount}</Text>
                <Text style={[s.td, { width: 48, textAlign: 'right', color: MUTED }]}>
                  {ev.filledSlots} / {ev.totalSlots}
                </Text>
                <Text style={[s.td, { width: 60, textAlign: 'right', fontWeight: 600, color: ev.fillRatePct >= 80 ? '#166534' : '#b45309' }]}>
                  {ev.fillRatePct} %
                </Text>
                <View style={{ width: 55, alignItems: 'flex-end' }}>
                  <Text style={[s.td, { fontWeight: 700 }]}>{ev.totalHours} h</Text>
                  <Text style={{ fontSize: 5.8, color: MUTED }}>{ev.eventHours}h / {ev.setupHours}h</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Stufen-Verteilung */}
        {data.stufen.length > 0 && (
          <View wrap={false}>
            <Text style={s.sectionTitle}>Stufen-Beteiligung</Text>
            <View style={s.table}>
              <View style={s.thRow}>
                <Text style={[s.thCell, { flex: 1 }]}>Stufe / Gruppe</Text>
                <Text style={[s.thCell, { width: 60, textAlign: 'right' }]}>Helfende</Text>
                <Text style={[s.thCell, { width: 60, textAlign: 'right' }]}>Schichten</Text>
                <Text style={[s.thCell, { width: 65, textAlign: 'right' }]}>Anteil (%)</Text>
                <Text style={[s.thCell, { width: 65, textAlign: 'right' }]}>Stunden</Text>
              </View>

              {data.stufen.map((st, i) => (
                <View key={st.id} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]}>
                  <Text style={[s.td, { flex: 1, fontWeight: 600 }]}>{st.name}</Text>
                  <Text style={[s.td, { width: 60, textAlign: 'right', color: MUTED }]}>{st.helpersCount}</Text>
                  <Text style={[s.td, { width: 60, textAlign: 'right', color: MUTED }]}>{st.totalShifts}</Text>
                  <Text style={[s.td, { width: 65, textAlign: 'right', fontWeight: 600, color: '#0284c7' }]}>
                    {st.percentageOfTotal} %
                  </Text>
                  <Text style={[s.td, { width: 65, textAlign: 'right', fontWeight: 700 }]}>{st.totalHours} h</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}

/** Erstellt das PDF als Blob und lädt benötigte Schriften */
export async function renderDepartmentStatsPdf(
  data: DepartmentStatsResponseDto,
  department: DepartmentDto | null,
  fontBase = '/fonts/pdf'
): Promise<Blob> {
  registerPdfFonts(fontBase);
  return pdf(
    <DepartmentStatsPdf
      data={data}
      department={department}
      logoUrl={department?.logoUrl}
    />
  ).toBlob();
}
