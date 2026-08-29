import { describe, it, expect, beforeAll } from 'vitest';
import type { Aircraft, Route, StaffMember, StaffRole } from '@/types/game';
import { getAircraftById } from '@/data/aircraft';
import { AIRPORT_DATABASE } from '@/data/airports';
import { getLoopCycleMinutes, getRouteCycleMinutes } from '@/utils/routeEngine';
import {
  typeWeeklyCycleHours,
  computeTypeCrewRequirements,
  computeStaffingStatus,
  computeCrewPlan,
} from '@/utils/crewDispatcher';

// Memory-backed localStorage stub (must exist before the store module is imported,
// because zustand's persist middleware touches localStorage at module load).
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => void mem.clear(),
};

// --- Fixtures ------------------------------------------------------------------
//
// b737-800: cruise 471 kt → avg 431 kt; narrow-body turnaround 45 min.
//   500 nm leg  = round(500/431·60) = 70 min → cycle 2·70 + 2·45 = 230 min
//   6000 nm leg = round(6000/431·60) = 835 min → cycle 2·835 + 2·45 = 1760 min

const B738 = getAircraftById('b737-800')!;
const JFK = AIRPORT_DATABASE.find((a) => a.iata === 'JFK')!;
const LAX = AIRPORT_DATABASE.find((a) => a.iata === 'LAX')!;

/** Minimal active point-to-point route. Unknown IATAs force the distance-based cycle fallback. */
function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    origin: 'XXX',
    destination: 'YYY',
    isActive: true,
    frequency: 1,
    aircraftId: 'b737-800',
    schedule: [],
    avgLoadFactor: 0.5,
    revenue: 0,
    cost: 0,
    profitability: 0,
    distanceNm: 500,
    ...overrides,
  };
}

let staffSeq = 0;
function makeStaff(role: StaffRole, typeRating: string | null = null): StaffMember {
  staffSeq += 1;
  return {
    id: `staff-${staffSeq}`,
    name: `Test ${staffSeq}`,
    gender: 'male',
    photo: null,
    role,
    experience: 1,
    salary: 5000,
    performance: 50,
    assignedAircraft: null,
    assignedRoute: null,
    startDate: new Date(Date.UTC(2024, 0, 1)),
    morale: 70,
    flightHours: 0,
    typeRating,
    reducedWageUntil: null,
  };
}

function crewOf(n: number, role: StaffRole): StaffMember[] {
  return Array.from({ length: n }, () => makeStaff(role));
}

let acSeq = 0;
function makeAircraft(typeId = 'b737-800'): Aircraft {
  acSeq += 1;
  return {
    id: `ac-${acSeq}`,
    typeId,
    registration: `TC${String(acSeq).padStart(2, '0')}`,
    age: 3,
    condition: 90,
    status: 'available',
    currentLocation: null,
    assignedRoute: null,
    totalFlightHours: 1000,
    lastMaintenance: new Date(Date.UTC(2025, 5, 1)),
    nextMaintenance: new Date(Date.UTC(2026, 5, 1)),
    liveries: [],
    currentLiveryIndex: 0,
  };
}

// --- typeWeeklyCycleHours ------------------------------------------------------

describe('typeWeeklyCycleHours', () => {
  it('returns an empty map with no active routes', () => {
    expect(typeWeeklyCycleHours([])).toEqual(new Map());
    expect(typeWeeklyCycleHours([makeRoute({ isActive: false })])).toEqual(new Map());
  });

  it('accumulates frequency × round-trip cycle hours per type', () => {
    // 3 × 230 min cycles = 11.5 cycle-h/week.
    const hours = typeWeeklyCycleHours([makeRoute({ frequency: 3 })]).get('b737-800')!;
    expect(hours).toBeCloseTo(3 * 230 / 60, 5);
  });

  it('sums multiple routes of the same type into one workload', () => {
    const m = typeWeeklyCycleHours([makeRoute({ id: 'a' }), makeRoute({ id: 'b' })]);
    expect(m.get('b737-800')).toBeCloseTo(2 * 230 / 60, 5);
  });

  it('keeps workloads separate per aircraft type', () => {
    const a320 = getAircraftById('a320neo')!;
    const m = typeWeeklyCycleHours([
      makeRoute({ id: 'a' }),
      makeRoute({ id: 'b', aircraftId: 'a320neo', distanceNm: 800 }),
    ]);
    expect(m.get('b737-800')).toBeCloseTo(230 / 60, 5);
    expect(m.get('a320neo')).toBeCloseTo(getRouteCycleMinutes(800, a320) / 60, 5);
  });

  it('uses the full loop cycle when every path airport is known', () => {
    const m = typeWeeklyCycleHours([
      makeRoute({ origin: 'JFK', destination: 'LAX', distanceNm: 5000, frequency: 2 }),
    ]);
    expect(m.get('b737-800')).toBeCloseTo((2 * getLoopCycleMinutes([JFK, LAX], B738)) / 60, 5);
  });
});

