import { describe, expect, it } from 'vitest';
import { generateCheckinPdf, generateQrSvg } from './qrGenerator.js';

describe('qrGenerator', () => {
  it('erzeugt einen gültigen SVG-QR-Code mit Cevi-Logo', async () => {
    const svg = await generateQrSvg({
      text: 'https://example.com/checkin?code=123',
      color: '#2563eb',
      title: 'Chilbi',
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('#2563eb'); // Dunkle Module in Abteilungsfarbe
    expect(svg).toContain('#e20031'); // Cevi-Rot im Logo
    expect(svg).toContain('#003d8f'); // Cevi-Blau im Logo
    expect(svg).toContain('</svg>');
  });

  it('erzeugt einen zweifarbigen QR-Code mit hervorgehobenen Ecken (CORNERS)', async () => {
    const svg = await generateQrSvg({
      text: 'https://example.com/checkin?code=123',
      color: '#e11d48', // Primärfarbe (Datenpunkte)
      secondaryColor: '#003d8f', // Zweitfarbe (Ecken)
      qrStyle: 'CORNERS',
    });

    expect(svg).toContain('#e11d48');
    expect(svg).toContain('#003d8f');
  });

  it('erzeugt einen zweifarbigen QR-Code mit linearem Farbverlauf (GRADIENT)', async () => {
    const svg = await generateQrSvg({
      text: 'https://example.com/checkin?code=123',
      color: '#e11d48',
      secondaryColor: '#003d8f',
      qrStyle: 'GRADIENT',
    });

    expect(svg).toContain('<linearGradient id="qr-grad"');
    expect(svg).toContain('url(#qr-grad)');
  });

  it('dunkelt zu helle Farben im SVG automatisch ab (Kontrast-Schutz)', async () => {
    const svg = await generateQrSvg({
      text: 'https://example.com/checkin?code=123',
      color: '#facc15', // Hellgelb
    });

    expect(svg).not.toContain('#facc15'); // Gelb wurde abgedunkelt
    expect(svg).toMatch(/fill="#[0-9a-f]{6}"/i);
  });

  it('bettet ein hochgeladenes PNG-Logo als Data-URL ein', async () => {
    // 1x1 transparenter PNG
    const dummyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );

    const mockPrisma = {
      upload: {
        findUnique: async () => ({
          data: dummyPng,
          mimeType: 'image/png',
        }),
      },
    } as any;

    const svg = await generateQrSvg({
      text: 'https://example.com/checkin?code=123',
      logoUrl: '/api/uploads/11111111-2222-3333-4444-555555555555',
      prisma: mockPrisma,
    });

    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/png;base64,');
  });

  it('erzeugt ein gültiges A4-PDF-Dokument mit Bento-Schritten und Zweifarbigkeit', async () => {
    const pdfBuf = await generateCheckinPdf({
      text: 'https://example.com/checkin?code=123',
      title: 'Chilbi Illnau',
      subtitle: 'Helfer-Check-in',
      departmentName: 'Cevi Illnau-Effretikon',
      color: '#e11d48',
      secondaryColor: '#003d8f',
      qrStyle: 'CORNERS',
    });

    expect(pdfBuf).toBeInstanceOf(Buffer);
    expect(pdfBuf.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(pdfBuf.length).toBeGreaterThan(5000);
  });
});
