

import type { OrganizationConfig } from '@schichtplan/shared';

export function MultiEventIsometricGraphic({
  className = '',
  org,
}: {
  className?: string;
  org?: OrganizationConfig;
}) {
  const isPfadi = org?.slug === 'pfadi';
  const isJubla = org?.slug === 'jubla';
  const isVerein = org?.slug === 'verein';

  const event1 = isPfadi
    ? 'SoLa 2026'
    : isJubla
    ? 'Jubla-Tag 2026'
    : isVerein
    ? 'Dorfturnier 2026'
    : 'Chilbi 2026';

  const event2 = isPfadi
    ? 'PfiLa 2026'
    : isJubla
    ? 'Pfarreifest'
    : isVerein
    ? 'Vereinsfest'
    : 'PfiLa 2026';

  const event3 = isVerein
    ? '🏆 Grümpelturnier Aktiv'
    : '🏕️ Sommerlager Aktiv';

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 400 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-2xl"
      >
        <defs>
          <linearGradient id="tentRed" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#f43f5e" />
            <stop offset="1" stopColor="#be123c" />
          </linearGradient>
          <linearGradient id="tentWhite" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#f5f5f4" />
            <stop offset="1" stopColor="#d6d3d1" />
          </linearGradient>
          <radialGradient id="fireGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Ground Glow */}
        <ellipse cx="200" cy="160" rx="135" ry="46" fill="url(#fireGlow)" />

        {/* Isometric Ground Grid Lines */}
        <g opacity="0.25">
          <path d="M80 150 L200 90 L320 150 L200 210 Z" stroke="#78716c" strokeWidth="1" fill="none" />
          <path d="M110 150 L200 105 L290 150 L200 195 Z" stroke="#78716c" strokeWidth="1" fill="none" />
        </g>

        {/* 1. 3D Isometric Chilbi Festzelt (Left Side) */}
        <g transform="translate(65, 78)">
          {/* Tent walls */}
          <path d="M20 50 L70 75 L70 95 L20 70 Z" fill="#292524" stroke="#44403c" strokeWidth="1" />
          <path d="M70 75 L120 50 L120 70 L70 95 Z" fill="#1c1917" stroke="#44403c" strokeWidth="1" />

          {/* Striped Canopy Roof in Isometric 3D */}
          {/* Left Roof Slant: Alternating Red/White Stripes */}
          <polygon points="70,15 20,50 35,57 70,22" fill="url(#tentRed)" />
          <polygon points="70,22 35,57 50,64 70,29" fill="url(#tentWhite)" />
          <polygon points="70,29 50,64 70,74 70,36" fill="url(#tentRed)" />

          {/* Right Roof Slant */}
          <polygon points="70,15 120,50 105,57 70,22" fill="url(#tentRed)" />
          <polygon points="70,22 105,57 90,64 70,29" fill="url(#tentWhite)" />
          <polygon points="70,29 90,64 70,74 70,36" fill="url(#tentRed)" />

          {/* Festzelt Flagge auf der Spitze */}
          <line x1="70" y1="15" x2="70" y2="4" stroke="#e5e5e5" strokeWidth="1.5" />
          <polygon points="70,4 82,8 70,12" fill="#fbbf24" />
        </g>

        {/* 2. 3D Isometric Campfire with Sparks (Center) */}
        <g transform="translate(200, 152)">
          {/* Wood Logs */}
          <line x1="-12" y1="4" x2="12" y2="-4" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
          <line x1="-10" y1="-4" x2="10" y2="4" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
          
          {/* Flame Core */}
          <polygon points="0,-18 7,-6 4,2 -4,2 -7,-6" fill="#f59e0b" />
          <polygon points="0,-14 4,-4 2,2 -2,2 -4,-4" fill="#fbbf24" />
          <circle cx="0" cy="-6" r="2.5" fill="#ffffff" />

          {/* Embers Floating */}
          <circle cx="4" cy="-24" r="1.5" fill="#fbbf24" />
          <circle cx="-6" cy="-20" r="1.2" fill="#f97316" />
          <circle cx="2" cy="-30" r="1" fill="#ef4444" />
        </g>

        {/* 3. 3D Isometric Cevi Zelt / Jurte (Right Side) */}
        <g transform="translate(242, 82)">
          {/* Canvas Tent Roof in dark olive/brown */}
          <polygon points="50,15 10,55 50,75" fill="#3f3f46" stroke="#52525b" strokeWidth="1" />
          <polygon points="50,15 50,75 90,55" fill="#27272a" stroke="#52525b" strokeWidth="1" />
          {/* Entrance opening */}
          <polygon points="50,75 42,65 58,65" fill="#09090b" />
          {/* Tent pole */}
          <line x1="50" y1="15" x2="50" y2="7" stroke="#d4d4d8" strokeWidth="1.5" />
          <polygon points="50,7 60,11 50,14" fill="#ef4444" />
        </g>

        {/* Floating Event Cards in 3D Space (Clear of 3D objects) */}
        {/* Card 1: Main Event */}
        <g transform="translate(22, 22)">
          <rect x="0" y="3" width="128" height="36" rx="10" fill="rgba(0,0,0,0.4)" filter="blur(5px)" />
          <rect x="0" y="0" width="128" height="36" rx="10" fill="rgba(24, 24, 27, 0.94)" stroke="#e11d48" strokeWidth="1.2" />
          <circle cx="16" cy="18" r="6" fill="#e11d48" />
          <text x="28" y="17" fill="#ffffff" fontSize="10.5" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">
            {event1}
          </text>
          <text x="28" y="27" fill="#fb7185" fontSize="8.5" fontFamily="monospace">
            28 Schichten · 86%
          </text>
        </g>

        {/* Card 2: Secondary Event */}
        <g transform="translate(250, 22)">
          <rect x="0" y="3" width="128" height="36" rx="10" fill="rgba(0,0,0,0.4)" filter="blur(5px)" />
          <rect x="0" y="0" width="128" height="36" rx="10" fill="rgba(24, 24, 27, 0.94)" stroke="#10b981" strokeWidth="1.2" />
          <circle cx="16" cy="18" r="6" fill="#10b981" />
          <text x="28" y="17" fill="#ffffff" fontSize="10.5" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">
            {event2}
          </text>
          <text x="28" y="27" fill="#34d399" fontSize="8.5" fontFamily="monospace">
            Küche, Aufbau, Posten
          </text>
        </g>

        {/* Card 3: Seasonal Event (Floating Bottom Center) */}
        <g transform="translate(138, 196)">
          <rect x="0" y="3" width="124" height="28" rx="8" fill="rgba(0,0,0,0.4)" filter="blur(4px)" />
          <rect x="0" y="0" width="124" height="28" rx="8" fill="rgba(24, 24, 27, 0.95)" stroke="#38bdf8" strokeWidth="1" />
          <text x="14" y="18" fill="#e0f2fe" fontSize="10" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
            {event3}
          </text>
        </g>
      </svg>
    </div>
  );
}