// --- computeTypeCrewRequirements -----------------------------------------------

describe('computeTypeCrewRequirements', () => {
  it('returns {} when no type has a workload', () => {
    expect(computeTypeCrewRequirements([makeRoute({ isActive: false })])).toEqual({});
  });

  it('sizes a short-haul type with a single crew set (per-airframe minimum)', () => {
    // 3.83 cycle-h/week ≪ 17.31 h sustainable share → 1 set.
    const req = computeTypeCrewRequirements([makeRoute()])['b737-800']!;
    expect(req.sets).toBe(1);
    expect(req.captain).toBe(1);
    expect(req.firstOfficer).toBe(1);
    expect(req.purser).toBe(1);
    expect(req.cabinCrew).toBe(4); // ceil(189 / 50)
  });

  it('a 24 h cycle route at 4×/week needs 6 rotating crew sets', () => {
    // 4848 nm → leg round(4848/431·60) = 675 min → cycle 2·675 + 2·45 = 1440 min = exactly 24 h.
    // 4 cycles/week = 96 h → 96/17.31 ≈ 5.55 → 6 sets.
    const req = computeTypeCrewRequirements([makeRoute({ distanceNm: 4848, frequency: 4 })])['b737-800']!;
    expect(req.weeklyHours).toBeCloseTo(4 * 24, 5);
    expect(req.sets).toBe(6);
    expect(req.cabinCrew).toBe(24); // 6 sets × 4
  });

  it('a 6000 nm route at 4×/week demands multiple rotating crew sets', () => {
    // 4 × 1760 min = 117.33 cycle-h/week → 117.33/17.31 ≈ 6.78 → 7 sets.
    const req = computeTypeCrewRequirements([makeRoute({ distanceNm: 6000, frequency: 4 })])['b737-800']!;
    expect(req.weeklyHours).toBeCloseTo((4 * 1760) / 60, 5);
    expect(req.sets).toBe(7);
    expect(req.captain).toBe(7);
    expect(req.firstOfficer).toBe(7);
    expect(req.purser).toBe(7);
    expect(req.cabinCrew).toBe(28); // 7 sets × 4
  });
});

// --- computeStaffingStatus ------------------------------------------------------

