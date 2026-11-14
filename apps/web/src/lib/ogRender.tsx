import { ImageResponse } from 'next/og';
import QRCode from 'qrcode';
import { formatZurichDateRange, formatZurichShiftWhen, getOrganization } from '@schichtplan/shared';
import {
  OgCard,
  OgStory,
  STORY_SIZE,
  cachedOgImage,
  getRequestOrigin,
  loadBrandLogo,
  loadImage,
  ogImageOptions,
  ogVersion,
  safeAccent,
} from '@schichtplan/ui/og';
import { getDepartmentPreview, getEventPreview, isUuid, openSlotsLabel, type EventPreview } from './og';

/**
 * Vorschaubilder der Web-App an einem Ort: von den Routen (`/og`, `/events/[slug]/og`, `/events/[slug]/story`)
 * ausgeliefert und beim Erzeugen der Metadaten vorab gerendert («aufgewärmt»). So liegt das Bild schon im
 * Speicher, wenn WhatsApp es kurz nach der Seite abholt.
 *
 * Der Cache-Schlüssel enthält einen Fingerabdruck des Inhalts: Ändert sich Titel, Banner oder die Zahl freier
 * Plätze, gilt sofort ein neues Bild. Alte Einträge fallen nach Ablauf oder wenn der Cache voll ist (100) heraus.
 */
const TTL = 6 * 60 * 60 * 1000;

export async function departmentOgResponse(): Promise<Response> {
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  const department = await getDepartmentPreview();
  const key = `${host}:dept:${ogVersion(department?.name, department?.logoUrl, department?.primaryColor)}`;
  return cachedOgImage(key, TTL, async () => {
    const logo = (await loadImage(department?.logoUrl, origin)) ?? (await loadBrandLogo(host));
    return new ImageResponse(
      <OgCard
        logo={logo}
        accent={safeAccent(department?.primaryColor ?? org.primaryColor)}
        title={department?.name ?? org.name}
        subtitle="Schicht aussuchen, eintragen, fertig."
        eyebrow={org.name}
        host={host}
      />,
      await ogImageOptions()
    );
  });
}

/** Ob ein Schicht-Link als «Ersatz gesucht» gezeigt wird: nur wenn wirklich jemand Ersatz sucht */
export function isReplacementPreview(event: EventPreview, wantsReplacement: boolean): boolean {
  return Boolean(wantsReplacement && event.shift && event.shift.replacementWanted > 0);
}

function eventVersion(event: EventPreview, department: Awaited<ReturnType<typeof getDepartmentPreview>>, extra = '') {
  const s = event.shift;
  return ogVersion(
    event.title,
    event.startDate,
    event.endDate,
    event.openSlots,
    event.logoUrl,
    event.bannerUrl,
    s?.id,
    s?.title,
    s?.startTime,
    s?.endTime,
    s?.openSlots,
    s?.replacementWanted,
    department?.name,
    department?.logoUrl,
    department?.primaryColor,
    extra
  );
}

/** Bilder laden; alle Anfrage-Daten (Host, Abteilung) kommen von aussen, weil das Rendern im Hintergrund nach der Anfrage laufen kann */
async function eventImages(
  event: EventPreview,
  department: Awaited<ReturnType<typeof getDepartmentPreview>>,
  origin: string,
  host: string
) {
  const [background, logo] = await Promise.all([
    loadImage(event.bannerUrl, origin),
    (async () =>
      (await loadImage(event.logoUrl, origin)) ??
      (await loadImage(department?.logoUrl, origin)) ??
      (await loadBrandLogo(host)))(),
  ]);
  return { department, background, logo };
}

/**
 * Vorschaubild eines Anlasses, mit `shiftId` einer Schicht, mit `wantsReplacement` als «Ersatz gesucht».
 * null, wenn das Backend keine Vorschau liefert (Entwurf, interner Anlass einer Abteilung «nur für Mitglieder»).
 */
export async function eventOgResponse(
  slug: string,
  shiftParam: string | null,
  wantsReplacement = false
): Promise<Response | null> {
  const shiftId = shiftParam && isUuid(shiftParam) ? shiftParam : null;
  const [{ origin, host }, event, department] = await Promise.all([
    getRequestOrigin(),
    getEventPreview(slug, shiftId),
    getDepartmentPreview(),
  ]);
  if (!event || (shiftId && !event.shift)) return null;
  const org = getOrganization(host);
  const replacement = isReplacementPreview(event, wantsReplacement);
  const key = `${host}:event:${event.slug}:${eventVersion(event, department, replacement ? 'ersatz' : '')}`;

  return cachedOgImage(key, TTL, async () => {
    const images = await eventImages(event, department, origin, host);
    const accent = safeAccent(images.department?.primaryColor ?? org.primaryColor);
    const shift = shiftId ? event.shift : null;
    const card = shift ? (
      <OgCard
        logo={images.logo}
        accent={accent}
        background={images.background}
        title={shift.title}
        subtitle={`${formatZurichShiftWhen(shift.startTime, shift.endTime)} · ${event.title}`}
        badge={replacement ? 'Ersatz gesucht' : openSlotsLabel(shift.openSlots, 'Schicht ist besetzt')}
        eyebrow={images.department?.name ?? org.name}
        host={host}
      />
    ) : (
      <OgCard
        logo={images.logo}
        accent={accent}
        background={images.background}
        title={event.title}
        subtitle={[formatZurichDateRange(event.startDate, event.endDate, event.dayCutoffTime), images.department?.name]
          .filter(Boolean)
          .join(' · ')}
        badge={openSlotsLabel(event.openSlots)}
        eyebrow={org.name}
        host={host}
      />
    );
    return new ImageResponse(card, await ogImageOptions());
  });
}

/** Hochformat-Bild (Instagram-Story, WhatsApp-Status) eines Anlasses mit QR-Code zur Anlass-Seite */
export async function eventStoryResponse(slug: string): Promise<Response | null> {
  const [{ origin, host }, event, department] = await Promise.all([
    getRequestOrigin(),
    getEventPreview(slug),
    getDepartmentPreview(),
  ]);
  if (!event) return null;
  const org = getOrganization(host);
  const key = `${host}:story:${event.slug}:${eventVersion(event, department)}`;
  return cachedOgImage(key, TTL, async () => {
    const images = await eventImages(event, department, origin, host);
    const url = `${origin}/events/${encodeURIComponent(event.slug)}`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    const qr = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return new ImageResponse(
      <OgStory
        logo={images.logo}
        accent={safeAccent(images.department?.primaryColor ?? org.primaryColor)}
        background={images.background}
        title={event.title}
        subtitle={formatZurichDateRange(event.startDate, event.endDate, event.dayCutoffTime)}
        badge={openSlotsLabel(event.openSlots)}
        eyebrow={images.department?.name ?? org.name}
        qr={qr}
        host={host}
      />,
      { ...(await ogImageOptions()), ...STORY_SIZE }
    );
  });
}

/** Bild im Hintergrund vorbereiten, ohne auf das Ergebnis zu warten (Fehler sind hier egal) */
export function warmOgImage(render: () => Promise<Response | null>): void {
  void render().catch(() => undefined);
}
