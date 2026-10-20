import React from 'react';

export function CeviDbIsometricGraphic({ className = '' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 400 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-2xl"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="pedestalGrad" x1="200" y1="120" x2="200" y2="220" gradientUnits="userSpaceOnUse">
            <stop stopColor="#292524" />
            <stop offset="1" stopColor="#141210" />
          </linearGradient>
          <linearGradient id="ceviRed" x1="170" y1="40" x2="230" y2="110" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fb7185" />
            <stop offset="1" stopColor="#e11d48" />
          </linearGradient>
          <linearGradient id="beamGrad" x1="200" y1="30" x2="200" y2="150" gradientUnits="userSpaceOnUse">
            <stop stopColor="#e11d48" stopOpacity="0.55" />
            <stop offset="1" stopColor="#e11d48" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="goldGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Ambient Glow */}
        <ellipse cx="200" cy="155" rx="140" ry="50" fill="url(#goldGlow)" />

        {/* Isometric Base Plate / Pedestal (Layer 0) */}
        <g transform="translate(0, 15)">
          {/* Base bottom extrusion */}
          <path
            d="M80 140 L200 200 L320 140 L320 155 L200 215 L80 155 Z"
            fill="#1c1917"
            stroke="#44403c"
            strokeWidth="1"
          />
          {/* Base top diamond surface */}
          <path
            d="M80 140 L200 80 L320 140 L200 200 Z"
            fill="url(#pedestalGrad)"
            stroke="#57534e"
            strokeWidth="1.5"
          />
          {/* Inner glowing circuitry lines */}
          <path
            d="M120 140 L200 100 L280 140 L200 180 Z"
            fill="none"
            stroke="#10b981"
            strokeWidth="1.2"
            strokeDasharray="6 3"
            opacity="0.6"
          />
          <path
            d="M150 140 L200 115 L250 140 L200 165 Z"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.5"
            opacity="0.8"
          />
          <circle cx="200" cy="140" r="4" fill="#38bdf8" />
          <circle cx="120" cy="140" r="3" fill="#10b981" />
          <circle cx="280" cy="140" r="3" fill="#10b981" />
        </g>

        {/* Holographic Light Cone Beam */}
        <polygon points="160,50 240,50 280,150 120,150" fill="url(#beamGrad)" />

        {/* Floating Isometric 3D Cevi Cross & Shield (Layer 1 - Floating at Z=50) */}
        <g transform="translate(0, -15)">
          {/* Shield Base in Isometric Angle */}
          <g filter="url(#glow)">
            <path
              d="M200 45 L245 68 L245 110 C245 135 200 155 200 155 C200 155 155 135 155 110 L155 68 Z"
              fill="rgba(30, 27, 24, 0.85)"
              stroke="url(#ceviRed)"
              strokeWidth="2.5"
            />
          </g>

          {/* 3D Cevi Red Cross inside Shield */}
          <g transform="translate(182, 72) scale(0.75)">
            {/* Horizontal Bar with 3D Bevel */}
            <rect x="0" y="16" width="48" height="16" rx="4" fill="url(#ceviRed)" />
            {/* Vertical Bar with 3D Bevel */}
            <rect x="16" y="0" width="16" height="48" rx="4" fill="url(#ceviRed)" />
            {/* Center Core */}
            <circle cx="24" cy="24" r="5" fill="#ffffff" />
          </g>

          {/* Lock Shackle / Hologram Detail */}
          <path
            d="M190 62 C190 52 210 52 210 62"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </g>

        {/* Floating 3D Badge Left: "Cevi.DB-Login" (Clear margin from central shield) */}
        <g transform="translate(22, 65)">
          <rect
            x="0"
            y="3"
            width="122"
            height="34"
            rx="17"
            fill="rgba(0,0,0,0.4)"
            filter="blur(5px)"
          />
          <rect
            x="0"
            y="0"
            width="122"
            height="34"
            rx="17"
            fill="rgba(28, 25, 23, 0.94)"
            stroke="#3b82f6"
            strokeWidth="1.2"
          />
          <circle cx="17" cy="17" r="7" fill="#3b82f6" />
          <path d="M14 17 L16 19 L20 15" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <text x="32" y="21" fill="#f5f5f4" fontSize="10.5" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">
            Cevi.DB-Login
          </text>
        </g>

        {/* Floating 3D Badge Right: "Name & Abteilung" (Clear margin from central shield) */}
        <g transform="translate(254, 75)">
          <rect
            x="0"
            y="3"
            width="128"
            height="34"
            rx="17"
            fill="rgba(0,0,0,0.4)"
            filter="blur(5px)"
          />
          <rect
            x="0"
            y="0"
            width="128"
            height="34"
            rx="17"
            fill="rgba(28, 25, 23, 0.94)"
            stroke="#10b981"
            strokeWidth="1.2"
          />
          <circle cx="17" cy="17" r="7" fill="#10b981" />
          <path d="M14 17 L16 19 L20 14" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <text x="30" y="21" fill="#f5f5f4" fontSize="10" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">
            Name & Abteilung
          </text>
        </g>

        {/* Floating 3D Crypto-Key at Top Right */}
        <g transform="translate(305, 26) rotate(-15)">
          <circle cx="14" cy="14" r="8" fill="none" stroke="#f59e0b" strokeWidth="3" />
          <path d="M21 14 L36 14 M31 14 L31 19 M35 14 L35 18" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
