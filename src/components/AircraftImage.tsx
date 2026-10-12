// ============================================================
// Aircraft image component — renders a square 1024×1024 photo
// with object-cover fill, or falls back to a gradient placeholder.
// ============================================================

const FALLBACK_GRADIENT = 'bg-linear-to-br from-sky-900/40 via-runway-800/60 to-blue-900/40';

export default function AircraftImage({
  aircraftId,
  size = 'full',
  alt = '',
  className = '',
}: {
  aircraftId: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  alt?: string;
  className?: string;
}) {
  // Size presets — all square to match 1024×1024 source
  const sizeClasses: Record<string, string> = {
    sm: 'w-16 h-16',       // 64px — fleet grid thumbnails
    md: 'w-32 h-32',       // 128px — card inline
    lg: 'w-48 h-48',       // 192px — detail modal
    full: 'w-full aspect-square', // fills parent width
  };

  const src = `/images/aircraft/${aircraftId}/image.png`;

  return (
    <div className={`relative overflow-hidden rounded-lg ${sizeClasses[size]} ${className}`}>
      {/* Fallback gradient always present underneath */}
      <div className={`absolute inset-0 ${FALLBACK_GRADIENT}`} />
      {/* Actual image on top */}
      <img
        src={src}
        alt={alt || `Aircraft ${aircraftId}`}
        className="absolute inset-0 w-full h-full object-cover object-center"
        loading="lazy"
        onError={() => { /* gradient shows through */ }}
      />
    </div>
  );
}
