export function CeviLogo({ className = 'w-12 h-12', rounded = 'rounded-2xl' }: { className?: string; rounded?: string }) {
  return (
    <div
      className={`${className} ${rounded} bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center shadow-lg shadow-rose-950/60 p-2 text-white select-none`}
    >
      {/* Stilisiertes Cevi-Dreieck / Kreuz Symbol */}
      <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full drop-shadow">
        {/* Dreiecks-Basis */}
        <polygon points="50,12 88,82 12,82" fill="white" opacity="0.95" />
        {/* Rotes Cevi-Kreuz innen */}
        <polygon points="50,28 78,80 22,80" fill="#e11d48" />
        {/* Weißer Balken vertikal */}
        <rect x="44" y="44" width="12" height="28" fill="white" rx="1.5" />
        {/* Weißer Balken horizontal */}
        <rect x="36" y="52" width="28" height="12" fill="white" rx="1.5" />
      </svg>
    </div>
  );
}
