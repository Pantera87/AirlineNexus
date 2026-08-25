// ============================================================
// Fleet Dispatcher — automatic, location-aware aircraft-to-route assignment
// ============================================================
//
// Aircraft belong to a SHARED POOL per type. Because every route is a closed
// hub loop (it starts and ends at the hub), an aircraft's home base is always
// the hub: deploying it only requires that it can stand at the hub — or paying
// a one-time "positioning" cost to deadhead it back. The dispatcher will:
//   1. Compute how many aircraft each ACTIVE route needs on its own to sustain
//      its frequency (ceil(frequency / full cycles per week)).
//   2. Keep aircraft already flying a route ("sticky") — no needless shuffling.
//   3. Deploy free pool aircraft into short-staffed routes, most profitable
//      route first. Free aircraft sitting away from the hub only get deployed
//      if the airline can afford to bring them back (positioning cost).
//   4. Release surplus/stale aircraft (frequency reduced, type changed, route
//      paused) back to the hub pool.
//
// The plan only records STATE CHANGES; gameStore.dispatchFleet() turns it into
// fleet mutations. Economics live in settleWeeklyRoutes(), which additionally
// scales revenue by shared-pool time utilization — so a single aircraft can
// legitimately cover parts of several same-type routes per day.

import type { Aircraft, Airport, AircraftType, Route } from '@/types/game';
import { AIRPORT_DATABASE } from '@/data/airports';
import {
  calculateRouteDistanceNm,
  checkLoopRange,
  DEFAULT_FUEL_PRICE_PER_KG,
  estimateFlightTimeMinutes,
  findAircraftById,
  maxLoopCyclesPerDay,
  previewLoopEconomics,
} from './routeEngine';

/** How a single route is staffed after a dispatch run. */
export interface RouteStaffing {
  routeId: string;
  typeId: string;
  required: number;
  staffed: number;
}

export interface PoolStats {
  owned: number;
  /** Usable = status available or in-flight (maintenance/parked/storage don't count). */
  usable: number;
  /** Usable aircraft not currently assigned to any route. */
  free: number;
  /** Usable aircraft assigned to a route. */
  deployed: number;
}

export interface DispatchInput {
  hubIata: string;
  routes: Route[];
  fleet: Aircraft[];
  /** Resolves a route's closed loop path (HUB → stops… → DEST) or null if unknown. */
  resolvePath: (route: Route) => Airport[] | null;
  fuelPricePerKg?: number;
  /** Cash available to cover one-time positioning costs during this dispatch. */
  cash: number;
}

export interface DispatchPlan {
  /** Aircraft whose assignment CHANGES: new routeId, or null when released back to the hub pool. */
  assignments: Map<string, string | null>;
  /** aircraftId → one-time cost to deadhead it back to the hub this dispatch. */
  positionCosts: Map<string, number>;
  totalPositionCost: number;
  staffing: Record<string, RouteStaffing>;
  shortfalls: RouteStaffing[];
  changed: boolean;
  dispatchedCount: number;
  releasedCount: number;
}

/** Full loop cycles one aircraft of this type can complete per week on this path. */
export function getWeeklyCycleCapacity(path: Airport[] | null, type: AircraftType | undefined): number {
  if (!path || !type) return 0;
  return maxLoopCyclesPerDay(path, type) * 7;
}

/** Aircraft a route needs on its own to sustain the given frequency (0 = infeasible/unknown). */
export function getRequiredAircraftCount(
  path: Airport[] | null,
  type: AircraftType | undefined,
  frequencyPerWeek: number
): number {
  if (!path || !type || !(frequencyPerWeek > 0)) return 0;
  if (!checkLoopRange(type, path).feasible) return 0;
  const cyclesPerWeek = getWeeklyCycleCapacity(path, type);
  if (cyclesPerWeek <= 0) return 0;
  return Math.max(1, Math.ceil(frequencyPerWeek / cyclesPerWeek));
}

