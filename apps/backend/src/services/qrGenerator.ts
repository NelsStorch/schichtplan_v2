import { evaluateContrast, type ContrastEvaluation } from '@schichtplan/shared';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { PrismaClient } from '../db.js';

export const CEVI_LOGO_PATH_RED =
  'M 321.69737,357.21491 C 287.28947,367.10965 252.80263,373.24123 220.24561,375.68421 L 342.04386,497.30702 L 385.28509,335.97368 C 366.14474,343.46491 345.02631,350.50439 321.69737,357.21491 z M 430.11403,155.98684 C 385.74123,184.9693 331.41228,209.90351 280.88158,224.43421 C 211.38596,244.41667 140.64474,250.60526 86.609649,241.46491 L 4.0745614,159.05263 L 462.29824,35.894737 L 430.11403,155.98684 z';

export const CEVI_LOGO_PATH_BLUE =
  'M 6.6710526,190.96053 C 6.0394737,188.60965 5.6622807,186.18421 5.4342105,183.72807 L 54.574561,232.79825 C 28.008772,223.31579 11.5,208.97807 6.6710526,190.96053 z M 497.38596,242.87719 C 462.67105,285.34649 407.07017,315.84649 317.23246,341.68421 C 225.59649,368.0307 134.16667,367.2193 84.307017,339.60965 C 66.763158,329.89035 55.763158,317.63596 51.614035,303.18421 L 25.328947,237.97807 C 26.320175,238.57456 27.307017,239.1886 28.289474,239.73246 C 82.078947,269.52193 183.01754,269.74123 285.43421,240.28947 C 367.38158,216.72368 453.30702,169.02632 497.38158,123.0307 L 497.38158,242.87719 L 497.38596,242.87719 z M 342.04386,51.662281 L 21.991228,137.16667 C 54.93421,90.149123 132.27193,43.894737 221.70614,18.179825 C 246.83333,10.95614 302.99561,1.881579 342.04386,3.3333334 L 342.04386,51.662281 z';

export interface ResolvedLogo {
  buffer?: Buffer;
  mimeType?: string;
  isCeviDefault: boolean;
}

/**
 * Holt ein Abteilungslogo (aus der Datenbank wenn /api/uploads/..., per HTTP wenn URL,
 * oder Fallback auf das Standard-Cevi-Logo).
 */
export async function resolveLogo(
  logoUrl?: string | null,
  prisma?: PrismaClient
): Promise<ResolvedLogo> {
  if (!logoUrl) {
    return { isCeviDefault: true };
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
        };
      }
    } catch {
      // Fallback
    }
  }

  // Externe Bild-URL (z. B. auf abteilungseigener Webseite)
  if (/^https?:\/\//i.test(logoUrl)) {
    try {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const mimeType = res.headers.get('content-type') || 'image/png';
        const buffer = Buffer.from(await res.arrayBuffer());
        return { buffer, mimeType, isCeviDefault: false };
      }
    } catch {
      // Fallback
    }
  }

  return { isCeviDefault: true };
}

export interface QrOptions {
  text: string;
  title?: string;
  subtitle?: string;
  departmentName?: string;
  color?: string | null;
  logoUrl?: string | null;
  prisma?: PrismaClient;
}

/**
 * Erzeugt einen QR-Code als SVG-String mit:
 * - Abteilungsfarbe (mit automatischem Kontrast-Schutz gegen Weiss)
 * - Zentrierter Plakette mit Abteilungslogo (oder Cevi-Logo)
 * - Level H Fehlerkorrektur (höchste Scan-Sicherheit)
 */
