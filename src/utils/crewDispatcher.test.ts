import { describe, it, expect } from 'vitest';
import type { Aircraft, Route, StaffMember, StaffRole } from '@/types/game';
import { getAircraftById } from '@/data/aircraft';
import { AIRPORT_DATABASE } from '@/data/airports';
import { getLoopCycleMinutes, getRouteCycleMinutes } from '@/utils/routeEngine';
import {
  typeWeeklyCycleHours,
  computeTypeCrewRequirements,
  computeStaffingStatus,
} from '@/utils/crewDispatcher';

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
});