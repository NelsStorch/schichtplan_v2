import { evaluateContrast, getOrganization, getOrganizationByDbType, type ContrastEvaluation, type OrganizationType } from '@schichtplan/shared';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { PrismaClient } from '../db.js';
import {
  CEVI_LOGO_PATH_RED,
  CEVI_LOGO_PATH_BLUE,
  PFADI_LOGO_PATH_GREEN,
  PFADI_LOGO_PATH_ORANGE,
  PFADI_LOGO_PATH_NAVY,
  PFADI_LOGO_PATH_YELLOW,
  drawCeviLogoVector,
  drawPfadiLogoVector,
  drawVereinLogoVector,
  drawJublaLogoVector,
  renderOrgLogoSvg,
} from './brandLogos.js';

export {
  CEVI_LOGO_PATH_RED,
  CEVI_LOGO_PATH_BLUE,
  PFADI_LOGO_PATH_GREEN,
  PFADI_LOGO_PATH_ORANGE,
  PFADI_LOGO_PATH_NAVY,
  PFADI_LOGO_PATH_YELLOW,
  drawCeviLogoVector,
  drawPfadiLogoVector,
  drawVereinLogoVector,
  drawJublaLogoVector,
  renderOrgLogoSvg,
};

export interface ResolvedLogo {
  buffer?: Buffer;
  mimeType?: string;
  isCeviDefault: boolean;
  organization?: OrganizationType;
}

/**
 * Prüft, ob ein QR-Modul zu einem der drei Finder Patterns (Positions-Ecken) gehört.
 */
export function isFinderPattern(r: number, c: number, n: number): boolean {
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
}

/**
 * Holt ein Abteilungslogo (aus der Datenbank wenn /api/uploads/...,
 * oder Fallback auf das Verbands-Logo).
 * Externe HTTP-Aufrufe sind aus Sicherheitsgründen (SSRF-Schutz) deaktiviert;
 * es werden ausschliesslich auf dem Server hochgeladene Abteilungslogos verwendet.
 */
export async function resolveLogo(
  logoUrl?: string | null,
  prisma?: PrismaClient,
  organization?: OrganizationType
): Promise<ResolvedLogo> {
  const isCeviDefault = organization === 'CEVI' || !organization;
  if (!logoUrl) {
    return { isCeviDefault, organization };
  }

  // Lokaler Upload in der Datenbank
  const uploadMatch = logoUrl.match(/\/api\/uploads\/([0-9a-fA-F-]+)/);
  if (uploadMatch && prisma) {
    try {
      const upload = await prisma.upload.findUnique({ where: { id: uploadMatch[1] } });
      if (upload) {
        return {
          buffer: Buffer.from(upload.data),
          mimeType: upload.mimeType,
          isCeviDefault: false,
          organization,
        };
      }
    } catch {
      // Fallback
    }
  }

  return { isCeviDefault, organization };
}

export type QrStyle = 'CORNERS' | 'GRADIENT' | 'SOLID';

/** Druckfarben eines QR-Codes (kontrastsicher) und ob er zweifarbig gezeichnet wird */
export interface QrPalette {
  primary: string;
  secondary: string;
  style: QrStyle;
  isTwoTone: boolean;
}

export function resolveQrPalette(
  color?: string | null,
  secondaryColor?: string | null,
  qrStyle?: QrStyle | null
): QrPalette {
  const primary = evaluateContrast(color).qrSafeHex;
  const hasSecondary = Boolean(secondaryColor?.trim());
  const secondary = hasSecondary ? evaluateContrast(secondaryColor).qrSafeHex : primary;
  const style = qrStyle || (hasSecondary ? 'CORNERS' : 'SOLID');
  return { primary, secondary, style, isTwoTone: hasSecondary && secondary !== primary && style !== 'SOLID' };
}

/** Logo einmal ins PDF laden und danach beliebig oft zeichnen (sonst wird es pro Bon neu eingebettet) */
export interface PdfLogo {
  image: unknown | null;
  organization?: OrganizationType;
}

