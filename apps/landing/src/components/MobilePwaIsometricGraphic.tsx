import React from 'react';

export function MobilePwaIsometricGraphic({ className = '' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 380 230"
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
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Ground Glow */}
        <ellipse cx="190" cy="165" rx="120" ry="40" fill="url(#phoneGlow)" />

        {/* Isometric 3D Smartphone (Angled at 25°) */}
        <g transform="translate(115, 20)">
          {/* Phone Outer Shadow */}
          <path
            d="M20 50 L100 10 L140 30 L60 200 L20 180 Z"
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
            y="12"
            width="38"
            height="10"
            rx="5"
            fill="#000000"
            transform="skewY(-10) rotate(5)"
          />

          {/* Screen Content: Shift Card Mock */}
          <g transform="skewY(-10) rotate(5)">
            {/* Header Status */}
            <circle cx="22" cy="38" r="4" fill="#e11d48" />
            <text x="32" y="41" fill="#e4e4e7" fontSize="8" fontWeight="bold" fontFamily="sans-serif">
              Chilbi Illnau
            </text>

            {/* In-app Shift row 1 */}
            <rect x="14" y="52" width="117" height="30" rx="8" fill="#27272a" stroke="#3f3f46" strokeWidth="0.8" />
            <text x="22" y="66" fill="#fafafa" fontSize="7.5" fontWeight="600" fontFamily="sans-serif">
              Grill & Pommes
            </text>
            <text x="22" y="76" fill="#a1a1aa" fontSize="6.5" fontFamily="monospace">
              18:00 - 21:00
            </text>
            <rect x="94" y="58" width="30" height="14" rx="7" fill="#3f3f46" />
            <text x="99" y="68" fill="#a1a1aa" fontSize="6" fontWeight="bold">
              VOLL
            </text>

            {/* In-app Shift row 2 (Active/Checked) */}
            <rect x="14" y="88" width="117" height="30" rx="8" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" strokeWidth="1" />
            <text x="22" y="102" fill="#fafafa" fontSize="7.5" fontWeight="600" fontFamily="sans-serif">
              Barbetrieb 16+
            </text>
            <text x="22" y="112" fill="#34d399" fontSize="6.5" fontFamily="monospace">
              21:00 - 00:00 (Du!)
            </text>
            <rect x="88" y="94" width="36" height="14" rx="7" fill="#10b981" />
            <text x="92" y="104" fill="#ffffff" fontSize="6" fontWeight="bold">
              DABEI
            </text>

            {/* Glass diagonal Sheen Overlay */}
            <polygon points="6,6 80,6 6,120" fill="url(#sheen)" />
          </g>
        </g>

        {/* Floating 3D Holographic Notification Pill (Z=80 Depth Above Phone) */}
        <g transform="translate(15, 80)">
          {/* Drop shadow */}
          <rect x="0" y="4" width="165" height="46" rx="14" fill="rgba(0,0,0,0.5)" filter="blur(6px)" />
          {/* Card Body */}
          <rect
            x="0"
            y="0"
            width="165"
            height="46"
            rx="14"
            fill="rgba(24, 24, 27, 0.94)"
            stroke="#10b981"
            strokeWidth="1.2"
          />
          {/* Icon Badge */}
          <circle cx="22" cy="23" r="10" fill="#10b981" />
          <path d="M18 23 L21 26 L26 20" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Text */}
          <text x="38" y="19" fill="#ffffff" fontSize="9.5" fontWeight="bold" fontFamily="sans-serif">
            Schicht bestätigt!
          </text>
          <text x="38" y="32" fill="#a1a1aa" fontSize="7.5" fontFamily="sans-serif">
            Erinnerung im Kalender aktiv
          </text>
        </g>

        {/* Floating Offline Badge Right */}
        <g transform="translate(250, 150)">
          <rect x="0" y="0" width="115" height="30" rx="15" fill="rgba(24, 24, 27, 0.92)" stroke="#f59e0b" strokeWidth="1" />
          <circle cx="15" cy="15" r="5" fill="#f59e0b" />
          <text x="26" y="19" fill="#fef3c7" fontSize="9" fontWeight="600" fontFamily="sans-serif">
            ⚡ 100% Offline-PWA
          </text>
        </g>
      </svg>
    </div>
  );
}