describe('computeStaffingStatus', () => {
  const find = (status: ReturnType<typeof computeStaffingStatus>, key: string) =>
    status.find((d) => d.key === key)!;

  it('reports an understaffed airline with negative deltas', () => {
    const routes = [makeRoute({ distanceNm: 6000, frequency: 4 })]; // 7 sets → 14 pilots, 35 cabin
    const staff = [...crewOf(2, 'captain'), makeStaff('first-officer'), makeStaff('cabin-crew')];
    const status = computeStaffingStatus(routes, staff, [makeAircraft()]);

    expect(find(status, 'pilots').required).toBe(14);
    expect(find(status, 'pilots').available).toBe(3);
    expect(find(status, 'pilots').delta).toBe(-11);
    expect(find(status, 'cabin').required).toBe(35);
    expect(find(status, 'cabin').available).toBe(1);
    expect(find(status, 'cabin').delta).toBe(-34);
    // 1 aircraft → 1 engineer required (fleet/5 rounded up).
    expect(find(status, 'engineers').required).toBe(1);
    expect(find(status, 'engineers').delta).toBe(-1);
    expect(find(status, 'engineers').missing).toBe(1);
    // Pilots row carries the per-type-rating detail: 7 sets → 7 Capt + 7 FO, none rated yet.
    expect(find(status, 'pilots').pilotBreakdown).toEqual([
      {
        typeId: 'b737-800',
        sets: 7,
        captain: 7,
        firstOfficer: 7,
        ratedCaptains: 0,
        ratedFirstOfficers: 0,
        missingCaptains: 7,
        missingFirstOfficers: 7,
      },
    ]);
    expect(find(status, 'pilots').missing).toBe(11); // 14 required − 3 on payroll
    // Cabin split per role: 7 pursers (0 have) and 28 cabin crew (1 have).
    expect(find(status, 'cabin').cabinDetail).toEqual({
      purser: { required: 7, available: 0, missing: 7 },
      cabinCrew: { required: 28, available: 1, missing: 27 },
    });
  });

  it('reports pilots rated per type separately from unrated ones', () => {
    const routes = [makeRoute({ distanceNm: 4848, frequency: 4 })]; // 24 h cycle → 6 sets → 6 Capt + 6 FO
    const staff = [
      makeStaff('captain', 'b737-800'),
      makeStaff('captain', 'b737-800'),
      makeStaff('first-officer', 'b737-800'),
      makeStaff('captain', null), // unrated — not counted toward any rating
    ];
    const b = find(computeStaffingStatus(routes, staff, [makeAircraft()]), 'pilots').pilotBreakdown![0];
    expect(b).toMatchObject({
      typeId: 'b737-800',
      sets: 6,
      captain: 6,
      firstOfficer: 6,
      ratedCaptains: 2,
      ratedFirstOfficers: 1,
      missingCaptains: 4,
      missingFirstOfficers: 5,
    });
  });

  it('reports a balanced airline with zero deltas', () => {
    const routes = [makeRoute({ distanceNm: 6000, frequency: 4 })]; // 7 sets
    const staff = [
      ...crewOf(7, 'captain'),
      ...crewOf(7, 'first-officer'),
      ...crewOf(7, 'purser'),
      ...crewOf(28, 'cabin-crew'),
      makeStaff('engineer'),
    ];
    const status = computeStaffingStatus(
      routes,
      staff,
      [makeAircraft(), makeAircraft(), makeAircraft(), makeAircraft(), makeAircraft()]
    );
    expect(status.map((d) => d.delta)).toEqual([0, 0, 0]);
    expect(status.map((d) => d.missing)).toEqual([0, 0, 0]);
  });

  it('reports an overstaffed idle airline (no routes) with positive pilot delta', () => {
    const status = computeStaffingStatus([], [...crewOf(3, 'captain')], [makeAircraft(), makeAircraft()]);
    expect(find(status, 'pilots').required).toBe(0);
    expect(find(status, 'pilots').available).toBe(3);
    expect(find(status, 'pilots').delta).toBe(3);
    expect(find(status, 'cabin').delta).toBe(0); // 0 required, 0 available
    expect(find(status, 'engineers').required).toBe(1); // 2 aircraft → ceil(2/5)
    expect(find(status, 'engineers').delta).toBe(-1);
  });

  it('requires no crew for a type whose airframes are all unusable (current-need cap)', () => {
    const routes = [makeRoute({ distanceNm: 6000, frequency: 4 })]; // 7 sets on paper
    const grounded = makeAircraft();
    grounded.status = 'maintenance';
    const status = computeStaffingStatus(routes, [], [grounded]);

    // Nothing can be rostered → the "still missing" list must stay empty.
    expect(find(status, 'pilots').required).toBe(0);
    expect(find(status, 'pilots').missing).toBe(0);
    expect(find(status, 'pilots').pilotBreakdown).toEqual([
      {
        typeId: 'b737-800',
        sets: 7,
        captain: 0,
        firstOfficer: 0,
        ratedCaptains: 0,
        ratedFirstOfficers: 0,
        missingCaptains: 0,
        missingFirstOfficers: 0,
      },
    ]);
    expect(find(status, 'cabin').required).toBe(0);
    expect(find(status, 'cabin').missing).toBe(0);
  });

  it('keeps the full workload requirement while one usable airframe can roster it', () => {
    const routes = [makeRoute({ distanceNm: 6000, frequency: 4 })]; // 7 sets
    const grounded = makeAircraft();
    grounded.status = 'maintenance';
    // 1 usable + 1 grounded: the workload caps ceil to the single usable
    // airframe, so the full rotation is still required (and rosterable).
    const status = computeStaffingStatus(routes, [], [makeAircraft(), grounded]);
    expect(find(status, 'pilots').required).toBe(14);
    expect(find(status, 'cabin').required).toBe(35);
  });
});

