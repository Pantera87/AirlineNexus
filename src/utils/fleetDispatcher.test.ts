import { describe, it, expect, beforeAll } from 'vitest';
import type { Aircraft, Airport, Route } from '@/types/game';
import { AIRPORT_DATABASE } from '@/data/airports';
import { AIRCRAFT_DATABASE } from '@/data/aircraft';
import { checkLoopRange, calculateRouteDistanceNm, DEFAULT_FUEL_PRICE_PER_KG } from './routeEngine';
import {
  computeDispatchPlan,
  getPoolStats,
  getRequiredAircraftCount,
  getRouteStaffing,
  getWeeklyCycleCapacity,
  estimatePositioningCost,
} from './fleetDispatcher';

// Memory-backed localStorage stub (must exist before the store module is imported,
// because zustand's persist middleware touches localStorage at module load).
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => void mem.clear(),
};

// --- Deterministic fixtures derived from the game data ------------------------
const HUB = AIRPORT_DATABASE[0];

function pickFixturePair(): { typeId: string; dest: Airport } {
  for (const t of AIRCRAFT_DATABASE) {
    if (!t.range || t.range <= 0) continue;
    const dest = AIRPORT_DATABASE.find(
      (a) => a.iata !== HUB.iata && checkLoopRange(t, [HUB, a]).feasible
    );
    if (dest && getWeeklyCycleCapacity([HUB, dest], t) > 0) return { typeId: t.id, dest };
  }
  throw new Error('No feasible aircraft/airport fixture pair found');
}

const FIX = pickFixturePair();
const TYPE = AIRCRAFT_DATABASE.find((t) => t.id === FIX.typeId)!;
const PATH: Airport[] = [HUB, FIX.dest];
const CYCLES_PER_WEEK = getWeeklyCycleCapacity(PATH, TYPE); // >= 1 by fixture construction

let seq = 0;
function mkAircraft(
  typeId: string = FIX.typeId,
  opts: Partial<Pick<Aircraft, 'status' | 'currentLocation' | 'assignedRoute'>> = {}
): Aircraft {
  seq += 1;
  return {
    id: `ac-${seq}`,
    typeId,
    registration: `TEST${String(seq).padStart(3, '0')}`,
    age: 2,
    condition: 95,
    status: 'available',
    currentLocation: HUB.iata,
    assignedRoute: null,
    totalFlightHours: 100,
    lastMaintenance: new Date('2026-01-01'),
    nextMaintenance: new Date('2030-01-01'),
    liveries: [],
    currentLiveryIndex: 0,
    ...opts,
  };
}

function mkRoute(id: string, frequencyPerWeek: number): Route {
  return {
    id,
    origin: HUB.iata,
    destination: FIX.dest.iata,
    isActive: true,
    frequency: frequencyPerWeek,
    aircraftId: FIX.typeId,
    schedule: [],
    avgLoadFactor: 0.5,
    revenue: 0,
    cost: 0,
    profitability: 0,
    distanceNm: calculateRouteDistanceNm(HUB, FIX.dest),
  };
}

const resolvePath = (route: Route): Airport[] | null =>
  route.isActive && route.origin === HUB.iata ? PATH : null;

