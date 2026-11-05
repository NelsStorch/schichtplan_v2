import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  DEFAULT_CATERING_TOKEN_ITEMS,
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
  const { eventId, title, mode, cardCount, baseUrl } = params;

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

    await prisma.cateringToken.update({
      where: { id: tokenId },
      data: {
        status: 'REDEEMED',
        redeemedAt: now,
        redeemedByName,
      },
    });
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
export async function generateBatchPdf(
  prisma: PrismaClient,
  params: {
    eventId: string;
    batchId: string;
    baseUrl: string;
  }
): Promise<Buffer> {
  const { eventId, batchId, baseUrl } = params;

  const batch = await prisma.cateringBatch.findFirst({
    where: { id: batchId, eventId },
    include: {
      event: { select: { title: true, slug: true, department: { select: { name: true, slug: true } } } },
      tokens: {
        orderBy: [{ cardNumber: 'asc' }, { title: 'asc' }],
      },
    },
  });

  if (!batch) throw new Error('Tranche nicht gefunden');

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
      Author: 'Cevi Schichtplan',
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
      doc.rect(x, y, w, h);
      doc.lineWidth(0.6);
      doc.dash(3, { space: 3 });
      doc.strokeColor('#94A3B8');
      doc.stroke();
      doc.restore();

      // Kleines Schnitt-Scheren-Symbol in der Ecke
      doc.fontSize(7).fillColor('#94A3B8').text('✂', x + 3, y + 2);

      // Karten-Inhalt mit Innenabstand (Padding 8pt)
      const pad = 10;
      const innerX = x + pad;
      const innerY = y + pad;
      const innerW = w - pad * 2;
      const innerH = h - pad * 2;

      // 1. Kopfzeile: Event-Titel & Tranche / Bon-Nr.
      doc.fontSize(7).fillColor('#64748B').text(
        `${batch.event.department.name.toUpperCase()} · ${batch.title.toUpperCase()}`,
        innerX,
        innerY,
        { width: innerW - 40, ellipsis: true }
      );

      doc.fontSize(8).fillColor('#0F172A').font('Helvetica-Bold').text(
        batch.event.title,
        innerX,
        innerY + 10,
        { width: innerW - 45, ellipsis: true }
      );

      // Bon-Nummer oben rechts
      const cardNumStr = `#${(card.cardNumber ?? i + 1).toString().padStart(3, '0')}`;
      doc.fontSize(8).fillColor('#0F172A').font('Courier-Bold').text(
        cardNumStr,
        innerX + innerW - 40,
        innerY,
        { width: 40, align: 'right' }
      );

      // 2. QR-Code erzeugen (URL für Smartphone-Kamera)
      const scanUrl = `${baseUrl}/events/${batch.event.slug}/bons/scan?code=${card.qrCode}`;
      const qrBuffer = await QRCode.toBuffer(scanUrl, {
        margin: 0,
        errorCorrectionLevel: 'M',
        width: 140,
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      const qrSize = 64;
      const qrX = innerX + innerW - qrSize;
      const qrY = innerY + 22;

      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

      // 3. Gutschein-Inhalt links neben dem QR-Code
      const contentW = innerW - qrSize - 8;
      const contentY = innerY + 24;

      if (batch.mode === 'COMBI') {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0369A1').text('KOMBI-GUTSCHEIN', innerX, contentY);

        let itemY = contentY + 11;
        for (const itemTitle of card.items) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#0F172A').text(
            `• ${itemTitle}`,
            innerX,
            itemY,
            { width: contentW, ellipsis: true }
          );
          itemY += 13;
        }
      } else {
        const singleTitle = card.items[0] || '1x Verpflegung';
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0369A1').text('HELFER-BON', innerX, contentY);

        doc.fontSize(11).font('Helvetica-Bold').fillColor('#0F172A').text(
          singleTitle,
          innerX,
          contentY + 13,
          { width: contentW, ellipsis: true }
        );
      }

      // 4. Fusszeile der Karte
      doc.fontSize(6).font('Helvetica').fillColor('#94A3B8').text(
        'Mit Smartphone-Kamera scannen · Am Feststand vorweisen',
        innerX,
        innerY + innerH - 8,
        { width: innerW }
      );
    }
  }

  doc.end();

  return await new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
