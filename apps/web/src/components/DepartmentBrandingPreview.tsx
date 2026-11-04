'use client';

import { useMemo } from 'react';
import QRCode from 'qrcode';
import { Badge, Callout, evaluateContrast } from '@schichtplan/ui';
import { AlertTriangle, CheckCircle2, QrCode as QrCodeIcon, Sparkles } from 'lucide-react';

const CEVI_LOGO_PATH_RED =
  'M 321.69737,357.21491 C 287.28947,367.10965 252.80263,373.24123 220.24561,375.68421 L 342.04386,497.30702 L 385.28509,335.97368 C 366.14474,343.46491 345.02631,350.50439 321.69737,357.21491 z M 430.11403,155.98684 C 385.74123,184.9693 331.41228,209.90351 280.88158,224.43421 C 211.38596,244.41667 140.64474,250.60526 86.609649,241.46491 L 4.0745614,159.05263 L 462.29824,35.894737 L 430.11403,155.98684 z';

const CEVI_LOGO_PATH_BLUE =
  'M 6.6710526,190.96053 C 6.0394737,188.60965 5.6622807,186.18421 5.4342105,183.72807 L 54.574561,232.79825 C 28.008772,223.31579 11.5,208.97807 6.6710526,190.96053 z M 497.38596,242.87719 C 462.67105,285.34649 407.07017,315.84649 317.23246,341.68421 C 225.59649,368.0307 134.16667,367.2193 84.307017,339.60965 C 66.763158,329.89035 55.763158,317.63596 51.614035,303.18421 L 25.328947,237.97807 C 26.320175,238.57456 27.307017,239.1886 28.289474,239.73246 C 82.078947,269.52193 183.01754,269.74123 285.43421,240.28947 C 367.38158,216.72368 453.30702,169.02632 497.38158,123.0307 L 497.38158,242.87719 L 497.38596,242.87719 z M 342.04386,51.662281 L 21.991228,137.16667 C 54.93421,90.149123 132.27193,43.894737 221.70614,18.179825 C 246.83333,10.95614 302.99561,1.881579 342.04386,3.3333334 L 342.04386,51.662281 z';

