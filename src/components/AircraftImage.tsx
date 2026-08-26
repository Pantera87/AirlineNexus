import { useState, useMemo } from 'react';
import { Plane } from 'lucide-react';
import type { AircraftCategory } from '@/types/game';
import { AIRCRAFT_DATABASE } from '@/data/aircraft';
import { getAircraftImageSrc } from '../utils/aircraftImages';
import { AircraftArtwork } from './icons/AircraftSilhouettes';

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
  /** Aircraft category for the vector-silhouette fallback. When omitted, it is resolved
      from the aircraft database via keyOrId. */
  category?: AircraftCategory;
}

/**
 * Renders an aircraft photo when one is available at
 * /images/aircraft/<key>.jpg. Tries multiple candidate filenames in order
 * (primary key first, then fallbacks). Falls back to a category silhouette
 * artwork, and finally to a generic plane icon if none load successfully.
 */
export default function AircraftImage({
  keyOrId,
  fallbackKeys = [],
  alt = 'Aircraft',
  className = '',
  fit = 'cover',
  category,
}: AircraftImageProps) {
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

  // Resolve the silhouette category: explicit prop wins, else look up the database.
  const resolvedCategory: AircraftCategory | undefined =
    category ?? AIRCRAFT_DATABASE.find((a) => a.imageKey === keyOrId || a.id === keyOrId)?.category;

  // All candidates exhausted -> silhouette artwork (or icon when category unknown).
  if (candidates.length === 0 || index >= candidates.length) {
    if (resolvedCategory) {
      return <AircraftArtwork category={resolvedCategory} className={`rounded-lg ${className}`} artClassName="w-3/4 h-3/4" />;
    }
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
