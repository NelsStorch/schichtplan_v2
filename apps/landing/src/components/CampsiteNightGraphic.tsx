import React from 'react';

export function CampsiteNightGraphic({ className = '' }: { className?: string }) {
  return (
    <div className={`w-full h-full overflow-hidden select-none ${className}`}>
      <svg
        viewBox="0 0 1200 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="nightSky" x1="600" y1="0" x2="600" y2="360" gradientUnits="userSpaceOnUse">
            <stop stopColor="#09090b" />
            <stop offset="0.6" stopColor="#18181b" />
            <stop offset="1" stopColor="#0c0a09" />
          </linearGradient>
          <radialGradient id="fireLight" cx="600" cy="265" r="240" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="0.45" stopColor="#e11d48" stopOpacity="0.22" />
            <stop offset="1" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tentGlow1" cx="445" cy="255" r="75" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fef08a" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fef08a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tentGlow2" cx="755" cy="255" r="75" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fed7aa" stopOpacity="0.45" />
            <stop offset="1" stopColor="#fed7aa" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sky Background */}
        <rect width="1200" height="360" fill="url(#nightSky)" />

        {/* Stars in Sky */}
        <g fill="#ffffff" opacity="0.65">
          <circle cx="120" cy="45" r="1.2" />
          <circle cx="190" cy="80" r="0.8" />
          <circle cx="280" cy="35" r="1.5" />
          <circle cx="350" cy="90" r="0.7" />
          <circle cx="480" cy="45" r="1.2" />
          <circle cx="560" cy="25" r="1.8" />
          <circle cx="630" cy="65" r="1.0" />
          <circle cx="720" cy="35" r="1.4" />
          <circle cx="830" cy="85" r="0.8" />
          <circle cx="910" cy="35" r="1.3" />
          <circle cx="1020" cy="65" r="1.1" />
          <circle cx="1110" cy="45" r="1.6" />
          <circle cx="230" cy="115" r="1" />
          <circle cx="500" cy="85" r="1.3" />
          <circle cx="700" cy="95" r="1.2" />
          <circle cx="880" cy="110" r="0.9" />
        </g>

        {/* Big Dipper Constellation (Großer Wagen) - Positioned centrally so it's visible on mobile */}
        <g stroke="#ffffff" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.45">
          <polyline points="480,45 520,55 555,75 590,78 595,105 635,102 630,76 590,78" fill="none" />
          <circle cx="480" cy="45" r="2" fill="#fff" />
          <circle cx="520" cy="55" r="2" fill="#fff" />
          <circle cx="555" cy="75" r="2" fill="#fff" />
          <circle cx="590" cy="78" r="2.2" fill="#fff" />
          <circle cx="595" cy="105" r="2" fill="#fff" />
          <circle cx="635" cy="102" r="2" fill="#fff" />
          <circle cx="630" cy="76" r="2" fill="#fff" />
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
          <polygon points="110,185 95,245 125,245" />
          <polygon points="110,170 98,220 122,220" />
          <polygon points="110,155 102,195 118,195" />
          <polygon points="150,195 138,255 162,255" />
          <polygon points="150,180 141,230 159,230" />
          <polygon points="80,210 70,265 90,265" />
          {/* Near Pines Left of Tent */}
          <polygon points="340,205 328,260 352,260" />
          <polygon points="340,190 331,235 349,235" />
        </g>

        {/* Forest Pines (Right) */}
        <g fill="#171412">
          <polygon points="1060,185 1045,245 1075,245" />
          <polygon points="1060,170 1048,220 1072,220" />
          <polygon points="1110,200 1098,260 1122,260" />
          <polygon points="1020,210 1010,265 1030,265" />
          {/* Near Pines Right of Jurte */}
          <polygon points="860,205 848,260 872,260" />
          <polygon points="860,190 851,235 869,235" />
        </g>

        {/* Foreground Campsite Ground */}
        <path
          d="M0 275 Q350 255 600 260 T1200 275 L1200 360 L0 360 Z"
          fill="#231f1d"
        />

        {/* Ambient Fire Glow on Ground */}
        <rect x="0" y="140" width="1200" height="220" fill="url(#fireLight)" />

        {/* Tent 1: Spatzzelt (Left of Center) with Warm Lantern Glow */}
        <circle cx="445" cy="255" r="70" fill="url(#tentGlow1)" />
        <g transform="translate(390, 215)">
          {/* Tent Canvas */}
          <polygon points="60,10 10,65 60,75" fill="#38312e" stroke="#524742" strokeWidth="1" />
          <polygon points="60,10 60,75 110,65" fill="#292421" stroke="#524742" strokeWidth="1" />
          {/* Illuminated Entrance Triangle */}
          <polygon points="60,75 48,48 72,48" fill="#fef08a" opacity="0.9" />
          {/* Ridge Pole */}
          <line x1="60" y1="10" x2="60" y2="3" stroke="#78716c" strokeWidth="2" />
        </g>

        {/* Tent 2: Jurte / Rundzelt (Right of Center) with Warm Glow */}
        <circle cx="755" cy="255" r="75" fill="url(#tentGlow2)" />
        <g transform="translate(700, 210)">
          {/* Jurte Roof Cone */}
          <polygon points="65,10 12,50 118,50" fill="#2d2724" stroke="#443a36" strokeWidth="1" />
          {/* Jurte Walls */}
          <rect x="16" y="50" width="98" height="28" fill="#211d1a" stroke="#443a36" strokeWidth="1" />
          {/* Glowing doorway */}
          <rect x="55" y="54" width="20" height="24" rx="2" fill="#fed7aa" opacity="0.92" />
          {/* Top smoke opening */}
          <ellipse cx="65" cy="10" rx="9" ry="3.5" fill="#141110" stroke="#f59e0b" strokeWidth="1" />
        </g>

        {/* Campfire (Center: X=600, Y=265) */}
        <g transform="translate(575, 260)">
          {/* Fire pit stones in circle */}
          <ellipse cx="25" cy="24" rx="32" ry="11" fill="#1c1917" stroke="#44403c" strokeWidth="1.5" />
          
          {/* Cross Logs */}
          <line x1="0" y1="20" x2="50" y2="20" stroke="#451a03" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="6" y1="27" x2="44" y2="13" stroke="#78350f" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="10" y1="13" x2="40" y2="27" stroke="#92400e" strokeWidth="5" strokeLinecap="round" />

          {/* Glowing Flames */}
          <path
            d="M25 -14 Q40 8 38 20 Q25 26 12 20 Q10 6 25 -14 Z"
            fill="#ea580c"
          />
          <path
            d="M25 -8 Q35 8 33 18 Q25 22 17 18 Q15 6 25 -8 Z"
            fill="#f59e0b"
          />
          <path
            d="M25 -2 Q31 8 29 16 Q25 19 21 16 Q19 8 25 -2 Z"
            fill="#fef08a"
          />
          <circle cx="25" cy="14" r="4" fill="#ffffff" />

          {/* Sparks / Embers rising */}
          <circle cx="23" cy="-22" r="2.0" fill="#fbbf24" />
          <circle cx="32" cy="-34" r="1.6" fill="#f97316" />
          <circle cx="17" cy="-42" r="1.3" fill="#ef4444" />
          <circle cx="29" cy="-55" r="1.5" fill="#fbbf24" />
          <circle cx="21" cy="-68" r="1.2" fill="#f59e0b" />
          <circle cx="26" cy="-82" r="1.0" fill="#fbbf24" />
        </g>
      </svg>
    </div>
  );
}
