import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  drawBrandedQrPdf,
  drawPdfLogo,
  preparePdfLogo,
  resolveLogo,
  resolveQrPalette,
  type QrStyle,
} from './qrGenerator.js';
import {
  DEFAULT_CATERING_TOKEN_ITEMS,
  getOrganizationByDbType,
  type CateringBatchDto,
  type CateringBatchMode,
  type PhysicalCardScanResultDto,
} from '@schichtplan/shared';

export interface CreateBatchParams {
  eventId: string;
  title?: string;
  mode: CateringBatchMode;
  cardCount: number;
  baseUrl: string;
}

/** Erstellt eine neue Druck-Tranche für physische Bons */
export async function createCateringBatch(
  prisma: PrismaClient,
  params: CreateBatchParams
): Promise<CateringBatchDto> {
  const { eventId, title, mode, cardCount } = params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, cateringTokenItems: true, cateringTokensEnabled: true },
  });
  if (!event) throw new Error('Anlass nicht gefunden');

  const items = (
    event.cateringTokenItems && event.cateringTokenItems.length > 0
      ? event.cateringTokenItems
      : [...DEFAULT_CATERING_TOKEN_ITEMS]
  )
    .map((s) => s.trim())
    .filter(Boolean);

  if (items.length === 0) throw new Error('Keine Gutschein-Artikel für diesen Anlass definiert');

  // Nächste Tranchen-Nummer ermitteln
  const lastBatch = await prisma.cateringBatch.findFirst({
    where: { eventId },
    orderBy: { batchNumber: 'desc' },
    select: { batchNumber: true },
  });
  const batchNumber = (lastBatch?.batchNumber ?? 0) + 1;
  const batchTitle = title?.trim() || `Tranche ${batchNumber}`;

  // Berechne Tokens und Karten
  // In COMBI-Modus: cardCount Karten, jede Karte hat alle Artikel (1 gemeinsamer QR-Code pro Karte)
  // In SINGLE-Modus: cardCount Karten pro Artikel (jede Karte hat 1 QR-Code und 1 Artikel)
  const tokensToCreate: Array<{
    eventId: string;
    batchId: string;
    cardNumber: number;
    qrCode: string;
    isPhysical: boolean;
    title: string;
    status: string;
  }> = [];

  return await prisma.$transaction(async (tx) => {
    let totalCards = 0;
    let totalTokens = 0;

    if (mode === 'COMBI') {
      totalCards = cardCount;
      totalTokens = cardCount * items.length;
    } else {
      // SINGLE: Für jeden Artikel cardCount Karten
      totalCards = cardCount * items.length;
      totalTokens = cardCount * items.length;
    }

    const batch = await tx.cateringBatch.create({
      data: {
        eventId,
        batchNumber,
        title: batchTitle,
        mode,
        cardCount: totalCards,
        tokenCount: totalTokens,
      },
    });

    let currentCardNumber = 1;

    if (mode === 'COMBI') {
      for (let i = 1; i <= cardCount; i++) {
        const qrCode = `pb_${crypto.randomBytes(6).toString('hex')}`;
        for (const itemTitle of items) {
          tokensToCreate.push({
            eventId,
            batchId: batch.id,
            cardNumber: currentCardNumber,
            qrCode,
            isPhysical: true,
            title: itemTitle,
            status: 'AVAILABLE',
          });
        }
        currentCardNumber++;
      }
    } else {
      for (const itemTitle of items) {
        for (let i = 1; i <= cardCount; i++) {
          const qrCode = `pb_${crypto.randomBytes(6).toString('hex')}`;
          tokensToCreate.push({
            eventId,
            batchId: batch.id,
            cardNumber: currentCardNumber,
            qrCode,
            isPhysical: true,
            title: itemTitle,
            status: 'AVAILABLE',
          });
          currentCardNumber++;
        }
      }
    }

    await tx.cateringToken.createMany({ data: tokensToCreate });

    return {
      id: batch.id,
      eventId: batch.eventId,
      batchNumber: batch.batchNumber,
      title: batch.title,
      mode: batch.mode as CateringBatchMode,
      cardCount: batch.cardCount,
      tokenCount: batch.tokenCount,
      isBlocked: batch.isBlocked,
      createdAt: batch.createdAt.toISOString(),
      redeemedTokensCount: 0,
    };
  });
}

