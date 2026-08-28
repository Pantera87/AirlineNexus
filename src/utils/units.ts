// ============================================================
// Unit-aware display formatting (metric vs imperial).
//
// All internal game math runs in nautical miles (nm) and knots (kt);
// these helpers convert to the player's preferred display unit system
// at the presentation layer only. `units` comes from game settings.
// Temperature formatting (°C/°F) will live here too when implemented.
// ============================================================

import { useGameStore } from '@/store/gameStore';
import type { UnitSystem } from '@/types/game';
import { KM_TO_NM, NM_TO_KM } from '@/utils/routeEngine';

/**
 * The player's preferred unit system, with a fallback for old saves that
 * predate the setting (they persist fine, they just lack the field).
 */
export function useUnits(): UnitSystem {
  return useGameStore((state) => state.settings.units) ?? 'imperial';
}

/** Distance formatted from an internal nautical-mile value, e.g. "1,234 km" or "666 nm". */
export function formatDistanceNm(distanceNm: number, units: UnitSystem): string {
  const value = units === 'metric' ? distanceNm * NM_TO_KM : distanceNm;
  return `${Math.round(value).toLocaleString('en-US')} ${units === 'metric' ? 'km' : 'nm'}`;
}

/** Distance formatted from a kilometers value (marketplace data), e.g. "3,547 nm" or "6,570 km". */
export function formatDistanceKm(distanceKm: number, units: UnitSystem): string {
  const value = units === 'imperial' ? distanceKm * KM_TO_NM : distanceKm;
  return `${Math.round(value).toLocaleString('en-US')} ${units === 'metric' ? 'km' : 'nm'}`;
}

/** Speed formatted from a km/h value (marketplace data), e.g. "957 km/h" or "517 kt". */
export function formatSpeedKmh(speedKmh: number, units: UnitSystem): string {
  const value = units === 'imperial' ? speedKmh / NM_TO_KM : speedKmh;
  return `${Math.round(value).toLocaleString('en-US')} ${units === 'metric' ? 'km/h' : 'kt'}`;
}

/** Speed formatted from an internal knots value (game aircraft data), e.g. "957 km/h" or "517 kt". */
export function formatSpeedKt(speedKt: number, units: UnitSystem): string {
  const value = units === 'metric' ? speedKt * NM_TO_KM : speedKt;
  return `${Math.round(value).toLocaleString('en-US')} ${units === 'metric' ? 'km/h' : 'kt'}`;
}