// --- computeCrewPlan: fleet-wide cabin crew pool ---------------------------------

describe('computeCrewPlan', () => {
  // b737-800: 1 purser + ceil(189/50) = 4 cabin crew per airframe.
  // a320neo:  1 purser + ceil(194/50) = 4 cabin crew per airframe.

  // Both passenger types fly: one active route each, so the cabin pool is
  // sized for both airframes.
  const bothFly = [makeRoute({ aircraftId: 'b737-800' }), makeRoute({ id: 'r2', aircraftId: 'a320neo' })];

  it('treats pursers and cabin crew as a fleet-wide pool across types', () => {
    const fleet = [makeAircraft('b737-800'), makeAircraft('a320neo')];
    const staff = [
      ...crewOf(2, 'captain'),
      ...crewOf(2, 'first-officer'),
      ...crewOf(2, 'purser'),
      ...crewOf(8, 'cabin-crew'),
    ];
    const plan = computeCrewPlan(staff, fleet, bothFly);

    // 2 pursers + 8 cabin crew = exactly the combined requirement of both types.
    expect(plan.cabinPool).toMatchObject({
      purserRequired: 2,
      purserAvailable: 2,
      cabinCrewRequired: 8,
      cabinCrewAvailable: 8,
      required: 10,
      available: 10,
    });
    expect(plan.cabinPool.coverageFactor).toBe(1);
    // Both types fly at full coverage even though no single type holds the
    // whole pool on its own airframes.
    expect(plan.manningByType['b737-800'].coverageFactor).toBe(1);
    expect(plan.manningByType['a320neo'].coverageFactor).toBe(1);
  });

  it('scales every passenger type down by the shared pool coverage when cabin crew are short', () => {
    const fleet = [makeAircraft('b737-800'), makeAircraft('a320neo')];
    const staff = [
      ...crewOf(2, 'captain'),
      ...crewOf(2, 'first-officer'),
      ...crewOf(1, 'purser'),
      ...crewOf(4, 'cabin-crew'), // 5 of the 10 required
    ];
    const plan = computeCrewPlan(staff, fleet, bothFly);

    expect(plan.cabinPool.coverageFactor).toBeCloseTo(0.5, 5);
    // The shortfall applies fleet-wide, not to whichever type the pool
    // happens to be rostered on.
    expect(plan.manningByType['b737-800'].coverageFactor).toBeCloseTo(0.5, 5);
    expect(plan.manningByType['a320neo'].coverageFactor).toBeCloseTo(0.5, 5);
  });

  it('keeps pilots type-specific: a missing first officer only grounds one type', () => {
    const fleet = [makeAircraft('b737-800'), makeAircraft('a320neo')];
    const staff = [
      ...crewOf(2, 'captain'),
      makeStaff('first-officer'), // only one FO
      ...crewOf(2, 'purser'),
      ...crewOf(8, 'cabin-crew'),
    ];
    const plan = computeCrewPlan(staff, fleet, bothFly);

    // The lone FO fills the first type; the second type has no pilot pair.
    expect(plan.manningByType['b737-800'].coverageFactor).toBe(1);
    expect(plan.manningByType['a320neo'].coverageFactor).toBe(0);
  });

  it('leaves cargo types unaffected by the cabin pool', () => {
    const fleet = [makeAircraft('b777-f'), makeAircraft('b737-800')];
    const staff = [
      ...crewOf(2, 'captain'),
      ...crewOf(2, 'first-officer'),
      ...crewOf(1, 'purser'),
      ...crewOf(4, 'cabin-crew'), // exactly the b737-800 requirement
    ];
    const plan = computeCrewPlan(staff, fleet, [makeRoute({ aircraftId: 'b737-800' })]);

    expect(plan.cabinPool.coverageFactor).toBe(1);
    expect(plan.manningByType['b777-f'].coverageFactor).toBe(1);
    expect(plan.manningByType['b737-800'].coverageFactor).toBe(1);
  });

  it('redeploys cabin crew off idle types onto the flying type', () => {
    // Only the b737-800 has an active route; the a320neo is idle. Cabin crew
    // pre-rostered on the idle airframe must be released and redeployed.
    const fleet = [makeAircraft('b737-800'), makeAircraft('a320neo')];
    const idle = fleet[1];
    const staff = [
      ...crewOf(2, 'captain'),
      ...crewOf(2, 'first-officer'),
      ...crewOf(2, 'purser'),
      ...crewOf(8, 'cabin-crew'),
    ];
    for (const m of staff) {
      if (m.role === 'purser' || m.role === 'cabin-crew') m.assignedAircraft = idle.id;
    }

    const plan = computeCrewPlan(staff, fleet, [makeRoute({ aircraftId: 'b737-800' })]);

    // The pool is sized for the flying b737-800 only: 1 purser + 4 cabin crew.
    expect(plan.cabinPool).toMatchObject({
      purserRequired: 1,
      cabinCrewRequired: 4,
      required: 5,
      available: 5,
    });
    expect(plan.cabinPool.coverageFactor).toBe(1);
    // No cabin crew remains rostered on the idle type; the flying type is
    // fully crewed from the released pool.
    expect(plan.manningByType['a320neo'].maned.purser).toBe(0);
    expect(plan.manningByType['a320neo'].maned.cabinCrew).toBe(0);
    expect(plan.manningByType['b737-800'].maned.purser).toBe(1);
    expect(plan.manningByType['b737-800'].maned.cabinCrew).toBe(4);
  });

  it('leaves surplus cabin crew unassigned when only one type flies', () => {
    // Plenty of cabin crew but only one flying airframe: the surplus is
    // released rather than parked on the idle type.
    const fleet = [makeAircraft('b737-800'), makeAircraft('a320neo')];
    const staff = [
      ...crewOf(2, 'captain'),
      ...crewOf(2, 'first-officer'),
      ...crewOf(2, 'purser'),
      ...crewOf(8, 'cabin-crew'),
    ];

    const plan = computeCrewPlan(staff, fleet, [makeRoute({ aircraftId: 'b737-800' })]);

    expect(plan.cabinPool.required).toBe(5);
    expect(plan.cabinPool.available).toBe(5);
    expect(plan.cabinPool.coverageFactor).toBe(1);
    const unassigned = [...plan.assignments.values()].filter((a) => a === null).length;
    expect(unassigned).toBe(5); // 1 purser + 4 cabin crew surplus
  });
});

