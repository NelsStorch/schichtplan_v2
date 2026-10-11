import React from 'react';

export function CampsiteNightGraphic({ className = '' }: { className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden select-none ${className}`}>
      <svg
        viewBox="0 0 1200 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="nightSky" x1="600" y1="0" x2="600" y2="360" gradientUnits="userSpaceOnUse">
            <stop stopColor="#09090b" />
            <stop offset="0.6" stopColor="#18181b" />
            <stop offset="1" stopColor="#0c0a09" />
          </linearGradient>
          <radialGradient id="fireLight" cx="600" cy="275" r="220" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" stopOpacity="0.45" />
            <stop offset="0.5" stopColor="#e11d48" stopOpacity="0.2" />
            <stop offset="1" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tentGlow1" cx="440" cy="255" r="70" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fef08a" stopOpacity="0.5" />
            <stop offset="1" stopColor="#fef08a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tentGlow2" cx="770" cy="260" r="70" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fed7aa" stopOpacity="0.4" />
            <stop offset="1" stopColor="#fed7aa" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sky Background */}
        <rect width="1200" height="360" fill="url(#nightSky)" />

        {/* Stars in Sky */}
        <g fill="#ffffff" opacity="0.6">
          <circle cx="120" cy="45" r="1.2" />
          <circle cx="190" cy="80" r="0.8" />
          <circle cx="280" cy="35" r="1.5" />
          <circle cx="350" cy="90" r="0.7" />
          <circle cx="480" cy="50" r="1.2" />
          <circle cx="560" cy="30" r="1.8" />
          <circle cx="630" cy="70" r="0.9" />
          <circle cx="720" cy="40" r="1.4" />
          <circle cx="830" cy="85" r="0.8" />
          <circle cx="910" cy="35" r="1.3" />
          <circle cx="1020" cy="65" r="1.1" />
          <circle cx="1110" cy="45" r="1.6" />
          <circle cx="230" cy="115" r="1" />
          <circle cx="880" cy="110" r="0.9" />
          <circle cx="680" cy="100" r="1.3" />
        </g>

        {/* Big Dipper Constellation (Großer Wagen) */}
        <g stroke="#ffffff" strokeWidth="0.75" strokeDasharray="3 3" opacity="0.35">
          <polyline points="220,55 260,65 295,85 330,88 335,115 375,112 370,86 330,88" fill="none" />
          <circle cx="220" cy="55" r="2" fill="#fff" />
          <circle cx="260" cy="65" r="2" fill="#fff" />
          <circle cx="295" cy="85" r="2" fill="#fff" />
          <circle cx="330" cy="88" r="2.2" fill="#fff" />
          <circle cx="335" cy="115" r="2" fill="#fff" />
          <circle cx="375" cy="112" r="2" fill="#fff" />
          <circle cx="370" cy="86" r="2" fill="#fff" />
        </g>

        {/* Distant Mountain Ridge */}
        <path
          d="M0 240 L160 170 L340 230 L520 160 L680 220 L860 150 L1040 210 L1200 180 L1200 360 L0 360 Z"
          fill="#131110"
        />

        {/* Midground Hills with Tree Silhouettes */}
        <path
          d="M0 260 Q300 210 600 245 T1200 250 L1200 360 L0 360 Z"
          fill="#1c1917"
        />

        {/* Forest Pines (Left) */}
        <g fill="#171412">
          {/* Tree 1 */}
          <polygon points="110,185 95,245 125,245" />
          <polygon points="110,170 98,220 122,220" />
          <polygon points="110,155 102,195 118,195" />
          {/* Tree 2 */}
          <polygon points="150,195 138,255 162,255" />
          <polygon points="150,180 141,230 159,230" />
          {/* Tree 3 */}
          <polygon points="80,210 70,265 90,265" />
        </g>

        {/* Forest Pines (Right) */}
        <g fill="#171412">
          <polygon points="1060,185 1045,245 1075,245" />
          <polygon points="1060,170 1048,220 1072,220" />
          <polygon points="1110,200 1098,260 1122,260" />
          <polygon points="1020,210 1010,265 1030,265" />
        </g>

        {/* Foreground Campsite Ground */}
        <path
          d="M0 280 Q350 260 600 265 T1200 280 L1200 360 L0 360 Z"
          fill="#231f1d"
        />

        {/* Ambient Fire Glow on Ground */}
        <rect x="0" y="140" width="1200" height="220" fill="url(#fireLight)" />

        {/* Tent 1: Spatzzelt (Left) with Lantern Glow */}
        <circle cx="440" cy="265" r="50" fill="url(#tentGlow1)" />
        <g transform="translate(380, 230)">
          {/* Tent Canvas */}
          <polygon points="60,10 10,60 60,70" fill="#38312e" stroke="#524742" strokeWidth="1" />
          <polygon points="60,10 60,70 110,60" fill="#292421" stroke="#524742" strokeWidth="1" />
          {/* Illuminated Entrance Triangle */}
          <polygon points="60,70 48,45 72,45" fill="#fef08a" opacity="0.85" />
          {/* Ridge Pole */}
          <line x1="60" y1="10" x2="60" y2="4" stroke="#78716c" strokeWidth="2" />
        </g>

        {/* Tent 2: Jurte / Rundzelt (Right) with Warm Glow */}
        <circle cx="770" cy="270" r="55" fill="url(#tentGlow2)" />
        <g transform="translate(710, 225)">
          {/* Jurte Roof Cone */}
          <polygon points="65,10 15,48 115,48" fill="#2d2724" stroke="#443a36" strokeWidth="1" />
          {/* Jurte Walls */}
          <rect x="18" y="48" width="94" height="26" fill="#211d1a" stroke="#443a36" strokeWidth="1" />
          {/* Glowing doorway */}
          <rect x="55" y="52" width="20" height="22" rx="2" fill="#fed7aa" opacity="0.9" />
          {/* Top smoke opening */}
          <ellipse cx="65" cy="10" rx="9" ry="3.5" fill="#141110" stroke="#f59e0b" strokeWidth="1" />
        </g>

        {/* Campfire (Center) */}
        <g transform="translate(575, 275)">
          {/* Fire pit stones in circle */}
          <ellipse cx="25" cy="22" rx="30" ry="10" fill="#1c1917" stroke="#44403c" strokeWidth="1.5" />
          
          {/* Cross Logs */}
          <line x1="2" y1="18" x2="48" y2="18" stroke="#451a03" strokeWidth="5" strokeLinecap="round" />
          <line x1="8" y1="24" x2="42" y2="12" stroke="#78350f" strokeWidth="5" strokeLinecap="round" />
          <line x1="12" y1="12" x2="38" y2="24" stroke="#92400e" strokeWidth="4.5" strokeLinecap="round" />

          {/* Glowing Flames */}
          <path
            d="M25 -10 Q38 8 36 18 Q25 24 14 18 Q12 6 25 -10 Z"
            fill="#ea580c"
          />
          <path
            d="M25 -5 Q34 8 32 16 Q25 20 18 16 Q16 6 25 -5 Z"
            fill="#f59e0b"
          />
          <path
            d="M25 0 Q30 8 28 15 Q25 18 22 15 Q20 8 25 0 Z"
            fill="#fef08a"
          />
          <circle cx="25" cy="12" r="3.5" fill="#ffffff" />

          {/* Sparks / Embers rising */}
          <circle cx="23" cy="-18" r="1.8" fill="#fbbf24" />
          <circle cx="31" cy="-28" r="1.5" fill="#f97316" />
          <circle cx="18" cy="-34" r="1.2" fill="#ef4444" />
          <circle cx="28" cy="-45" r="1.4" fill="#fbbf24" />
          <circle cx="21" cy="-55" r="1" fill="#f59e0b" />
        </g>
      </svg>
    </div>
  );
}