/** Pool breakdown for one aircraft type across the whole fleet. */
export function getPoolStats(fleet: Aircraft[], typeId: string): PoolStats {
  let owned = 0;
  let usable = 0;
  let free = 0;
  let deployed = 0;
  for (const a of fleet) {
    if (a.typeId !== typeId) continue;
    owned += 1;
    const isUsable = a.status === 'available' || a.status === 'in-flight';
    if (!isUsable) continue;
    usable += 1;
    if (a.assignedRoute) deployed += 1;
    else free += 1;
  }
  return { owned, usable, free, deployed };
}

/** Number of fleet aircraft currently assigned to a route. */
export function getRouteStaffing(fleet: Aircraft[], routeId: string): number {
  let n = 0;
  for (const a of fleet) if (a.assignedRoute === routeId) n += 1;
  return n;
}

/**
 * One-time cost to deadhead an aircraft from `fromIata` back to the hub:
 * fuel for the repositioning flight + a blended landing/handling share at the hub.
 */
export function estimatePositioningCost(
  fromIata: string,
  type: AircraftType,
  hubAirport: Airport | undefined,
  fuelPricePerKg: number
): number {
  if (!hubAirport || !fromIata || fromIata === hubAirport.iata) return 0;
  const from = AIRPORT_DATABASE.find((a) => a.iata === fromIata);
  if (!from) return 0; // Unknown airport — treat as free (should not happen in practice).
  const minutes = estimateFlightTimeMinutes(calculateRouteDistanceNm(from, hubAirport), type);
  const fuelCost = type.fuelBurnPerHour * (minutes / 60) * fuelPricePerKg;
  return Math.round(fuelCost + hubAirport.landingFee * 0.15);
}

interface RouteDemand {
  route: Route;
  typeId: string;
  type: AircraftType;
  path: Airport[] | null;
  required: number;
  /** Staffed count, mutated as the dispatch assigns/releases aircraft. */
  staffed: number;
  /** Estimated weekly profit — used to prioritize which routes get aircraft first. */
  rank: number;
}