/** Ruft alle Tranchen eines Anlasses ab */
export async function getEventCateringBatches(
  prisma: PrismaClient,
  eventId: string
): Promise<CateringBatchDto[]> {
  const batches = await prisma.cateringBatch.findMany({
    where: { eventId },
    orderBy: { batchNumber: 'desc' },
    include: {
      tokens: {
        select: { status: true },
      },
    },
  });

  return batches.map((b) => ({
    id: b.id,
    eventId: b.eventId,
    batchNumber: b.batchNumber,
    title: b.title,
    mode: b.mode as CateringBatchMode,
    cardCount: b.cardCount,
    tokenCount: b.tokenCount,
    isBlocked: b.isBlocked,
    createdAt: b.createdAt.toISOString(),
    redeemedTokensCount: b.tokens.filter((t) => t.status === 'REDEEMED').length,
  }));
}

/** Sperrt oder entsperrt eine Tranche */
export async function toggleBatchBlocked(
  prisma: PrismaClient,
  params: { eventId: string; batchId: string }
): Promise<CateringBatchDto> {
  const batch = await prisma.cateringBatch.findFirst({
    where: { id: params.batchId, eventId: params.eventId },
    include: { tokens: { select: { status: true } } },
  });
  if (!batch) throw new Error('Tranche nicht gefunden');

  const nextBlocked = !batch.isBlocked;
  await prisma.cateringBatch.update({
    where: { id: batch.id },
    data: { isBlocked: nextBlocked },
  });

  return {
    id: batch.id,
    eventId: batch.eventId,
    batchNumber: batch.batchNumber,
    title: batch.title,
    mode: batch.mode as CateringBatchMode,
    cardCount: batch.cardCount,
    tokenCount: batch.tokenCount,
    isBlocked: nextBlocked,
    createdAt: batch.createdAt.toISOString(),
    redeemedTokensCount: batch.tokens.filter((t) => t.status === 'REDEEMED').length,
  };
}

/** Ruft Kartendetails anhand des gescannten QR-Codes ab */
export async function getPhysicalCardByCode(
  prisma: PrismaClient,
  params: { eventId: string; code: string }
): Promise<PhysicalCardScanResultDto | null> {
  const { eventId, code } = params;
  const tokens = await prisma.cateringToken.findMany({
    where: { qrCode: code, eventId },
    include: {
      event: { select: { id: true, title: true } },
      batch: { select: { title: true, batchNumber: true, isBlocked: true, mode: true } },
    },
    orderBy: { title: 'asc' },
  });

  if (tokens.length === 0) return null;

  const first = tokens[0];
  const isBatchBlocked = Boolean(first.batch?.isBlocked);

  return {
    code,
    eventId: first.event?.id ?? eventId,
    eventTitle: first.event?.title ?? 'Anlass',
    batchTitle: first.batch?.title ?? 'Tranche',
    batchNumber: first.batch?.batchNumber ?? 1,
    cardNumber: first.cardNumber,
    mode: (first.batch?.mode as CateringBatchMode) || 'COMBI',
    isBlocked: isBatchBlocked || tokens.every((t) => t.status === 'BLOCKED'),
    items: tokens.map((t) => ({
      id: t.id,
      title: t.title,
      status: (isBatchBlocked ? 'BLOCKED' : t.status) as any,
      redeemedAt: t.redeemedAt?.toISOString() ?? null,
      redeemedByName: t.redeemedByName,
    })),
  };
}

/** Entwertet einzelne oder alle Artikel einer physischen Karte */
export async function redeemPhysicalTokens(
  prisma: PrismaClient,
  params: {
    eventId: string;
    code: string;
    tokenId?: string;
    redeemAll?: boolean;
    redeemedByName: string;
  }
): Promise<PhysicalCardScanResultDto> {
  const { eventId, code, tokenId, redeemAll, redeemedByName } = params;

  const card = await getPhysicalCardByCode(prisma, { eventId, code });
  if (!card) throw new Error('Bon nicht gefunden');
  if (card.isBlocked) throw new Error('Dieser Bon ist gesperrt und kann nicht entwertet werden.');

  const now = new Date();

  if (redeemAll) {
    await prisma.cateringToken.updateMany({
      where: {
        qrCode: code,
        eventId,
        status: 'AVAILABLE',
      },
      data: {
        status: 'REDEEMED',
        redeemedAt: now,
        redeemedByName,
      },
    });
  } else if (tokenId) {
    const target = card.items.find((i) => i.id === tokenId);
    if (!target) throw new Error('Artikel nicht auf diesem Bon vorhanden');
    if (target.status === 'REDEEMED') throw new Error('Dieser Artikel wurde bereits entwertet');
    if (target.status === 'BLOCKED') throw new Error('Dieser Artikel ist gesperrt');

    // Nur entwerten, wenn noch offen: zwei gleichzeitige Scans dürfen denselben Artikel nicht doppelt einlösen
    const { count } = await prisma.cateringToken.updateMany({
      where: { id: tokenId, qrCode: code, eventId, status: 'AVAILABLE' },
      data: {
        status: 'REDEEMED',
        redeemedAt: now,
        redeemedByName,
      },
    });
    if (count === 0) throw new Error('Dieser Artikel wurde bereits entwertet');
  } else {
    throw new Error('Kein Artikel zum Entwerten angegeben');
  }

  const updated = await getPhysicalCardByCode(prisma, { eventId, code });
  if (!updated) throw new Error('Fehler beim Aktualisieren des Bons');
  return updated;
}

