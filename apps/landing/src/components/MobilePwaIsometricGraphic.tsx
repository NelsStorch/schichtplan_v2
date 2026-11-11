

import type { OrganizationConfig } from '@schichtplan/shared';

export function MobilePwaIsometricGraphic({
  className = '',
  org,
}: {
  className?: string;
  org?: OrganizationConfig;
}) {
  const isPfadi = org?.slug === 'pfadi';
  const isJubla = org?.slug === 'jubla';
  const isVerein = org?.slug === 'verein';

  const eventName = isPfadi
    ? 'SoLa 2026'
    : isJubla
    ? 'Jubla-Tag'
    : isVerein
    ? 'Dorfturnier'
    : 'Chilbi Illnau';

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 400 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-2xl"
      >
        <defs>
          <linearGradient id="phoneBody" x1="120" y1="30" x2="260" y2="210" gradientUnits="userSpaceOnUse">
            <stop stopColor="#27272a" />
            <stop offset="1" stopColor="#09090b" />
          </linearGradient>
          <linearGradient id="screenGlass" x1="130" y1="40" x2="250" y2="200" gradientUnits="userSpaceOnUse">
            <stop stopColor="#18181b" />
            <stop offset="1" stopColor="#09090b" />
          </linearGradient>
          <linearGradient id="sheen" x1="120" y1="40" x2="260" y2="200" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="phoneGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Ground Glow */}
        <ellipse cx="200" cy="170" rx="130" ry="42" fill="url(#phoneGlow)" />

        {/* Isometric 3D Smartphone (Angled at subtle skew & rotate) */}
        <g transform="translate(132, 24)">
          {/* Phone Outer Shadow */}
          <path
            d="M15 50 L95 10 L140 30 L60 205 L15 185 Z"
            fill="rgba(0,0,0,0.5)"
            filter="blur(10px)"
          />

          {/* Phone Titanium Edge / Base Extrusion */}
          <rect
            x="0"
            y="0"
            width="145"
            height="185"
            rx="24"
            fill="url(#phoneBody)"
            stroke="#52525b"
            strokeWidth="2.5"
            transform="skewY(-10) rotate(5)"
          />

          {/* Phone Screen Glass */}
          <rect
            x="6"
            y="6"
            width="133"
            height="173"
            rx="19"
            fill="url(#screenGlass)"
            stroke="#27272a"
            strokeWidth="1"
            transform="skewY(-10) rotate(5)"
          />

          {/* Dynamic Island / Camera Notch */}
          <rect
            x="54"
            y="11"
            width="38"
            height="9"
            rx="4.5"
            fill="#000000"
            transform="skewY(-10) rotate(5)"
          />

          {/* Screen Content: Shift Card Mock with Clear Typography */}
          <g transform="skewY(-10) rotate(5)">
            {/* Header Status */}
            <circle cx="20" cy="34" r="3.5" fill="#e11d48" />
            <text x="28" y="37" fill="#f4f4f5" fontSize="8" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">
              {eventName}
            </text>
            <text x="96" y="37" fill="#71717a" fontSize="6.5" fontFamily="monospace">
              LIVE
            </text>

            {/* In-app Shift row 1: Grill & Pommes (Full) */}
            <rect x="12" y="47" width="121" height="27" rx="7" fill="#27272a" stroke="#3f3f46" strokeWidth="0.8" />
            <text x="20" y="59" fill="#fafafa" fontSize="7.5" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
              Grill & Pommes
            </text>
            <text x="20" y="68" fill="#a1a1aa" fontSize="6.5" fontFamily="monospace">
              18:00 - 21:00
            </text>
            <rect x="97" y="53" width="28" height="13" rx="6.5" fill="#3f3f46" />
            <text x="102" y="62.5" fill="#d4d4d8" fontSize="6" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">
              VOLL
            </text>

            {/* In-app Shift row 2: Barbetrieb (Active / Self enrolled) */}
            <rect x="12" y="78" width="121" height="27" rx="7" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" strokeWidth="1" />
            <text x="20" y="90" fill="#fafafa" fontSize="7.5" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
              Barbetrieb 16+
            </text>
            <text x="20" y="99" fill="#34d399" fontSize="6.5" fontFamily="monospace">
              21:00 - 00:00 (Du!)
            </text>
            <rect x="91" y="84" width="34" height="13" rx="6.5" fill="#10b981" />
            <text x="96" y="93.5" fill="#ffffff" fontSize="6" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">
              DABEI
            </text>

            {/* In-app Shift row 3: Abbau Sonntag (Open slot) */}
            <rect x="12" y="109" width="121" height="27" rx="7" fill="#27272a" stroke="#3f3f46" strokeWidth="0.8" />
            <text x="20" y="121" fill="#fafafa" fontSize="7.5" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
              Abbau Sonntag
            </text>
            <text x="20" y="130" fill="#a1a1aa" fontSize="6.5" fontFamily="monospace">
              08:00 - 11:00
            </text>
            <rect x="91" y="115" width="34" height="13" rx="6.5" fill="rgba(245, 158, 11, 0.18)" stroke="#f59e0b" strokeWidth="0.8" />
            <text x="96" y="124.5" fill="#fbbf24" fontSize="6" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">
              1 FREI
            </text>

            {/* Home indicator bar at bottom */}
            <rect x="46" y="148" width="53" height="3" rx="1.5" fill="#52525b" />

            {/* Glass diagonal Sheen Overlay */}
            <polygon points="6,6 80,6 6,110" fill="url(#sheen)" />
          </g>
        </g>

        {/* Floating Notification Pill Top-Left (Clear of Screen UI) */}
        <g transform="translate(12, 38)">
          {/* Drop shadow */}
          <rect x="0" y="3" width="126" height="38" rx="12" fill="rgba(0,0,0,0.5)" filter="blur(6px)" />
          {/* Card Body */}
          <rect
            x="0"
            y="0"
            width="126"
            height="38"
            rx="12"
            fill="rgba(24, 24, 27, 0.94)"
            stroke="#10b981"
            strokeWidth="1.2"
          />
          {/* Icon Badge */}
          <circle cx="18" cy="19" r="8" fill="#10b981" />
          <path d="M15 19 L17.5 21.5 L21.5 16.5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          {/* Text */}
          <text x="32" y="16.5" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">
            Schicht bestätigt!
          </text>
          <text x="32" y="27.5" fill="#a1a1aa" fontSize="6.5" fontFamily="system-ui, -apple-system, sans-serif">
            Im Kalender eingetragen
          </text>
        </g>

        {/* Floating Badge Bottom-Right (Clear of Phone Screen) */}
        <g transform="translate(262, 162)">
          {/* Drop shadow */}
          <rect x="0" y="3" width="120" height="28" rx="14" fill="rgba(0,0,0,0.4)" filter="blur(5px)" />
          <rect x="0" y="0" width="120" height="28" rx="14" fill="rgba(24, 24, 27, 0.94)" stroke="#f59e0b" strokeWidth="1" />
          <circle cx="14" cy="14" r="4.5" fill="#f59e0b" />
          <text x="25" y="17.5" fill="#fef3c7" fontSize="8.5" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
            ⚡ Ganz ohne App
          </text>
        </g>
      </svg>
    </div>
  );
}
