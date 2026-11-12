'use client';

import { useMemo } from 'react';
import QRCode from 'qrcode';
import { Badge, Callout, evaluateContrast, useOrganization } from '@schichtplan/ui';
import { getOrganizationByDbType, type OrganizationType } from '@schichtplan/shared';
import { AlertTriangle, CheckCircle2, QrCode as QrCodeIcon, Sparkles } from 'lucide-react';

export function isFinderPattern(r: number, c: number, n: number): boolean {
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
}

export function DepartmentBrandingPreview({
  name,
  logoUrl,
  primaryColor,
  secondaryColor,
  qrStyle = 'CORNERS',
  qrCustomColors = false,
  qrColorPrimary,
  qrColorSecondary,
  organization,
}: {
  name: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor?: string | null;
  qrStyle?: 'CORNERS' | 'GRADIENT' | 'SOLID';
  qrCustomColors?: boolean;
  qrColorPrimary?: string | null;
  qrColorSecondary?: string | null;
  organization?: OrganizationType | string;
}) {
  const browserOrg = useOrganization();
  const orgConfig = organization ? getOrganizationByDbType(organization as OrganizationType) : browserOrg;
  const effectiveLogo = logoUrl || orgConfig.logoUrl;

  const uiPrimaryContrast = useMemo(() => evaluateContrast(primaryColor), [primaryColor]);
  const hasUiSecondary = Boolean(secondaryColor?.trim());
  const uiSecondaryContrast = useMemo(
    () => (hasUiSecondary && secondaryColor ? evaluateContrast(secondaryColor) : null),
    [hasUiSecondary, secondaryColor]
  );

  // Effektive Farben für den QR-Code
  const effectiveQrPrimary = qrCustomColors && qrColorPrimary?.trim() ? qrColorPrimary : primaryColor;
  const effectiveQrSecondary = qrCustomColors ? qrColorSecondary : secondaryColor;

  const qrPrimaryContrast = useMemo(() => evaluateContrast(effectiveQrPrimary), [effectiveQrPrimary]);
  const hasQrSecondary = Boolean(effectiveQrSecondary?.trim());
  const qrSecondaryContrast = useMemo(
    () => (hasQrSecondary && effectiveQrSecondary ? evaluateContrast(effectiveQrSecondary) : null),
    [hasQrSecondary, effectiveQrSecondary]
  );

  const isTwoTone =
    hasQrSecondary &&
    qrSecondaryContrast &&
    qrSecondaryContrast.qrSafeHex !== qrPrimaryContrast.qrSafeHex &&
    qrStyle !== 'SOLID';

  // QR-Code SVG-Pfade berechnen
  const qrData = useMemo(() => {
    try {
      const demoUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/checkin` : 'https://cevi-schichtplan.ch';
      const qr = QRCode.create(demoUrl, { errorCorrectionLevel: 'H' });
      const n = qr.modules.size;
      const quiet = 2;
      const total = n + quiet * 2;

      let badgeModules = Math.round(n * 0.24);
      if ((n - badgeModules) % 2 !== 0) badgeModules += 1;
      const badgeStart = (n - badgeModules) / 2;
      const badgeEnd = badgeStart + badgeModules;

      let bodyPaths = '';
      let cornerPaths = '';

      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (r >= badgeStart && r < badgeEnd && c >= badgeStart && c < badgeEnd) {
            continue;
          }
          if (qr.modules.get(r, c)) {
            const p = `M${c + quiet} ${r + quiet}h1v1h-1z `;
            if (isTwoTone && qrStyle === 'CORNERS' && isFinderPattern(r, c, n)) {
              cornerPaths += p;
            } else {
              bodyPaths += p;
            }
          }
        }
      }

      const badgeX = badgeStart + quiet;
      const badgeY = badgeStart + quiet;
      const pad = badgeModules * 0.12;

      return {
        total,
        bodyPaths: bodyPaths.trim(),
        cornerPaths: cornerPaths.trim(),
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
  }, [isTwoTone, qrStyle]);

  const cornerColor = qrSecondaryContrast?.qrSafeHex || qrPrimaryContrast.qrSafeHex;
  const strokeColor = isTwoTone ? cornerColor : qrPrimaryContrast.qrSafeHex;

  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-subtle">
          <Sparkles className="size-3.5 text-accent" />
          Live-Vorschau: {name || 'Abteilung'}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            tone={
              qrPrimaryContrast.level === 'optimal'
                ? 'success'
                : qrPrimaryContrast.level === 'sufficient'
                ? 'warning'
                : 'danger'
            }
            className="gap-1 text-[11px]"
          >
            {qrPrimaryContrast.level === 'poor' ? (
              <AlertTriangle className="size-3" />
            ) : (
              <CheckCircle2 className="size-3" />
            )}
            QR-Haupt: {qrPrimaryContrast.ratioAgainstWhite}:1
          </Badge>
          {qrSecondaryContrast && (
            <Badge
              tone={
                qrSecondaryContrast.level === 'optimal'
                  ? 'success'
                  : qrSecondaryContrast.level === 'sufficient'
                  ? 'warning'
                  : 'danger'
              }
              className="gap-1 text-[11px]"
            >
              {qrSecondaryContrast.level === 'poor' ? (
                <AlertTriangle className="size-3" />
              ) : (
                <CheckCircle2 className="size-3" />
              )}
              QR-Zweit: {qrSecondaryContrast.ratioAgainstWhite}:1
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
        {/* Linke Seite: UI-Elemente & Erklärung */}
        <div className="space-y-3">
          <div className="rounded-xl border border-line/80 bg-surface p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-muted">Portal-Design:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  tabIndex={-1}
                  style={{ backgroundColor: primaryColor, color: uiPrimaryContrast.textOnAccent }}
                  className="rounded-full px-3 py-1 text-xs font-semibold shadow-sm pointer-events-none"
                >
                  Schicht eintragen
                </button>
                {secondaryColor && (
                  <span
                    style={{
                      backgroundColor: secondaryColor,
                      color: uiSecondaryContrast ? uiSecondaryContrast.textOnAccent : '#ffffff',
                    }}
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow-sm"
                  >
                    Zweitfarbe
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-fg-subtle">
              <span>QR-Code Modus:</span>
              <span className="font-medium text-fg">
                {qrCustomColors ? 'Eigene QR-Farben' : 'Erbt Abteilungsfarben'}
                {' · '}
                {!isTwoTone
                  ? 'Einfarbig'
                  : qrStyle === 'CORNERS'
                  ? 'Ecken abgesetzt'
                  : 'Farbverlauf'}
              </span>
            </div>
          </div>

          {qrPrimaryContrast.level === 'poor' || (qrSecondaryContrast && qrSecondaryContrast.level === 'poor') ? (
            <Callout tone="warning" className="text-xs">
              Mindestens eine gewählte QR-Farbe ist sehr hell. Für Plakate und Check-in-Aushänge wird sie automatisch
              abgedunkelt, damit Barcodescanner den Code sofort erfassen können.
            </Callout>
          ) : (
            <p className="text-xs text-fg-muted">
              {isTwoTone
                ? 'Beide QR-Farben bieten optimalen Kontrast. Der zweifarbige QR-Code scannt zuverlässig auf allen Smartphones.'
                : 'Die Farbe erfüllt alle Kontrastanforderungen für Plakate und Bildschirme.'}
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
                {isTwoTone && qrStyle === 'GRADIENT' && (
                  <defs>
                    <linearGradient id="prev-qr-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={qrPrimaryContrast.qrSafeHex} />
                      <stop offset="100%" stopColor={cornerColor} />
                    </linearGradient>
                  </defs>
                )}
                <rect width={qrData.total} height={qrData.total} fill="#ffffff" />
                <path
                  fill={isTwoTone && qrStyle === 'GRADIENT' ? 'url(#prev-qr-grad)' : qrPrimaryContrast.qrSafeHex}
                  d={qrData.bodyPaths}
                />
                {qrData.cornerPaths && <path fill={cornerColor} d={qrData.cornerPaths} />}
                <rect
                  x={qrData.badgeX - 0.2}
                  y={qrData.badgeY - 0.2}
                  width={qrData.badgeModules + 0.4}
                  height={qrData.badgeModules + 0.4}
                  rx="1.2"
                  fill="#ffffff"
                  stroke={isTwoTone && qrStyle === 'GRADIENT' ? 'url(#prev-qr-grad)' : strokeColor}
                  strokeWidth="0.15"
                />
                {effectiveLogo ? (
                  <image
                    href={effectiveLogo}
                    x={qrData.logoX}
                    y={qrData.logoY}
                    width={qrData.logoSize}
                    height={qrData.logoSize}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : null}
              </svg>
            ) : (
              <QrCodeIcon className="size-12 text-fg-subtle animate-pulse" />
            )}
          </div>
          <span className="text-[11px] font-medium text-fg-subtle text-center">
            {isTwoTone ? 'Zweifarbiger QR-Code' : 'Check-in-QR-Code'}
          </span>
        </div>
      </div>
    </div>
  );
}