export function DepartmentBrandingPreview({
  name,
  logoUrl,
  primaryColor,
}: {
  name: string;
  logoUrl?: string | null;
  primaryColor: string;
}) {
  const contrast = useMemo(() => evaluateContrast(primaryColor), [primaryColor]);

  // QR-Code SVG-Pfade berechnen
  const qrData = useMemo(() => {
    try {
      const demoUrl = typeof window !== 'undefined' ? `${window.location.origin}/checkin` : 'https://cevi-schichtplan.ch';
      const qr = QRCode.create(demoUrl, { errorCorrectionLevel: 'H' });
      const n = qr.modules.size;
      const quiet = 2;
      const total = n + quiet * 2;

      let badgeModules = Math.round(n * 0.24);
      if ((n - badgeModules) % 2 !== 0) badgeModules += 1;
      const badgeStart = (n - badgeModules) / 2;
      const badgeEnd = badgeStart + badgeModules;

      let paths = '';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (r >= badgeStart && r < badgeEnd && c >= badgeStart && c < badgeEnd) {
            continue;
          }
          if (qr.modules.get(r, c)) {
            paths += `M${c + quiet} ${r + quiet}h1v1h-1z `;
          }
        }
      }

      const badgeX = badgeStart + quiet;
      const badgeY = badgeStart + quiet;
      const pad = badgeModules * 0.12;

      return {
        total,
        paths: paths.trim(),
        badgeX,
        badgeY,
        badgeModules,
        logoX: badgeX + pad,
        logoY: badgeY + pad,
        logoSize: badgeModules - pad * 2,
      };
    } catch {
      return null;
    }
  }, []);

  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-subtle">
          <Sparkles className="size-3.5 text-accent" />
          Live-Vorschau: {name || 'Abteilung'}
        </span>
        {contrast.level === 'optimal' && (
          <Badge tone="success" className="gap-1">
            <CheckCircle2 className="size-3" />
            {contrast.ratioAgainstWhite}:1 · Optimal (WCAG AA)
          </Badge>
        )}
        {contrast.level === 'sufficient' && (
          <Badge tone="warning" className="gap-1">
            <CheckCircle2 className="size-3" />
            {contrast.ratioAgainstWhite}:1 · Ausreichend
          </Badge>
        )}
        {contrast.level === 'poor' && (
          <Badge tone="danger" className="gap-1">
            <AlertTriangle className="size-3" />
            {contrast.ratioAgainstWhite}:1 · Zu hell
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
        {/* Linke Seite: UI-Elemente & Erklärung */}
        <div className="space-y-3">
          <div className="rounded-xl border border-line/80 bg-surface p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-muted">Button auf Akzent:</span>
              <button
                type="button"
                tabIndex={-1}
                style={{ backgroundColor: primaryColor, color: contrast.textOnAccent }}
                className="rounded-full px-3 py-1 text-xs font-semibold shadow-sm pointer-events-none"
              >
                Schicht eintragen
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-fg-subtle">
              <span>Textkontrast:</span>
              <span className="font-medium text-fg">
                {contrast.textOnAccent === '#ffffff' ? 'Weisse Schrift' : 'Dunkle Schrift'}
              </span>
            </div>
          </div>

          {contrast.level === 'poor' ? (
            <Callout tone="warning" className="text-xs">
              Diese Farbe ist sehr hell. Für QR-Codes verwenden wir automatisch ein abgedunkeltes{' '}
              <span className="font-mono font-bold">{contrast.qrSafeHex}</span>, damit Barcodescanner und Handykameras
              den Check-in zuverlässig erfassen können.
            </Callout>
          ) : (
            <p className="text-xs text-fg-muted">
              Diese Farbe erfüllt die Kontrastanforderungen. Dein QR-Code wird auf Plakaten und Bildschirmen
              schnell und fehlerfrei gescannt.
            </p>
          )}
        </div>

        {/* Rechte Seite: Live QR-Code Vorschau */}
        <div className="flex flex-col items-center gap-1.5 self-center">
          <div className="relative size-32 rounded-xl border border-line bg-white p-1.5 shadow-sm overflow-hidden flex items-center justify-center">
            {qrData ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox={`0 0 ${qrData.total} ${qrData.total}`}
                className="size-full"
                shapeRendering="crispEdges"
                role="img"
                aria-label="QR-Code Vorschau"
              >
                <title>QR-Code Vorschau</title>
                <rect width={qrData.total} height={qrData.total} fill="#ffffff" />
                <path fill={contrast.qrSafeHex} d={qrData.paths} />
                <rect
                  x={qrData.badgeX - 0.2}
                  y={qrData.badgeY - 0.2}
                  width={qrData.badgeModules + 0.4}
                  height={qrData.badgeModules + 0.4}
                  rx="1.2"
                  fill="#ffffff"
                  stroke={contrast.qrSafeHex}
                  strokeWidth="0.15"
                />
                {logoUrl ? (
                  <image
                    href={logoUrl}
                    x={qrData.logoX}
                    y={qrData.logoY}
                    width={qrData.logoSize}
                    height={qrData.logoSize}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : (
                  <g
                    transform={`translate(${qrData.logoX}, ${qrData.logoY}) scale(${qrData.logoSize / 500})`}
                  >
                    <path d={CEVI_LOGO_PATH_RED} fill="#e20031" />
                    <path d={CEVI_LOGO_PATH_BLUE} fill="#003d8f" />
                  </g>
                )}
              </svg>
            ) : (
              <QrCodeIcon className="size-12 text-fg-subtle animate-pulse" />
            )}
          </div>
          <span className="text-[11px] font-medium text-fg-subtle text-center">
            Check-in-QR-Code
          </span>
        </div>
      </div>
    </div>
  );
}