/**
 * Generiert ein druckoptimiertes A4-PDF für eine Tranche physischer Bons.
 * - 10 Bons pro A4-Seite (2 Spalten x 5 Zeilen).
 * - Gestrichelte Schnittlinien (✂) mit sauberem Beschnitt.
 * - Hochauflösender QR-Code mit Scan-URL.
 * - Schweizer Rechtschreibung & modernes Cevi-Design.
 */
export interface BatchPdfBranding {
  color?: string | null;
  secondaryColor?: string | null;
  qrStyle?: QrStyle | null;
  logoUrl?: string | null;
}

export async function generateBatchPdf(
  prisma: PrismaClient,
  params: {
    eventId: string;
    batchId: string;
    /** Adresse der Anlass-Seite, z. B. https://illnau.cevi-schichtplan.ch/events/sommerfest */
    eventUrl: string;
    branding?: BatchPdfBranding;
  }
): Promise<Buffer> {
  const { eventId, batchId, eventUrl, branding = {} } = params;

  const batch = await prisma.cateringBatch.findFirst({
    where: { id: batchId, eventId },
    include: {
      event: { select: { title: true, slug: true, department: { select: { name: true, slug: true, organization: true } } } },
      tokens: {
        orderBy: [{ cardNumber: 'asc' }, { title: 'asc' }],
      },
    },
  });

  if (!batch) throw new Error('Tranche nicht gefunden');

  const orgConfig = getOrganizationByDbType(batch.event.department.organization);

  // Gruppiere Tokens nach Karte (über qrCode & cardNumber)
  const cardsMap = new Map<
    string,
    {
      cardNumber: number | null;
      qrCode: string;
      items: string[];
    }
  >();

  for (const token of batch.tokens) {
    if (!token.qrCode) continue;
    let card = cardsMap.get(token.qrCode);
    if (!card) {
      card = {
        cardNumber: token.cardNumber,
        qrCode: token.qrCode,
        items: [],
      };
      cardsMap.set(token.qrCode, card);
    }
    card.items.push(token.title);
  }

  const cards = Array.from(cardsMap.values()).sort(
    (a, b) => (a.cardNumber ?? 0) - (b.cardNumber ?? 0)
  );

  // A4 Dimensionen in PDF-Points: 595.28 x 841.89 pt
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: `${batch.title} – ${batch.event.title}`,
      Author: orgConfig.name,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const pageWidth = 595.28;
  const pageHeight = 841.89;

  // Grid-Konfiguration (2 Spalten x 5 Zeilen = 10 Karten pro Seite)
  const cols = 2;
  const rows = 5;
  const cardsPerPage = cols * rows;

  const marginX = 22;
  const marginY = 28;
  const usableWidth = pageWidth - marginX * 2;
  const usableHeight = pageHeight - marginY * 2;

  const colWidth = usableWidth / cols;
  const rowHeight = usableHeight / rows;

  const totalPages = Math.ceil(cards.length / cardsPerPage);

  // Gleiches Design wie der Check-in-Aushang: Abteilungsfarben, QR-Stil und Logo in der Mitte
  const palette = resolveQrPalette(branding.color, branding.secondaryColor, branding.qrStyle);
  const logo = preparePdfLogo(doc, await resolveLogo(branding.logoUrl, prisma, batch.event.department.organization));
  const accent = palette.isTwoTone ? palette.secondary : palette.primary;
  const label = batch.mode === 'COMBI' ? 'KOMBI-GUTSCHEIN' : 'HELFER-BON';
  const departmentLine = `${batch.event.department.name} · ${batch.title}`.toUpperCase();

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) doc.addPage();

    const pageCards = cards.slice(pageIdx * cardsPerPage, (pageIdx + 1) * cardsPerPage);

    for (let i = 0; i < pageCards.length; i++) {
      const card = pageCards[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      const x = marginX + col * colWidth;
      const y = marginY + row * rowHeight;
      const w = colWidth;
      const h = rowHeight;

      // Gestrichelter Schnittrahmen
      doc.save();
      doc.rect(x, y, w, h).lineWidth(0.6).dash(3, { space: 3 }).strokeColor('#94A3B8').stroke();
      doc.restore();

      // Karte mit Innenabstand
      const pad = 10;
      const cx = x + pad;
      const cy = y + pad;
      const cw = w - pad * 2;
      const ch = h - pad * 2;

      doc.save();
      doc.roundedRect(cx, cy, cw, ch, 8).lineWidth(0.8).fillAndStroke('#ffffff', '#E5E7EB');
      doc.restore();

      // Akzentleiste oben (Verlauf bei zwei Farben)
      doc.save();
      doc.roundedRect(cx, cy, cw, ch, 8).clip();
      if (palette.isTwoTone) {
        const grad = doc.linearGradient(cx, 0, cx + cw, 0);
        grad.stop(0, palette.primary).stop(1, palette.secondary);
        doc.rect(cx, cy, cw, 4).fill(grad);
      } else {
        doc.rect(cx, cy, cw, 4).fill(palette.primary);
      }
      doc.restore();

      const qrSize = 96;
      const ip = 9;
      const ix = cx + ip;
      const iy = cy + 4 + ip;
      const iw = cw - ip * 2;
      const qrX = cx + cw - ip - qrSize;
      const qrY = cy + ch - ip - qrSize;
      const textW = qrX - ix - 10;

      // Kopf: Logo, Abteilung/Tranche, Anlass, Bon-Nummer
      const headerLogo = 18;
      drawPdfLogo(doc, logo, ix, iy, headerLogo);
      const headX = ix + headerLogo + 6;
      const numberW = 34;
      const headW = iw - headerLogo - 6 - numberW - 4;
      doc
        .font('Helvetica-Bold')
        .fontSize(6)
        .fillColor('#6B7280')
        .text(departmentLine, headX, iy + 1, { width: headW, lineBreak: false, ellipsis: true });
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#111827')
        .text(batch.event.title, headX, iy + 8.5, { width: headW, lineBreak: false, ellipsis: true });
      doc
        .font('Courier-Bold')
        .fontSize(8.5)
        .fillColor('#111827')
        .text(`#${(card.cardNumber ?? i + 1).toString().padStart(3, '0')}`, ix + iw - numberW, iy + 1, {
          width: numberW,
          align: 'right',
          lineBreak: false,
        });

      // Gutschein-Inhalt links vom QR-Code
      let ty = iy + headerLogo + 9;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(accent).text(label, ix, ty, {
        width: textW,
        characterSpacing: 0.6,
        lineBreak: false,
      });
      ty += 12;

      const maxLines = 4;
      const items = card.items.length > maxLines ? card.items.slice(0, maxLines - 1) : card.items;
      const itemSize = batch.mode === 'COMBI' ? (items.length > 2 ? 9.5 : 11) : 13;
      for (const itemTitle of items) {
        doc.circle(ix + 2.5, ty + itemSize * 0.42, 2.2).fill(palette.primary);
        doc
          .font('Helvetica-Bold')
          .fontSize(itemSize)
          .fillColor('#111827')
          .text(itemTitle, ix + 9, ty, { width: textW - 9, lineBreak: false, ellipsis: true });
        ty += itemSize + 5;
      }
      if (card.items.length > maxLines) {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#6B7280')
          .text(`+ ${card.items.length - items.length} weitere`, ix + 9, ty, { width: textW - 9, lineBreak: false });
      }

      // Hinweis unten links
      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor('#9CA3AF')
        .text('Am Stand vorweisen und scannen lassen', ix, cy + ch - ip - 7, {
          width: textW,
          lineBreak: false,
          ellipsis: true,
        });

      // QR-Code im Abteilungsdesign
      drawBrandedQrPdf(doc, {
        text: `${eventUrl}/bons/scan?code=${encodeURIComponent(card.qrCode)}`,
        x: qrX,
        y: qrY,
        size: qrSize,
        palette,
        logo,
        // Der Bon-Code ist kleiner und dichter als der Check-in-Aushang: kleinere Plakette, damit er sicher scannt
        badgeRatio: 0.16,
      });
    }
  }

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.end();
  return done;
}