export async function generateQrSvg(options: QrOptions): Promise<string> {
  const contrast: ContrastEvaluation = evaluateContrast(options.color);
  const qrColor = contrast.qrSafeHex;
  const logo = await resolveLogo(options.logoUrl, options.prisma);

  const qr = QRCode.create(options.text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const quietZone = 2;
  const total = n + quietZone * 2;

  // Plakettengrösse: ca. 24% der Module
  let badgeModules = Math.round(n * 0.24);
  if ((n - badgeModules) % 2 !== 0) badgeModules += 1;
  const badgeStart = (n - badgeModules) / 2;
  const badgeEnd = badgeStart + badgeModules;

  // Pfade für dunkle Module zusammensetzen
  let paths = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      // Zentrum aussparen, damit das Logo keine QR-Punkte überdeckt
      if (r >= badgeStart && r < badgeEnd && c >= badgeStart && c < badgeEnd) {
        continue;
      }
      if (qr.modules.get(r, c)) {
        const x = c + quietZone;
        const y = r + quietZone;
        paths += `M${x} ${y}h1v1h-1z `;
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
  if (!logo.isCeviDefault && logo.buffer && logo.mimeType) {
    const dataUri = `data:${logo.mimeType};base64,${logo.buffer.toString('base64')}`;
    logoSvg = `<image href="${dataUri}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" />`;
  } else {
    // Offizielles Cevi-Logo (SVG-Vektorpfade)
    const scale = logoSize / 500;
    logoSvg = `<g transform="translate(${logoX}, ${logoY}) scale(${scale})">
      <path d="${CEVI_LOGO_PATH_RED}" fill="#e20031" />
      <path d="${CEVI_LOGO_PATH_BLUE}" fill="#003d8f" />
    </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">
  <rect width="${total}" height="${total}" fill="#ffffff" />
  <path fill="${qrColor}" d="${paths.trim()}" />
  <rect x="${badgeX - 0.2}" y="${badgeY - 0.2}" width="${badgeModules + 0.4}" height="${badgeModules + 0.4}" rx="1.2" fill="#ffffff" stroke="${qrColor}" stroke-width="0.15" />
  ${logoSvg}
</svg>`;
}

/**
 * Erzeugt einen sauberen, hochauflösenden A4-Check-in-Aushang als PDF-Dokument.
 */
export async function generateCheckinPdf(options: QrOptions): Promise<Buffer> {
  const contrast: ContrastEvaluation = evaluateContrast(options.color);
  const qrColor = contrast.qrSafeHex;
  const logo = await resolveLogo(options.logoUrl, options.prisma);

  return new Promise((resolve, reject) => {
    // A4: 595.28 x 841.89 pt
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // 1. Akzentleiste ganz oben
    doc.rect(0, 0, 595.28, 12).fill(qrColor);

    // 2. Kopfbereich
    let y = 46;
    if (options.departmentName) {
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#6b7280')
        .text(options.departmentName.toUpperCase(), 40, y, { align: 'center', width: 515 });
      y += 18;
    }

    const title = options.title || 'Helfer-Check-in';
    doc
      .font('Helvetica-Bold')
      .fontSize(26)
      .fillColor('#111827')
      .text(title, 40, y, { align: 'center', width: 515 });
    y += 34;

    const subtitle = options.subtitle || 'Anwesenheit: QR-Code scannen und einchecken';
    doc
      .font('Helvetica')
      .fontSize(14)
      .fillColor('#4b5563')
      .text(subtitle, 40, y, { align: 'center', width: 515 });
    y += 26;

    // Feine Trennlinie
    doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(80, y).lineTo(515, y).stroke();
    y += 24;

    // 3. QR-Code im Zentrum zeichnen (Vektor-Präzision)
    const qr = QRCode.create(options.text, { errorCorrectionLevel: 'H' });
    const n = qr.modules.size;
    const qrPixelSize = 300; // 300 pt (ca. 10.6 cm, aus 1-2m problemlos lesbar)
    const qrX = (595.28 - qrPixelSize) / 2;
    const qrY = y;
    const moduleSize = qrPixelSize / n;

    // Plakette berechnen
    let badgeModules = Math.round(n * 0.24);
    if ((n - badgeModules) % 2 !== 0) badgeModules += 1;
    const badgeStart = (n - badgeModules) / 2;
    const badgeEnd = badgeStart + badgeModules;

    // Weisse Unterlage mit feinem Rahmen
    doc
      .roundedRect(qrX - 12, qrY - 12, qrPixelSize + 24, qrPixelSize + 24, 12)
      .fillAndStroke('#ffffff', '#e5e7eb');

    // Module zeichnen
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (r >= badgeStart && r < badgeEnd && c >= badgeStart && c < badgeEnd) {
          continue; // Aussparung für Logo
        }
        if (qr.modules.get(r, c)) {
          doc
            .rect(qrX + c * moduleSize, qrY + r * moduleSize, moduleSize, moduleSize)
            .fill(qrColor);
        }
      }
    }

    // Zentrierte Plakette
    const badgePt = badgeModules * moduleSize;
    const badgeX = qrX + badgeStart * moduleSize;
    const badgeY = qrY + badgeStart * moduleSize;

    doc
      .roundedRect(badgeX - 2, badgeY - 2, badgePt + 4, badgePt + 4, 8)
      .fillAndStroke('#ffffff', qrColor);

    const logoPadding = badgePt * 0.12;
    const logoX = badgeX + logoPadding;
    const logoY = badgeY + logoPadding;
    const logoInner = badgePt - logoPadding * 2;

    if (!logo.isCeviDefault && logo.buffer && logo.mimeType && (logo.mimeType.includes('png') || logo.mimeType.includes('jpeg'))) {
      try {
        doc.image(logo.buffer, logoX, logoY, {
          fit: [logoInner, logoInner],
          align: 'center',
          valign: 'center',
        });
      } catch {
        // Fallback aufs Cevi-Logo bei Bilddekodierungsfehler
        drawCeviLogoVector(doc, logoX, logoY, logoInner);
      }
    } else {
      drawCeviLogoVector(doc, logoX, logoY, logoInner);
    }

    y = qrY + qrPixelSize + 36;

    // 4. Anleitungskarte unten
    doc
      .roundedRect(60, y, 475.28, 120, 10)
      .fillAndStroke('#f9fafb', '#e5e7eb');

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#111827')
      .text('So checkst du für deine Schicht ein:', 80, y + 16);

    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#374151')
      .text('1. Öffne die Kamera-App auf deinem Smartphone und scanne den Code.', 80, y + 36)
      .text('2. Melde dich mit deinem Schichtplan-Konto an oder bestätige deinen Namen.', 80, y + 54)
      .text('3. Deine Anwesenheit wird automatisch für deine Schichten vermerkt.', 80, y + 72);

    doc
      .font('Helvetica-Oblique')
      .fontSize(10)
      .fillColor('#6b7280')
      .text('Hinweis: Der Check-in ist jeweils ab 30 Minuten vor Schichtbeginn möglich.', 80, y + 94);

    // 5. Fusszeile
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#9ca3af')
      .text('Cevi Schichtplan · cevi-schichtplan.ch', 40, 805, { align: 'center', width: 515 });

    doc.end();
  });
}

function drawCeviLogoVector(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  const scale = size / 500;
  doc.save();
  doc.translate(x, y);
  doc.scale(scale);
  doc.path(CEVI_LOGO_PATH_RED).fill('#e20031');
  doc.path(CEVI_LOGO_PATH_BLUE).fill('#003d8f');
  doc.restore();
}