// --- Workload-sized rotation sets -------------------------------------------------
//
// A busy route needs more than one rotating crew set (EU-OSL): the staffing
// report then requires sets × the per-airframe minimum. The dispatcher must
// roster the full rotation instead of leaving the extra sets unassigned.

describe('workload-sized rotation sets', () => {
  it('rosters the full rotation the workload requires (no unassigned surplus)', () => {
    // 7 cycles/week × 230-min loop ≈ 26.8 cycle-h/week → 2 rotating sets:
    // 2 captains, 2 first officers, 2 pursers and 8 cabin crew on the lone airframe.
    const fleet = [makeAircraft('b737-800')];
    const routes = [makeRoute({ frequency: 7 })];
    const staff = [
      ...crewOf(2, 'captain'),
      ...crewOf(2, 'first-officer'),
      ...crewOf(2, 'purser'),
      ...crewOf(8, 'cabin-crew'),
    ];

    const plan = computeCrewPlan(staff, fleet, routes);

    expect(plan.manningByType['b737-800'].maned.captain).toBe(2);
    expect(plan.manningByType['b737-800'].maned.firstOfficer).toBe(2);
    expect(plan.cabinPool.purserRequired).toBe(2);
    expect(plan.cabinPool.cabinCrewRequired).toBe(8);
    expect(plan.cabinPool.coverageFactor).toBe(1);
    // The whole workload-sized rotation is rostered — nobody left unassigned.
    expect(plan.totalReleased).toBe(0);
  });

  it('splits the rotation requirement across airframes of the same type', () => {
    // Two B737s share the 2-set workload: ceil(2/2)=1 set per airframe, so the
    // requirement stays at the per-airframe minimum × 2 (8 cabin, 2 pursers).
    const fleet = [makeAircraft('b737-800'), makeAircraft('b737-800')];
    const routes = [makeRoute({ frequency: 7 })];
    const staff = [
      ...crewOf(2, 'captain'),
      ...crewOf(2, 'first-officer'),
      ...crewOf(2, 'purser'),
      ...crewOf(8, 'cabin-crew'),
    ];

    const plan = computeCrewPlan(staff, fleet, routes);

    expect(plan.cabinPool.cabinCrewRequired).toBe(8);
    expect(plan.cabinPool.purserRequired).toBe(2);
    expect(plan.manningByType['b737-800'].maned.cabinCrew).toBe(8);
    expect(plan.manningByType['b737-800'].maned.purser).toBe(2);
    expect(plan.cabinPool.coverageFactor).toBe(1);
    expect(plan.totalReleased).toBe(0);
  });
});

