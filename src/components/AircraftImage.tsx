import { useState, useMemo } from 'react';
import { Plane } from 'lucide-react';
import { getAircraftImageSrc } from '../utils/aircraftImages';

interface AircraftImageProps {
  /** Primary imageKey or aircraft id to derive the filename from. */
  keyOrId: string;
  /** Additional candidate keys to try if the primary fails (e.g. alternate naming conventions). */
  fallbackKeys?: string[];
  /** Accessible label / alt text. */
  alt?: string;
  /** Tailwind classes for the outer box. Defaults suit a wide, short banner. */
  className?: string;
  /** How the image fits its container: 'cover' (fill & crop) or 'contain' (fit fully). Default: 'cover'. */
  fit?: 'cover' | 'contain';
}

/**
 * Renders an aircraft photo when one is available at
 * /images/aircraft/<key>.jpg. Tries multiple candidate filenames in order
 * (primary key first, then fallbacks). Falls back to a generic plane icon
 * if none load successfully.
 */
export default function AircraftImage({ keyOrId, fallbackKeys = [], alt = 'Aircraft', className = '', fit = 'cover' }: AircraftImageProps) {
  // Build ordered list of candidate URLs: primary first, then fallbacks (deduped).
  const candidates = useMemo(() => {
    const all = [keyOrId, ...fallbackKeys];
    const seen = new Set<string>();
    return all
      .map((k) => getAircraftImageSrc(k))
      .filter((src): src is string => {
        if (!src || seen.has(src)) return false;
        seen.add(src);
        return true;
      });
  }, [keyOrId, fallbackKeys]);

  const [index, setIndex] = useState(0);

  // All candidates exhausted -> render the icon fallback.
  if (candidates.length === 0 || index >= candidates.length) {
    return (
      <div className={`flex items-center justify-center bg-slate-700 rounded-lg ${className}`}>
        <Plane className="w-10 h-10 text-gray-500" />
      </div>
    );
  }

  const src = candidates[index];

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setIndex((i) => i + 1)}
      className={`${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`}
    />
  );
}