describe('fleetDispatcher — pure planning engine', () => {
  it('computes required aircraft count from weekly cycle capacity', () => {
    expect(CYCLES_PER_WEEK).toBeGreaterThan(0);
    expect(getRequiredAircraftCount(PATH, TYPE, CYCLES_PER_WEEK)).toBe(1);
    expect(getRequiredAircraftCount(PATH, TYPE, CYCLES_PER_WEEK * 2)).toBe(2);
    expect(getRequiredAircraftCount(null, TYPE, 5)).toBe(0); // unknown path
    expect(getRequiredAircraftCount(PATH, undefined, 5)).toBe(0); // unknown type
    expect(getRequiredAircraftCount(PATH, TYPE, 0)).toBe(0); // no flights
  });

  it('reports pool stats by status and assignment', () => {
    const fleet: Aircraft[] = [
      mkAircraft(FIX.typeId, { assignedRoute: 'r1' }), // usable + deployed
      mkAircraft(FIX.typeId, { status: 'in-flight' }), // usable + free
      mkAircraft(FIX.typeId, { status: 'maintenance' }), // owned only
      mkAircraft('other-type'), // different type — ignored
    ];
    expect(getPoolStats(fleet, FIX.typeId)).toEqual({ owned: 3, usable: 2, free: 1, deployed: 1 });
    expect(getRouteStaffing(fleet, 'r1')).toBe(1);
  });

  it('deploys free hub aircraft into a short-staffed route and leaves surplus in the pool', () => {
    const r = mkRoute('r1', CYCLES_PER_WEEK); // requires exactly 1 airframe
    const fleet: Aircraft[] = [mkAircraft(), mkAircraft()];
    const plan = computeDispatchPlan({ hubIata: HUB.iata, routes: [r], fleet, resolvePath, cash: 0 });

    expect(plan.dispatchedCount).toBe(1);
    expect(plan.changed).toBe(true);
    expect(plan.staffing[r.id].required).toBe(1);
    expect(plan.staffing[r.id].staffed).toBe(1);
    // Exactly one aircraft is assigned; the other is a no-op and keeps its pool state.
    const assigned = [...plan.assignments.values()].filter((v) => v === r.id).length;
    expect(assigned).toBe(1);
    expect(plan.totalPositionCost).toBe(0); // both at hub — free to deploy
  });

  it('is sticky: already-staffed routes keep their aircraft when other routes are short', () => {
    const rA = mkRoute('rA', CYCLES_PER_WEEK); // needs 1, staffed by A
    const rB = mkRoute('rB', CYCLES_PER_WEEK * 2); // needs 2, short by 2
    const a = mkAircraft(FIX.typeId, { assignedRoute: 'rA' });
    const b = mkAircraft();
    const c = mkAircraft();
    const fleet: Aircraft[] = [a, b, c];
    const plan = computeDispatchPlan({ hubIata: HUB.iata, routes: [rA, rB], fleet, resolvePath, cash: 0 });

    expect(plan.assignments.has(a.id)).toBe(false); // A is never stolen
    expect(plan.staffing['rA'].staffed).toBe(1);
    expect(plan.staffing['rB'].staffed).toBe(2); // both free aircraft fill the bigger shortfall
    const onRb = [...plan.assignments.entries()].filter(([, r]) => r === 'rB').map(([id]) => id);
    expect(onRb.sort()).toEqual([b.id, c.id].sort());
  });

  it('positions off-hub aircraft only when cash covers the deadhead cost', () => {
    const r = mkRoute('r1', CYCLES_PER_WEEK);
    const cost = estimatePositioningCost(FIX.dest.iata, TYPE, HUB, DEFAULT_FUEL_PRICE_PER_KG);
    expect(cost).toBeGreaterThan(0);

    // Rich airline: deployed and charged exactly the positioning cost.
    const rich = mkAircraft();
    rich.currentLocation = FIX.dest.iata;
    const planRich = computeDispatchPlan({ hubIata: HUB.iata, routes: [r], fleet: [rich], resolvePath, cash: 10_000_000 });
    expect(planRich.dispatchedCount).toBe(1);
    expect(planRich.assignments.get(rich.id)).toBe(r.id);
    expect(planRich.positionCosts.get(rich.id)).toBe(cost);
    expect(planRich.totalPositionCost).toBe(cost);

    // Broke airline: left in place, retried on a later dispatch.
    const broke = mkAircraft();
    broke.currentLocation = FIX.dest.iata;
    const planBroke = computeDispatchPlan({ hubIata: HUB.iata, routes: [r], fleet: [broke], resolvePath, cash: 1 });
    expect(planBroke.dispatchedCount).toBe(0);
    expect(planBroke.changed).toBe(false);
    expect(planBroke.totalPositionCost).toBe(0);
  });

  it('releases aircraft whose route no longer exists (orphan cleanup)', () => {
    const r = mkRoute('r1', CYCLES_PER_WEEK);
    const a = mkAircraft(FIX.typeId, { assignedRoute: 'r1' });
    const orphan = mkAircraft(FIX.typeId, { assignedRoute: 'ghost-route' }); // route was deleted
    const plan = computeDispatchPlan({ hubIata: HUB.iata, routes: [r], fleet: [a, orphan], resolvePath, cash: 0 });

    expect(plan.assignments.get(a.id)).toBeUndefined(); // r1 still valid — untouched
    expect(plan.assignments.get(orphan.id)).toBeNull(); // released back to the pool
    expect(plan.releasedCount).toBeGreaterThanOrEqual(1);
  });
});

