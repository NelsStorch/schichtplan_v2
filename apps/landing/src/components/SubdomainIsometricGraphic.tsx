import React from 'react';

export function SubdomainIsometricGraphic({ className = '' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 380 230"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-2xl"
      >
        <defs>
          <linearGradient id="serverGrad" x1="190" y1="80" x2="190" y2="190" gradientUnits="userSpaceOnUse">
            <stop stopColor="#262626" />
            <stop offset="1" stopColor="#0f0f0f" />
          </linearGradient>
          <linearGradient id="neonCyan" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#38bdf8" />
            <stop offset="1" stopColor="#0284c7" />
          </linearGradient>
          <radialGradient id="ringGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Ring Glow */}
        <ellipse cx="190" cy="155" rx="130" ry="50" fill="url(#ringGlow)" />

        {/* Isometric Grid Plane */}
        <g opacity="0.35">
          <line x1="70" y1="155" x2="190" y2="95" stroke="#525252" strokeWidth="1" />
          <line x1="190" y1="95" x2="310" y2="155" stroke="#525252" strokeWidth="1" />
          <line x1="310" y1="155" x2="190" y2="215" stroke="#525252" strokeWidth="1" />
          <line x1="190" y1="215" x2="70" y2="155" stroke="#525252" strokeWidth="1" />
        </g>

        {/* Isometric Server Cube 1 (Bottom Stage) */}
        <g transform="translate(0, 10)">
          {/* Front Left Face */}
          <path d="M130 135 L190 165 L190 195 L130 165 Z" fill="#171717" stroke="#404040" strokeWidth="1" />
          {/* Front Right Face */}
          <path d="M190 165 L250 135 L250 165 L190 195 Z" fill="#262626" stroke="#404040" strokeWidth="1" />
          {/* Top Face */}
          <path d="M130 135 L190 105 L250 135 L190 165 Z" fill="#404040" stroke="#737373" strokeWidth="1" />

          {/* LED Server Blades on Left Face */}
          <circle cx="145" cy="150" r="2" fill="#10b981" />
          <circle cx="155" cy="155" r="2" fill="#38bdf8" />
          <circle cx="165" cy="160" r="2" fill="#10b981" />
          <line x1="145" y1="154" x2="175" y2="169" stroke="#525252" strokeWidth="1" />
          <line x1="145" y1="158" x2="175" y2="173" stroke="#525252" strokeWidth="1" />
        </g>

        {/* Isometric Server Cube 2 (Stacked Top Stage) */}
        <g transform="translate(0, -30)">
          {/* Front Left Face */}
          <path d="M145 120 L190 142 L190 162 L145 140 Z" fill="#1f1f1f" stroke="#525252" strokeWidth="1" />
          {/* Front Right Face */}
          <path d="M190 142 L235 120 L235 140 L190 162 Z" fill="#2d2d2d" stroke="#525252" strokeWidth="1" />
          {/* Top Face */}
          <path d="M145 120 L190 98 L235 120 L190 142 Z" fill="#525252" stroke="#a3a3a3" strokeWidth="1" />

          {/* Glowing Status Ring */}
          <ellipse cx="190" cy="120" rx="20" ry="10" fill="none" stroke="#38bdf8" strokeWidth="2" />
        </g>

        {/* Orbiting Orbital Satellite Rings */}
        <ellipse
          cx="190"
          cy="110"
          rx="95"
          ry="38"
          fill="none"
          stroke="#0ea5e9"
          strokeWidth="1.2"
          strokeDasharray="8 6"
          opacity="0.6"
          transform="rotate(-10 190 110)"
        />

        {/* Big Floating 3D URL Capsule (Hero Floating Element) */}
        <g transform="translate(65, 30)">
          {/* Glass Card Shadow */}
          <rect x="0" y="5" width="250" height="42" rx="21" fill="rgba(0,0,0,0.4)" filter="blur(6px)" />
          {/* Main Glass Capsule */}
          <rect
            x="0"
            y="0"
            width="250"
            height="42"
            rx="21"
            fill="rgba(23, 23, 23, 0.92)"
            stroke="url(#neonCyan)"
            strokeWidth="1.5"
          />
          {/* Padlock Icon */}
          <g transform="translate(16, 12)">
            <rect x="0" y="6" width="16" height="12" rx="2.5" fill="#10b981" />
            <path d="M4 6 V3.5 C4 1.5 12 1.5 12 3.5 V6" stroke="#10b981" strokeWidth="2" fill="none" />
            <circle cx="8" cy="12" r="1.5" fill="#fff" />
          </g>
          {/* Subdomain Text */}
          <text x="44" y="26" fill="#737373" fontSize="12" fontFamily="monospace">
            https://<tspan fill="#38bdf8" fontWeight="bold">illnau</tspan>.cevi-schichtplan.ch
          </text>
        </g>

        {/* Floating Satellite Subdomain Badges */}
        {/* Left Subdomain: "uster" */}
        <g transform="translate(25, 115)">
          <rect x="0" y="0" width="75" height="24" rx="12" fill="#1c1917" stroke="#38bdf8" strokeWidth="1" />
          <circle cx="10" cy="12" r="3.5" fill="#10b981" />
          <text x="20" y="16" fill="#e5e5e5" fontSize="10" fontWeight="600" fontFamily="sans-serif">
            uster.*
          </text>
        </g>

        {/* Right Subdomain: "wetzikon" */}
        <g transform="translate(275, 115)">
          <rect x="0" y="0" width="85" height="24" rx="12" fill="#1c1917" stroke="#fb7185" strokeWidth="1" />
          <circle cx="10" cy="12" r="3.5" fill="#e11d48" />
          <text x="20" y="16" fill="#e5e5e5" fontSize="10" fontWeight="600" fontFamily="sans-serif">
            wetzikon.*
          </text>
        </g>
      </svg>
    </div>
  );
}