export function preparePdfLogo(doc: PDFKit.PDFDocument, logo: ResolvedLogo): PdfLogo {
  const organization = logo.organization;
  if (logo.isCeviDefault || !logo.buffer || !logo.mimeType) return { image: null, organization };
  if (!logo.mimeType.includes('png') && !logo.mimeType.includes('jpeg')) return { image: null, organization };
  try {
    return { image: (doc as unknown as { openImage(src: Buffer): unknown }).openImage(logo.buffer), organization };
  } catch {
    return { image: null, organization };
  }
}

export function drawPdfLogo(doc: PDFKit.PDFDocument, logo: PdfLogo, x: number, y: number, size: number) {
  if (logo.image) {
    try {
      doc.image(logo.image as Buffer, x, y, { fit: [size, size], align: 'center', valign: 'center' });
      return;
    } catch {
      // Fallback
    }
  }
  const org = logo.organization || 'CEVI';
  if (org === 'CEVI') {
    drawCeviLogoVector(doc, x, y, size);
  } else if (org === 'PFADI') {
    drawPfadiLogoVector(doc, x, y, size);
  } else if (org === 'JUBLA') {
    drawJublaLogoVector(doc, x, y, size);
  } else if (org === 'OTHER') {
    drawVereinLogoVector(doc, x, y, size);
  }
}

/**
 * Zeichnet einen QR-Code im Abteilungsdesign direkt ins PDF: Abteilungsfarben (Ecken, Verlauf oder
 * einfarbig), Plakette mit Logo in der Mitte und Fehlerkorrektur H. Gleiches Design wie der
 * Check-in-Aushang.
 */
export function drawBrandedQrPdf(
  doc: PDFKit.PDFDocument,
  options: {
    text: string;
    x: number;
    y: number;
    size: number;
    palette: QrPalette;
    logo: PdfLogo;
    /** Anteil der Logo-Plakette an der Kantenlänge (Standard 0.24 wie beim Check-in-Aushang) */
    badgeRatio?: number;
  }
) {
  const { text, x, y, size, palette, logo, badgeRatio = 0.24 } = options;
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const m = size / n;

  let badgeModules = Math.round(n * badgeRatio);
  if ((n - badgeModules) % 2 !== 0) badgeModules += 1;
  const badgeStart = (n - badgeModules) / 2;
  const badgeEnd = badgeStart + badgeModules;

  const corners = palette.isTwoTone && palette.style === 'CORNERS';
  const gradient = palette.isTwoTone && palette.style === 'GRADIENT';

  // Alle Module einer Farbe als ein Pfad: deutlich kleineres PDF als ein Füllbefehl pro Modul
  const drawModules = (wanted: (r: number, c: number) => boolean) => {
    let any = false;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (r >= badgeStart && r < badgeEnd && c >= badgeStart && c < badgeEnd) continue;
        if (!qr.modules.get(r, c) || !wanted(r, c)) continue;
        doc.rect(x + c * m, y + r * m, m, m);
        any = true;
      }
    }
    return any;
  };

  if (gradient) {
    const grad = doc.linearGradient(x, y, x + size, y + size);
    grad.stop(0, palette.primary).stop(1, palette.secondary);
    if (drawModules(() => true)) doc.fill(grad);
  } else {
    if (drawModules((r, c) => !(corners && isFinderPattern(r, c, n)))) doc.fill(palette.primary);
    if (corners && drawModules((r, c) => isFinderPattern(r, c, n))) doc.fill(palette.secondary);
  }

  const badgePt = badgeModules * m;
  const badgeX = x + badgeStart * m;
  const badgeY = y + badgeStart * m;
  const border = palette.isTwoTone ? palette.secondary : palette.primary;
  const gap = Math.max(0.6, m * 0.4);
  doc.save();
  doc
    .lineWidth(Math.max(0.5, m * 0.15))
    .roundedRect(badgeX - gap, badgeY - gap, badgePt + gap * 2, badgePt + gap * 2, Math.max(2, m * 1.2))
    .fillAndStroke('#ffffff', border);
  doc.restore();

  const pad = badgePt * 0.12;
  drawPdfLogo(doc, logo, badgeX + pad, badgeY + pad, badgePt - pad * 2);
}