describe('fleetDispatcher — store integration', () => {
  let useGameStore: typeof import('@/store/gameStore').useGameStore;

  beforeAll(async () => {
    ({ useGameStore } = await import('@/store/gameStore'));
  });

  it('auto-dispatches purchased aircraft onto new routes on creation', () => {
    const state = useGameStore.getState();
    if (!state.airline) {
      state.startGame({ name: 'Dispatch Test', iataCode: 'DT', headquarters: 'JFK' });
    }
    let s = useGameStore.getState();
    while (s.airline!.fleet.filter((a) => a.typeId === 'crj-200').length < 2) {
      if (!s.purchaseAircraft('crj-200')) break; // out of cash — cannot continue
      s = useGameStore.getState();
    }
    const e175s = s.airline!.fleet.filter((a) => a.typeId === 'crj-200');
    expect(e175s.length).toBe(2);

    const r1 = s.createRoute({ origin: 'JFK', destination: 'BOS', aircraftType: 'crj-200', frequencyPerWeek: 2 });
    const r2 = s.createRoute({ origin: 'JFK', destination: 'IAD', aircraftType: 'crj-200', frequencyPerWeek: 2 });
    expect(r1).toBe(true);
    expect(r2).toBe(true);

    const airline = useGameStore.getState().airline!;
    const routes = airline.routes.filter((rt) => rt.aircraftId === 'crj-200' && rt.isActive);
    expect(routes.length).toBe(2);
    // Each low-frequency route gets its own staffed airframe from the shared pool.
    for (const rt of routes) {
      const staffed = getRouteStaffing(airline.fleet, rt.id);
      expect(staffed).toBeGreaterThanOrEqual(1);
      for (const a of airline.fleet.filter((x) => x.assignedRoute === rt.id)) {
        expect(a.typeId).toBe('crj-200'); // airframe type must match the route's type
      }
    }
    // No airframe may be deployed to two routes at once.
    const assigned = airline.fleet.filter((a) => a.assignedRoute);
    expect(new Set(assigned.map((a) => a.id)).size).toBe(assigned.length);

    // Pool-bar math must agree with the fleet array.
    const stats = getPoolStats(airline.fleet, 'crj-200');
    expect(stats.deployed).toBe(assigned.filter((a) => a.typeId === 'crj-200').length);
  });

  it('re-dispatches when an aircraft is sold', () => {
    const airline = useGameStore.getState().airline!;
    const deployed = airline.fleet.find((a) => a.assignedRoute && a.typeId === 'crj-200');
    if (!deployed) return; // no dispatched airframe — previous test would have failed

    const result = useGameStore.getState().sellAircraft(deployed.id);
    expect(result.success).toBe(true);

    const after = useGameStore.getState().airline!;
    expect(after.fleet.some((a) => a.id === deployed.id)).toBe(false);
    const stats = getPoolStats(after.fleet, 'crj-200');
    expect(stats.owned).toBe(1);
    for (const a of after.fleet) {
      if (a.assignedRoute) {
        expect(after.routes.some((r) => r.id === a.assignedRoute)).toBe(true); // no dangling refs
      }
    }
  });
});


