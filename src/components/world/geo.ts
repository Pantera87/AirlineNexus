// ---------------------------------------------------------------------------
// World View coordinate system
// ---------------------------------------------------------------------------
// Convention: the day/night textures are equirectangular ("plate carrée")
// world maps where the LEFT EDGE of the image is the 180° meridian.
//
//   Texture u (horizontal, left → right):  lon -180 … +180
//     u = (lon + 180) / 360        (u = 0 at the left edge / 180° meridian)
//   Texture v (vertical, top → bottom):   lat +90 … -90
//     v = (90 - lat) / 180         (v = 0 at the North Pole)
//
// This matches three.js SphereGeometry UVs exactly (u = 0 sits on the -X
// axis, u = 0.5 on +X), so converting lat/lon → position with the formulas
// below lands pins precisely on their real-world locations in the texture:
//   • Left edge / 180° meridian → -X (unrotated)
//   • Prime meridian (lon 0)    → +X (unrotated, faces the sun at 12:00 UTC)
//   • North Pole                → +Y
//
// All functions are pure and shared by the 3D globe view. The UV / screen
// helpers can be reused unchanged by a future flat 2D world map.
// ---------------------------------------------------------------------------

export const GLOBE_RADIUS = 45

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

export interface LatLon {
  lat: number
  lon: number
}

/** Clamp a latitude into [-90, 90]. */
export function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat))
}

/** Wrap a longitude (any value) into [-180, 180]. */
export function wrapLon(lon: number): number {
  return ((lon + 540) % 360) - 180
}

// ---------------------------------------------------------------------------
// UV mapping (texture space) — also the basis for flat 2D maps
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to texture UV coordinates.
 * u: 0 at the left edge (180° meridian) → 1 at the right edge (same meridian).
 * v: 0 at the top (North Pole) → 1 at the bottom (South Pole).
 */
export function latLonToUV(lat: number, lon: number): [u: number, v: number] {
  const u = (wrapLon(lon) + 180) / 360
  const v = (90 - clampLat(lat)) / 180
  return [u, v]
}

/** Inverse of {@link latLonToUV}. */
export function uvToLatLon(u: number, v: number): LatLon {
  const uc = Math.max(0, Math.min(1, u))
  const vc = Math.max(0, Math.min(1, v))
  return {
    lat: 90 - vc * 180,
    lon: wrapLon(uc * 360 - 180),
  }
}

// ---------------------------------------------------------------------------
// Flat 2D screen mapping (for a future flat world map rendered at the
// texture's native aspect ratio)
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to pixel coordinates inside a flat map container of the
 * given size. The container must use the same equirectangular aspect as the
 * source textures (2:1 for full-world maps).
 */
export function latLonToScreenXY(lat: number, lon: number, width: number, height: number): [x: number, y: number] {
  const [u, v] = latLonToUV(lat, lon)
  return [u * width, v * height]
}

/** Inverse of {@link latLonToScreenXY}. */
export function screenXYToLatLon(x: number, y: number, width: number, height: number): LatLon {
  return uvToLatLon(x / width, y / height)
}

// ---------------------------------------------------------------------------
// 3D globe positions (three.js world/group space, unrotated frame)
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to a 3D position on the globe surface, aligned with the
 * three.js SphereGeometry UV layout of the day/night textures.
 * Use {@link GLOBE_RADIUS} for the surface, or a slightly larger radius for
 * pins/arcs lifted above it.
 */
export function latLonToPosition(lat: number, lon: number, radius: number = GLOBE_RADIUS): [number, number, number] {
  const theta = (90 - clampLat(lat)) * DEG2RAD // polar angle from +Y (North Pole)
  const phi = (wrapLon(lon) + 180) * DEG2RAD   // == u * 2π in the three.js sphere

  const x = -radius * Math.cos(phi) * Math.sin(theta)
  const y = radius * Math.cos(theta)
  const z = radius * Math.sin(phi) * Math.sin(theta)

  return [x, y, z]
}

/** Inverse of {@link latLonToPosition}. Longitude is ambiguous at the poles. */
export function positionToLatLon(x: number, y: number, z: number): LatLon {
  const len = Math.sqrt(x * x + y * y + z * z)
  if (len === 0) return { lat: 0, lon: 0 }

  const yn = Math.max(-1, Math.min(1, y / len))
  const theta = Math.acos(yn)              // polar angle from +Y
  const lat = clampLat(Math.round((90 - theta * RAD2DEG) * 1e6) / 1e6)

  // From x = -cos(phi)·sin(theta), z = sin(phi)·sin(theta):
  const phi = Math.atan2(z, -x)
  const lon = wrapLon(phi * RAD2DEG - 180)

  return { lat, lon }
}

// ---------------------------------------------------------------------------
// Great-circle paths (coordinate space — usable for both 3D and 2D)
// ---------------------------------------------------------------------------

/**
 * Interpolate along the great circle between two points, returning
 * `steps + 1` intermediate lat/lon positions (endpoints included).
 * Project each result with {@link latLonToPosition} for the 3D globe, or with
 * {@link latLonToScreenXY} for a flat 2D map.
 */
export function greatCirclePath(from: LatLon, to: LatLon, steps = 32): LatLon[] {
  const a = latLonToPosition(from.lat, from.lon, 1) // unit vectors on the sphere
  const b = latLonToPosition(to.lat, to.lon, 1)

  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const omega = Math.acos(dot)

  // Degenerate: same point (or antipodal — airports will never be antipodal).
  if (omega < 1e-6) {
    return Array.from({ length: steps + 1 }, () => ({ lat: from.lat, lon: wrapLon(from.lon) }))
  }

  const sinOmega = Math.sin(omega)
  const result: LatLon[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Slerp between the two unit vectors (identical to interpolating on the great circle).
    const ka = Math.sin((1 - t) * omega) / sinOmega
    const kb = Math.sin(t * omega) / sinOmega
    result.push(
      positionToLatLon(ka * a[0] + kb * b[0], ka * a[1] + kb * b[1], ka * a[2] + kb * b[2])
    )
  }
  return result
}