export interface QrOptions {
  text: string;
  title?: string;
  subtitle?: string;
  departmentName?: string;
  color?: string | null;
  secondaryColor?: string | null;
  qrStyle?: 'CORNERS' | 'GRADIENT' | 'SOLID' | null;
  logoUrl?: string | null;
  checkinEarlyMinutes?: number;
  checkinLateMinutes?: number;
  prisma?: PrismaClient;
  organization?: OrganizationType;
}

/**
 * Erzeugt einen QR-Code als SVG-String mit:
 * - Ein- oder zweifarbigem Design (Ecken, Farbverlauf oder einfarbig)
 * - Zentrierter Plakette mit Abteilungslogo (oder Verbands-Logo)
 * - Level H Fehlerkorrektur (höchste Scan-Sicherheit)
 */
export async function generateQrSvg(options: QrOptions): Promise<string> {
  const primaryContrast: ContrastEvaluation = evaluateContrast(options.color);
  const primaryQrColor = primaryContrast.qrSafeHex;

  const hasSecondary = Boolean(options.secondaryColor?.trim());
  const secondaryContrast = hasSecondary ? evaluateContrast(options.secondaryColor) : primaryContrast;
  const secondaryQrColor = secondaryContrast.qrSafeHex;

  const style = options.qrStyle || (hasSecondary ? 'CORNERS' : 'SOLID');
  const isTwoTone = hasSecondary && secondaryQrColor !== primaryQrColor && style !== 'SOLID';

  const orgType: OrganizationType = options.organization ?? getOrganization(options.text).dbType;
  const logo = await resolveLogo(options.logoUrl, options.prisma, orgType);

  const qr = QRCode.create(options.text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const quietZone = 2;
  const total = n + quietZone * 2;

  // Plakettengrösse: ca. 24% der Module
  let badgeModules = Math.round(n * 0.24);
  if ((n - badgeModules) % 2 !== 0) badgeModules += 1;
  const badgeStart = (n - badgeModules) / 2;
  const badgeEnd = badgeStart + badgeModules;

  let bodyPaths = '';
  let cornerPaths = '';

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      // Zentrum aussparen für Plakette
      if (r >= badgeStart && r < badgeEnd && c >= badgeStart && c < badgeEnd) {
        continue;
      }
      if (qr.modules.get(r, c)) {
        const x = c + quietZone;
        const y = r + quietZone;
        const p = `M${x} ${y}h1v1h-1z `;
        if (isTwoTone && style === 'CORNERS' && isFinderPattern(r, c, n)) {
          cornerPaths += p;
        } else {
          bodyPaths += p;
        }
      }
    }
  }

  const badgeX = badgeStart + quietZone;
  const badgeY = badgeStart + quietZone;
  const badgePad = badgeModules * 0.12;
  const logoX = badgeX + badgePad;
  const logoY = badgeY + badgePad;
  const logoSize = badgeModules - badgePad * 2;

  let logoSvg = '';
  if (logo.buffer && logo.mimeType) {
    const dataUri = `data:${logo.mimeType};base64,${logo.buffer.toString('base64')}`;
    logoSvg = `<image href="${dataUri}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" />`;
  } else {
    logoSvg = renderOrgLogoSvg(orgType, logoX, logoY, logoSize);
  }

  let defs = '';
  let bodyFill = primaryQrColor;
  let strokeColor = primaryQrColor;

  if (isTwoTone && style === 'GRADIENT') {
    defs = `<defs>
      <linearGradient id="qr-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primaryQrColor}" />
        <stop offset="100%" stop-color="${secondaryQrColor}" />
      </linearGradient>
    </defs>`;
    bodyFill = 'url(#qr-grad)';
    strokeColor = secondaryQrColor;
  } else if (isTwoTone && style === 'CORNERS') {
    strokeColor = secondaryQrColor;
  }

  const cornerSvg = cornerPaths ? `<path fill="${secondaryQrColor}" d="${cornerPaths.trim()}" />` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">
  ${defs}
  <rect width="${total}" height="${total}" fill="#ffffff" />
  <path fill="${bodyFill}" d="${bodyPaths.trim()}" />
  ${cornerSvg}
  <rect x="${badgeX - 0.2}" y="${badgeY - 0.2}" width="${badgeModules + 0.4}" height="${badgeModules + 0.4}" rx="1.2" fill="#ffffff" stroke="${strokeColor}" stroke-width="0.15" />
  ${logoSvg}