// --- Load-time reconciliation (store integration) ---------------------------------
//
// Existing saves can carry pre-workload-cap assignments: cabin crew left
// unassigned while the staffing report still requires them. The store re-runs
// the dispatcher once after rehydration (reconcileCrewAssignments) so those
// rosters fix up immediately instead of waiting for the next hire/fire.

describe('crewDispatcher — load-time reconciliation (store)', () => {
  let useGameStore: typeof import('@/store/gameStore').useGameStore;
  let reconcileCrewAssignments: () => void;

  beforeAll(async () => {
    const store = await import('@/store/gameStore');
    useGameStore = store.useGameStore;
    reconcileCrewAssignments = store.reconcileCrewAssignments;
  });

  it('re-rosters stale unassigned cabin crew after a save loads', () => {
    const state = useGameStore.getState();
    if (!state.airline) {
      state.startGame({ name: 'Crew Reconcile', iataCode: 'CR', headquarters: 'JFK' });
    }
    let s = useGameStore.getState();
    if (s.airline!.fleet.length === 0) {
      expect(s.purchaseAircraft('crj-200')).toBe(true);
      s = useGameStore.getState();
    }
    if (s.airline!.routes.filter((r) => r.isActive).length === 0) {
      expect(
        s.createRoute({ origin: 'JFK', destination: 'BOS', aircraftType: 'crj-200', frequencyPerWeek: 1 })
      ).toBe(true);
      s = useGameStore.getState();
    }

    // Hire one purser + one cabin crew; hireStaff already dispatches, so both
    // should be rostered on the flying airframe.
    s.hireStaff({
      name: 'Purser Reconcile',
      gender: 'female',
      photo: null,
      role: 'purser',
      experience: 5,
      salary: 5000,
      performance: 70,
      assignedAircraft: null,
      assignedRoute: null,
      morale: 70,
      flightHours: 0,
      typeRating: null,
      reducedWageUntil: null,
    });
    s = useGameStore.getState();
    s.hireStaff({
      name: 'Cabin Reconcile',
      gender: 'female',
      photo: null,
      role: 'cabin-crew',
      experience: 5,
      salary: 4000,
      performance: 70,
      assignedAircraft: null,
      assignedRoute: null,
      morale: 70,
      flightHours: 0,
      typeRating: null,
      reducedWageUntil: null,
    });
    s = useGameStore.getState();

    const aircraftId = s.airline!.fleet[0].id;
    const purser = s.airline!.staff.find((m) => m.role === 'purser')!;
    const cabin = s.airline!.staff.find((m) => m.role === 'cabin-crew')!;
    expect(purser.assignedAircraft).toBe(aircraftId);
    expect(cabin.assignedAircraft).toBe(aircraftId);

    // Simulate a stale save from before the workload caps: both released.
    const airline = useGameStore.getState().airline!;
    useGameStore.setState({
      airline: {
        ...airline,
        staff: airline.staff.map((m) =>
          m.id === purser.id || m.id === cabin.id ? { ...m, assignedAircraft: null } : m
        ),
      },
    });

    // The load-time reconciliation re-rosters both.
    reconcileCrewAssignments();
    const after = useGameStore.getState().airline!;
    expect(after.staff.find((m) => m.id === purser.id)!.assignedAircraft).toBe(aircraftId);
    expect(after.staff.find((m) => m.id === cabin.id)!.assignedAircraft).toBe(aircraftId);
  });
});