/** Compute a full fleet dispatch plan (pure — no state mutation). */
export function computeDispatchPlan(input: DispatchInput): DispatchPlan {
  const { hubIata, routes, fleet } = input;
  const fuelPrice = input.fuelPricePerKg ?? DEFAULT_FUEL_PRICE_PER_KG;
  const hubAirport = AIRPORT_DATABASE.find((a) => a.iata === hubIata);

  const assignments = new Map<string, string | null>();
  const positionCosts = new Map<string, number>();
  let totalPositionCost = 0;
  let budget = input.cash;
  let dispatchedCount = 0;
  let releasedCount = 0;
  const touched = new Set<string>();

  const isUsable = (a: Aircraft): boolean => a.status === 'available' || a.status === 'in-flight';
  const positionCostOf = (a: Aircraft, type: AircraftType): number =>
    a.currentLocation && a.currentLocation !== hubIata
      ? estimatePositioningCost(a.currentLocation, type, hubAirport, fuelPrice)
      : 0;

  // --- 1. Route demand per type (active routes only) -------------------------
  const activeRouteIds = new Set(routes.filter((r) => r.isActive).map((r) => r.id));
  const demandsByType = new Map<string, RouteDemand[]>();
  for (const route of routes) {
    if (!route.isActive || !route.aircraftId) continue;
    const type = findAircraftById(route.aircraftId);
    if (!type) continue;
    const path = input.resolvePath(route);
    demandsByType.set(type.id, [
      ...(demandsByType.get(type.id) ?? []),
      {
        route,
        typeId: type.id,
        type,
        path,
        required: getRequiredAircraftCount(path, type, route.frequency),
        staffed: fleet.filter((a) => a.assignedRoute === route.id && a.typeId === type.id).length,
        // Out-of-range routes rank last (and need 0 aircraft) — they simply cannot operate.
        rank: path ? previewLoopEconomics(path, type, route.frequency, fuelPrice).weeklyProfit : 0,
      },
    ]);
  }

  // --- 2. Per type: keep sticky, release surplus, deploy free pool ------------
  for (const [typeId, list] of demandsByType) {
    const type = list[0].type;
    const byRankDesc = [...list].sort((a, b) => b.rank - a.rank);

    // Free pool: usable aircraft of this type NOT sticky on one of its own active routes.
    // (Includes aircraft still holding paused-route assignments or no assignment at all.)
    const freePool: Aircraft[] = fleet.filter(
      (a) =>
        a.typeId === typeId &&
        isUsable(a) &&
        !(a.assignedRoute && list.some((d) => d.route.id === a.assignedRoute))
    );

    // Release surplus from LOW-rank routes first (they keep their required count intact),
    // so the freed aircraft can be redeployed where they are most valuable.
    for (const d of [...byRankDesc].reverse()) {
      const excess = Math.max(0, d.staffed - d.required);
      if (excess <= 0) continue;
      let taken = 0;
      for (const a of fleet) {
        if (taken >= excess) break;
        if (a.typeId !== typeId || !isUsable(a) || a.assignedRoute !== d.route.id) continue;
        freePool.push(a);
        touched.add(a.id);
        d.staffed -= 1;
        taken += 1;
      }
    }

    // Cheapest-to-position first (hub-based = free), so we maximize what the budget covers.
    freePool.sort((x, y) => positionCostOf(x, type) - positionCostOf(y, type));

    // Deploy into short-staffed routes, most profitable first.
    let i = 0;
    for (const d of byRankDesc) {
      while (d.staffed < d.required && i < freePool.length) {
        const a = freePool[i++];
        const cost = positionCostOf(a, type);
        if (cost > budget) continue; // Can't afford the repositioning — leave it for a later dispatch.
        budget -= cost;
        touched.add(a.id);
        assignments.set(a.id, d.route.id);
        if (cost > 0) {
          positionCosts.set(a.id, cost);
          totalPositionCost += cost;
        }
        d.staffed += 1;
        dispatchedCount += 1;
      }
    }

    // Leftovers: aircraft not deployed. Return stale assignments to the pool;
    // skip no-ops (already unassigned at the hub) so we don't churn state.
    for (const a of freePool.slice(i)) {
      const cost = positionCostOf(a, type);
      if (cost > budget) continue; // Cannot pay to move it back — retry next dispatch.
      if (a.assignedRoute === null && cost === 0) continue; // Nothing to change.
      budget -= cost;
      touched.add(a.id);
      assignments.set(a.id, null);
      if (cost > 0) {
        positionCosts.set(a.id, cost);
        totalPositionCost += cost;
      }
      releasedCount += 1;
    }
  }

  // --- 3. Orphans: usable aircraft of types with NO active routes -------------
  for (const a of fleet) {
    if (touched.has(a.id) || !isUsable(a)) continue;
    if (!a.assignedRoute || activeRouteIds.has(a.assignedRoute)) continue; // No stale assignment to clear.
    const type = findAircraftById(a.typeId);
    if (!type) continue;
    const cost = positionCostOf(a, type);
    if (cost > budget) continue;
    budget -= cost;
    touched.add(a.id);
    assignments.set(a.id, null);
    if (cost > 0) {
      positionCosts.set(a.id, cost);
      totalPositionCost += cost;
    }
    releasedCount += 1;
  }

  // --- 4. Staffing report -----------------------------------------------------
  const staffing: Record<string, RouteStaffing> = {};
  const shortfalls: RouteStaffing[] = [];
  for (const list of demandsByType.values()) {
    for (const d of list) {
      const entry: RouteStaffing = {
        routeId: d.route.id,
        typeId: d.typeId,
        required: d.required,
        staffed: d.staffed,
      };
      staffing[d.route.id] = entry;
      if (entry.required > 0 && entry.staffed < entry.required) shortfalls.push(entry);
    }
  }

  return {
    assignments,
    positionCosts,
    totalPositionCost,
    staffing,
    shortfalls,
    changed: assignments.size > 0,
    dispatchedCount,
    releasedCount,
  };
}