</svg>`;
}

/**
 * Erzeugt einen sauberen, hochauflösenden A4-Check-in-Aushang als PDF-Dokument.
 * Im modernen Schweizer Plakat-Design (Bento-Struktur, grosser QR-Code, nummerierte Schritte).
 */
export async function generateCheckinPdf(options: QrOptions): Promise<Buffer> {
  const palette = resolveQrPalette(options.color, options.secondaryColor, options.qrStyle);
  const { primary: primaryColor, secondary: secondaryColor, isTwoTone } = palette;

  const footerOrg = options.organization ? getOrganizationByDbType(options.organization) : getOrganization(options.text);
  const logo = await resolveLogo(options.logoUrl, options.prisma, footerOrg.dbType);

  return new Promise((resolve, reject) => {
    // A4: 595.28 x 841.89 pt
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: options.title || 'Helfer-Check-in', Author: footerOrg.name } });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // 1. Akzentleiste ganz oben (Gradient bei Zweifarbigkeit)
    if (isTwoTone) {
      const topGrad = doc.linearGradient(0, 0, 595.28, 0);
      topGrad.stop(0, primaryColor).stop(1, secondaryColor);
      doc.rect(0, 0, 595.28, 10).fill(topGrad);
    } else {
      doc.rect(0, 0, 595.28, 10).fill(primaryColor);
    }

    // 2. Kopfbereich
    const deptName = options.departmentName || footerOrg.name;
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor('#6b7280')
      .text(`${footerOrg.name.toUpperCase()}  ·  OFFIZIELLER HELFER-AUSHANG`, 40, 36);

    doc
      .font('Helvetica')
      .fontSize(13)
      .fillColor('#374151')
      .text(deptName, 40, 52);

    const title = options.title || 'Helfer-Check-in';
    doc
      .font('Helvetica-Bold')
      .fontSize(26)
      .fillColor('#111827')
      .text(title, 40, 70, { width: 450 });

    const earlyMin = options.checkinEarlyMinutes ?? 30;
    const lateMin = options.checkinLateMinutes ?? 30;
    const defaultSubtitle =
      lateMin > 0
        ? `Anwesenheit erfassen: Scann den QR-Code ${earlyMin > 0 ? `ab ${earlyMin} Min. vor` : 'ab'} Beginn bis ${lateMin} Min. nach deiner Schicht.`
        : 'Anwesenheit erfassen: Scann den QR-Code vor Beginn deiner Schicht.';
    const subtitle = options.subtitle && !options.subtitle.startsWith('Anwesenheit:') ? options.subtitle : defaultSubtitle;
    doc
      .font('Helvetica')
      .fontSize(11.5)
      .fillColor('#4b5563')
      .text(subtitle, 40, 104, { width: 460 });

    // Logo oben rechts
    const pdfLogo = preparePdfLogo(doc, logo);
    drawPdfLogo(doc, pdfLogo, 512, 40, 42);

    // Trennlinie
    doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, 126).lineTo(555, 126).stroke();

    // 3. Hero Card für den QR-Code (gross und aufgeräumt)
    const cardY = 138;
    const cardH = 358;
    doc
      .roundedRect(40, cardY, 515.28, cardH, 14)
      .fillAndStroke('#ffffff', '#e5e7eb');

    const badgeLabelColor = isTwoTone ? secondaryColor : primaryColor;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(badgeLabelColor)
      .text('QR-CODE SCANNEN ZUM EINCHECKEN', 40, cardY + 16, { align: 'center', width: 515.28 });

    // QR-Code im Zentrum
    const qrPixelSize = 256;
    drawBrandedQrPdf(doc, {
      text: options.text,
      x: (595.28 - qrPixelSize) / 2,
      y: cardY + 38,
      size: qrPixelSize,
      palette,
      logo: pdfLogo,
    });

    // URL unter dem QR-Code
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#9ca3af')
      .text(options.text, 40, cardY + cardH - 24, { align: 'center', width: 515.28 });

    // 4. Drei Bento-Schritte zur Anleitung
    const stepsY = 512;
    const stepH = 134;
    const colW = (515.28 - 2 * 14) / 3;
    const steps = [
      {
        n: '1',
        title: 'Kamera öffnen',
        text: 'Smartphone-Kamera oder QR-Scanner auf den Code richten und den Link öffnen.',
      },
      {
        n: '2',
        title: 'Bestätigen',
        text: `Mit deinem ${footerOrg.name}-Konto anmelden oder als Gast deinen Namen bestätigen.`,
      },
      {
        n: '3',
        title: 'Eingecheckt!',
        text: 'Deine Anwesenheit wird sofort erfasst. Du bist für deinen Helfereinsatz startklar!',
      },
    ];

    steps.forEach((s, i) => {
      const colX = 40 + i * (colW + 14);
      doc
        .roundedRect(colX, stepsY, colW, stepH, 10)
        .fillAndStroke('#f9fafb', '#e5e7eb');

      // Nummernbadge im Schritt
      const badgeFill = i === 1 && isTwoTone ? secondaryColor : primaryColor;
      doc.circle(colX + 22, stepsY + 22, 11).fill(badgeFill);
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#ffffff')
        .text(s.n, colX + 11, stepsY + 17, { width: 22, align: 'center' });

      doc
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .fillColor('#111827')
        .text(s.title, colX + 42, stepsY + 16, { width: colW - 50 });

      doc
        .font('Helvetica')
        .fontSize(9.5)
        .lineGap(2.5)
        .fillColor('#4b5563')
        .text(s.text, colX + 14, stepsY + 44, { width: colW - 28 });
    });

    // 5. Zeitfenster-Infobox
    const earlyText = earlyMin === 0 ? 'bei Schichtbeginn' : `${earlyMin} Minuten vor deinem Schichtbeginn`;
    const lateText = lateMin === 0 ? 'bis zum Schichtende' : `bis ${lateMin} Minuten nach deinem Schichtende`;
    const windowText = `Der Selbst-Check-in öffnet jeweils ${earlyText} und bleibt ${lateText} aktiv.`;

    const noticeY = 660;
    doc
      .roundedRect(40, noticeY, 515.28, 54, 8)
      .fillAndStroke('#f0fdf4', '#bbf7d0');

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#166534')
      .text('ZEITFENSTER FÜR DEN CHECK-IN', 56, noticeY + 12);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#15803d')
      .text(
        windowText,
        56,
        noticeY + 28,
        { width: 480 }
      );

    // 6. Fusszeile
    doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, 730).lineTo(555, 730).stroke();
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#9ca3af')
      .text(
        // Verband aus der Adresse im QR-Code (illnau.pfadi-schichtplan.ch -> Pfadi Schichtplan)
        `${footerOrg.name} · ${footerOrg.domain}`,
        40,
        742,
        { align: 'center', width: 515.28 }
      );

    doc.end();
  });
}
