import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  darkenToContrast,
  evaluateContrast,
  hexToRgb,
  rgbToHex,
} from '@schichtplan/shared';

describe('colors & contrast', () => {
  it('parst und normalisiert Hex-Farben', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#2563eb')).toEqual([37, 99, 235]);
    expect(hexToRgb('invalid')).toBeNull();
    expect(rgbToHex([37, 99, 235])).toBe('#2563eb');
  });

  it('berechnet das Kontrastverhältnis nach WCAG 2.1', () => {
    // Schwarz gegen Weiss = 21:1
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    // Weiss gegen Weiss = 1:1
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 1);
  });

  it('bewertet dunkle Farben als optimal für QR-Codes', () => {
    const res = evaluateContrast('#2563eb'); // Kräftiges Blau
    expect(res.ratioAgainstWhite).toBeGreaterThanOrEqual(4.5);
    expect(res.level).toBe('optimal');
    expect(res.isQrOptimal).toBe(true);
    expect(res.qrSafeHex).toBe('#2563eb');
    expect(res.textOnAccent).toBe('#ffffff');
  });

  it('erkennt zu helle Farben und dunkelt sie für den QR-Code ab', () => {
    const res = evaluateContrast('#facc15'); // Helles Gelb
    expect(res.ratioAgainstWhite).toBeLessThan(3.0);
    expect(res.level).toBe('poor');
    expect(res.isQrOptimal).toBe(false);
    expect(res.textOnAccent).toBe('#1c1917');
    // Die sichere QR-Farbe muss mindestens 4.5:1 gegen Weiss erreichen
    const safeRgb = hexToRgb(res.qrSafeHex)!;
    expect(contrastRatio(safeRgb, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  });

  it('darkenToContrast behält bereits dunkle Farben bei', () => {
    const darkBlue: [number, number, number] = [0, 61, 143];
    expect(darkenToContrast(darkBlue)).toEqual(darkBlue);
  });
});
