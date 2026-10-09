const sizeClasses: Record<string, string> = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-20 h-20',
};

export function CeviLogo({
  className,
  size = 'md',
  logoUrl,
  alt = 'Cevi Logo',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  logoUrl?: string | null;
  alt?: string;
  rounded?: string;
}) {
  const sizeClass = className || sizeClasses[size] || 'w-12 h-12';
  const src = logoUrl || '/images/cevi-logo.svg';
  return (
    <div className={`${sizeClass} relative flex items-center justify-center shrink-0 select-none overflow-hidden`}>
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain drop-shadow-md"
      />
    </div>
  );
}
