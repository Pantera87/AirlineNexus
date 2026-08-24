// ============================================================
// Aircraft image path helpers
// ------------------------------------------------------------
// Aircraft photos are stored under /images/aircraft/<key>.jpg
// (served from the public/ directory). If a file is missing, the
// consuming component gracefully falls back to a generic icon.
// ============================================================

export const AIRCRAFT_IMAGE_DIR = '/images/aircraft';

/**
 * Normalize an aircraft id / model string into a stable image filename key.
 * e.g. "boeing-737-max-8" -> "boeing-737-max-8", "crj200" -> "crj200".
 */
function toImageKey(keyOrId: string | undefined | null): string {
  if (!keyOrId) return '';
  return keyOrId
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Build the public URL for an aircraft image.
 * @param keyOrId An explicit imageKey (preferred) or an aircraft id/model to derive from.
 */
export function getAircraftImageSrc(keyOrId: string | undefined | null): string {
  const key = toImageKey(keyOrId);
  if (!key) return '';
  return `${AIRCRAFT_IMAGE_DIR}/${key}.jpg`;
}
