// ============================================================
// Crew Dispatcher — per-aircraft-type staff manning
// ------------------------------------------------------------
// Pure planning engine for the staff side of operations. An aircraft type
// needs a fixed crew per usable airframe: 1 captain + 1 first officer
// (pilot type ratings must match or be pending — unrated pilots still fly).
// Cabin crew are NOT type-specific: pursers (1 per airframe) and
// ceil(maxPassengers / 50) cabin crew form one fleet-wide pool that can fly
// any type — the pool is sized against the combined requirement of all usable
// airframes of types that actually fly (have an active route); cabin crew
// rostered on idle types are released and redeployed to understaffed flying
// types, and a shortfall scales every passenger type down by the same pool
// coverage. Engineers are fleet-level: 1 per 5 owned aircraft; a
// shortfall becomes a maintenance penalty applied by gameStore. Mirrors the
// structure of utils/fleetDispatcher.ts: sticky assignments, one pass over a
// free pool, no state mutation here.
// ============================================================

import type { Aircraft, Route, StaffMember } from '@/types/game';
import { AIRCRAFT_DATABASE } from '@/data/aircraft';
import { AIRPORT_DATABASE } from '@/data/airports';
import { getRoutePath, getRouteCycleMinutes, getLoopCycleMinutes } from './routeEngine';
import { crewSetsRequired, isOnMandatoryRest } from './crewRegulations';

/** Roles that require a matching pilot type rating (unrated pilots are assignable, rated ones must match). */
const RATED_ROLES: StaffMember['role'][] = ['captain', 'first-officer'];

/** Crew needed per airframe of a given type (cabin crew scales with size). */
export function getAircraftCrewRequirements(typeId: string): {
  captain: number;
  firstOfficer: number;
  cabinCrew: number;
  purser: number;
} | null {
  const type = AIRCRAFT_DATABASE.find((t) => t.id === typeId);
  if (!type) return null;
  return {
    captain: 1,
    firstOfficer: 1,
    purser: type.category === 'cargo' ? 0 : 1,
    cabinCrew: type.category === 'cargo' ? 0 : Math.ceil(type.maxPassengers / 50),
  };
}

/** Engineers needed fleet-wide: 1 per 5 owned aircraft (rounds up). */
export function getRequiredEngineerCount(fleet: Aircraft[]): number {
  return Math.ceil(fleet.length / 5);
}

/**
 * Weekly CYCLE-hour workload per aircraft type across all active routes
 * (same full-loop model as the weekly settlement: every leg + turnaround at
 * each visited airport, × cycles per week).
 */
export function typeWeeklyCycleHours(routes: Route[]): Map<string, number> {
  const byType = new Map<string, number>();
  for (const route of routes) {
    if (!route.isActive || !route.aircraftId) continue;
    const type = AIRCRAFT_DATABASE.find((t) => t.id === route.aircraftId);
    if (!type || !route.distanceNm) continue;
    const path = getRoutePath(route).map((iata) => AIRPORT_DATABASE.find((a) => a.iata === iata));
    const known = path.every((a) => a !== undefined);
    const cycleMinutes = known
      ? getLoopCycleMinutes(path as Parameters<typeof getLoopCycleMinutes>[0], type)
      : getRouteCycleMinutes(route.distanceNm, type);
    byType.set(route.aircraftId, (byType.get(route.aircraftId) ?? 0) + route.frequency * (cycleMinutes / 60));
  }
  return byType;
}

/** Crew required for one aircraft type, sized for actual coverage (see computeTypeCrewRequirements). */
export interface TypeCrewRequirement {
  typeId: string;
  /** Weekly cycle-hours the type's routes demand. */
  weeklyHours: number;
  /** Full crew sets the EU-OSL rotation rule requires. */
  sets: number;
  captain: number;
  firstOfficer: number;
  purser: number;
  cabinCrew: number;
}

/**
 * Crew required per aircraft type, sized for actual coverage: the type's
 * combined route workload is carried by `sets` full crew sets — EU-OSL limits
 * mean the same crew cannot fly a long/continuous route straight through —
 * and each set needs the per-airframe minimum crew.
 */
export function computeTypeCrewRequirements(routes: Route[]): Record<string, TypeCrewRequirement> {
  const byType: Record<string, TypeCrewRequirement> = {};
  for (const [typeId, hours] of typeWeeklyCycleHours(routes)) {
    const req = getAircraftCrewRequirements(typeId);
    if (!req) continue;
    const sets = crewSetsRequired(hours);
    byType[typeId] = {
      typeId,
      weeklyHours: hours,
      sets,
      captain: req.captain * sets,
      firstOfficer: req.firstOfficer * sets,
      purser: req.purser * sets,
      cabinCrew: req.cabinCrew * sets,
    };
  }
  return byType;
}

/** Per-role staffing detail: required vs available, plus the hiring shortfall. */
export interface RoleStaffing {
  required: number;
  available: number;
  /** max(0, required − available) — how many still need to be hired. */
  missing: number;
}

/** Per-type-rating pilot requirement (detail of the Pilots department row). */
export interface TypePilotBreakdown {
  typeId: string;
  /** Rotating crew sets this type's workload requires. */
  sets: number;
  /** Pilots of each role required, sized by the rotation sets. */
  captain: number;
  firstOfficer: number;
  /** Pilots on the payroll already rated for this type. */
  ratedCaptains: number;
  ratedFirstOfficers: number;
  /** Still to hire/convert: max(0, required − rated) per role. */
  missingCaptains: number;
  missingFirstOfficers: number;
}

/** One department's staffing level: required (workload-sized) vs available (on payroll). */
export interface DeptStaffingStatus {
  key: 'pilots' | 'cabin' | 'engineers';
  label: string;
  required: number;
  available: number;
  /** available − required: negative = understaffed, positive = overstaffed. */
  delta: number;
  /** max(0, required − available) — hires still needed in this department. */
  missing: number;
  /** Pilots department only: per-type-rating requirement detail. */
  pilotBreakdown?: TypePilotBreakdown[];
  /** Cabin department only: per-role detail (purser and cabin crew are separate roles). */
  cabinDetail?: { purser: RoleStaffing; cabinCrew: RoleStaffing };
}

/**
 * Fleet-wide staffing level per department. Flying roles are required from
 * the route workload (rotation sets × minimum crew per set) capped by what the
 * type's USABLE airframes can actually roster — the dispatcher's own workload-
 * sized caps — so "required" / "still missing" reflect the current need: a
 * type whose airframes are all grounded/maintenance requires no crew until
 * they fly again, and cabin crew are required only for types that fly.
 * Engineers follow the fleet-size rule.
 */
export function computeStaffingStatus(routes: Route[], staff: StaffMember[], fleet: Aircraft[]): DeptStaffingStatus[] {
  const req = computeTypeCrewRequirements(routes);
  // Types that fly this week (≥1 active route) — the only types needing cabin crew.
  const flying = new Set<string>();
  for (const route of routes) {
    if (route.isActive && route.aircraftId) flying.add(route.aircraftId);
  }
  // Rosterable capacity per type: workload-sized caps summed over the type's
  // usable airframes (cabin crew only for types that actually fly).
  const caps = computeAircraftCrewCaps(fleet, routes);
  const rosterable = new Map<string, Record<'captain' | 'firstOfficer' | 'purser' | 'cabinCrew', number>>();
  for (const a of fleet.filter(isUsableAircraft)) {
    const cap = caps.get(a.id);
    if (!cap) continue;
    const acc = rosterable.get(a.typeId) ?? { captain: 0, firstOfficer: 0, purser: 0, cabinCrew: 0 };
    acc.captain += cap.captain;
    acc.firstOfficer += cap.firstOfficer;
    if (flying.has(a.typeId)) {
      acc.purser += cap.purser;
      acc.cabinCrew += cap.cabinCrew;
    }
    rosterable.set(a.typeId, acc);
  }
  // Current need per type/role: the workload requirement capped by what the
  // type's usable airframes can roster — equal to the full workload whenever
  // at least one airframe is usable (caps are ceil-distributed, so they sum
  // to ≥ the workload), zero when none is.
  const need = (typeId: string, k: 'captain' | 'firstOfficer' | 'purser' | 'cabinCrew') =>
    Math.min(req[typeId]?.[k] ?? 0, rosterable.get(typeId)?.[k] ?? 0);
  const sum = (k: 'captain' | 'firstOfficer' | 'purser' | 'cabinCrew') =>
    Object.keys(req).reduce((s, t) => s + need(t, k), 0);
  const ratedFor = (role: 'captain' | 'first-officer', typeId: string) =>
    staff.filter((m) => m.role === role && m.typeRating === typeId).length;
  const roleStaffing = (required: number, available: number): RoleStaffing => ({
    required,
    available,
    missing: Math.max(0, required - available),
  });
  const pilotBreakdown: TypePilotBreakdown[] = Object.keys(req).map((typeId) => {
    const r = req[typeId];
    const ratedCaptains = ratedFor('captain', typeId);
    const ratedFirstOfficers = ratedFor('first-officer', typeId);
    const captain = need(typeId, 'captain');
    const firstOfficer = need(typeId, 'firstOfficer');
    return {
      typeId,
      sets: r.sets,
      captain,
      firstOfficer,
      ratedCaptains,
      ratedFirstOfficers,
      missingCaptains: Math.max(0, captain - ratedCaptains),
      missingFirstOfficers: Math.max(0, firstOfficer - ratedFirstOfficers),
    };
  });
  const purserCount = staff.filter((m) => m.role === 'purser').length;
  const cabinCrewCount = staff.filter((m) => m.role === 'cabin-crew').length;
  const base: Omit<DeptStaffingStatus, 'delta' | 'missing'>[] = [
    {
      key: 'pilots',
      label: 'Pilots',
      required: sum('captain') + sum('firstOfficer'),
      available: staff.filter((m) => m.role === 'captain' || m.role === 'first-officer').length,
      pilotBreakdown,
    },
    {
      key: 'cabin',
      label: 'Cabin crew',
      required: sum('purser') + sum('cabinCrew'),
      available: purserCount + cabinCrewCount,
      cabinDetail: {
        purser: roleStaffing(sum('purser'), purserCount),
        cabinCrew: roleStaffing(sum('cabinCrew'), cabinCrewCount),
      },
    },
    {
      key: 'engineers',
      label: 'Engineers',
      required: getRequiredEngineerCount(fleet),
      available: staff.filter((m) => m.role === 'engineer').length,
    },
  ];
  return base.map((d) => ({
    ...d,
    delta: d.available - d.required,
    missing: Math.max(0, d.required - d.available),
  }));
}

export interface AircraftCrewManning {
  typeId: string;
  /** Usable airframes of this type (available / in-flight). */
  usableAircraft: number;
  /** Usable airframes with a complete PILOT pair (pilots are the type-specific crew). */
  fullyMannedAircraft: number;
  /**
   * The type's share of operations: pilot-pair coverage × the fleet-wide
   * cabin-pool coverage (1 for cargo types, which need no cabin crew; 1 when
   * there is no usable airframe — nothing to man).
   */
  coverageFactor: number;
  /** Per-airframe minimum crew of this type. */
  required: Record<'captain' | 'firstOfficer' | 'cabinCrew' | 'purser', number>;
  /** Crew actually rostered on this type's airframes (cabin crew can fly any type). */
  maned: Record<'captain' | 'firstOfficer' | 'cabinCrew' | 'purser', number>;
}

/**
 * Fleet-wide cabin crew pool. Pursers and cabin crew are NOT type-specific —
 * one shared pool covers the combined WORKLOAD-sized cabin requirement
 * (rotation sets × per-airframe minimum) of every usable airframe of a type
 * that actually flies (idle types need no cabin crew), and a shortfall scales
 * all passenger types down by the same coverage factor.
 */
export interface CabinPoolStatus {
  purserRequired: number;
  /** Pursers currently rostered on usable airframes. */
  purserAvailable: number;
  cabinCrewRequired: number;
  /** Cabin crew currently rostered on usable airframes. */
  cabinCrewAvailable: number;
  /** purserRequired + cabinCrewRequired. */
  required: number;
  /** purserAvailable + cabinCrewAvailable. */
  available: number;
  /** min(1, available / required) — 1 when nothing is required. */
  coverageFactor: number;
}

export interface CrewPlan {
  /** Staff id → aircraft id (null = unassigned). Only touched members are listed. */
  assignments: Map<string, string | null>;
  manningByType: Record<string, AircraftCrewManning>;
  /** Shared, type-agnostic pursers + cabin crew pool. */
  cabinPool: CabinPoolStatus;
  totalStaffed: number;
  totalReleased: number;
  changed: boolean;
  engineerRequired: number;
  engineerHired: number;
  engineerShortfall: number;
}

/** Usable airframes can carry a crew (grounded/maintenance/stored cannot). */
export function isUsableAircraft(a: Aircraft): boolean {
  return a.status === 'available' || a.status === 'in-flight';
}

/** Per-airframe crew caps: the minimum, raised to the workload share for types that fly. */
export type AircraftCrewCaps = Record<'captain' | 'firstOfficer' | 'cabinCrew' | 'purser', number>;

/**
 * Workload-sized rostering target for every usable airframe, shared by the
 * dispatcher (what it rosters) and the staffing report (what it requires) so
 * the two always agree: the per-airframe minimum, raised to the type's workload
 * requirement (rotation sets × minimum, ceil-distributed across the type's
 * usable airframes) when the type has an active route. Idle types keep the
 * bare minimum — pilots stay posted so the airframe remains flyable.
 */
export function computeAircraftCrewCaps(fleet: Aircraft[], routes: Route[]): Map<string, AircraftCrewCaps> {
  const usableFleet = fleet.filter(isUsableAircraft);
  const workloadByType = computeTypeCrewRequirements(routes);
  const usableCountByType = new Map<string, number>();
  for (const a of usableFleet) {
    usableCountByType.set(a.typeId, (usableCountByType.get(a.typeId) ?? 0) + 1);
  }
  const caps = new Map<string, AircraftCrewCaps>();
  for (const a of usableFleet) {
    const min = getAircraftCrewRequirements(a.typeId);
    if (!min) continue;
    const cap: AircraftCrewCaps = {
      captain: min.captain,
      firstOfficer: min.firstOfficer,
      purser: min.purser,
      cabinCrew: min.cabinCrew,
    };
    const workload = workloadByType[a.typeId];
    if (workload) {
      const n = usableCountByType.get(a.typeId) ?? 1;
      cap.captain = Math.max(min.captain, Math.ceil(workload.captain / n));
      cap.firstOfficer = Math.max(min.firstOfficer, Math.ceil(workload.firstOfficer / n));
      cap.purser = Math.max(min.purser, Math.ceil(workload.purser / n));
      cap.cabinCrew = Math.max(min.cabinCrew, Math.ceil(workload.cabinCrew / n));
    }
    caps.set(a.id, cap);
  }
  return caps;
}

/** A pilot may crew an airframe when unrated, or when their rating matches its type. */
function pilotQualifies(m: StaffMember, aircraftTypeId: string): boolean {
  if (!RATED_ROLES.includes(m.role)) return true;
  return m.typeRating === null || m.typeRating === aircraftTypeId;
}

/**
 * Compute the crew manning plan. Pure — no store state is touched.
 * Sticky reassignment: existing (staff, aircraft) pairs survive when the pair
 * is still valid. Freed members and new members form a per-role pool that
 * fills gaps (captain → first officer → purser → cabin crew); rated pilots
 * are matched before unrated ones. Pilots are the only type-specific roles —
 * pursers and cabin crew may fill gaps on any type that flies (has an active
 * route); cabin crew rostered on idle types are released and redeployed to
 * understaffed flying types, and the pool requirement is sized for flying
 * airframes only. Every airframe is staffed up to its workload-sized cap
 * (EU-OSL rotation sets × minimum, ceil-distributed across the type's
 * airframes) so the hired rotation crew is actually rostered, not left
 * unassigned while the staffing report still requires it.
 */
export function computeCrewPlan(staff: StaffMember[], fleet: Aircraft[], routes: Route[]): CrewPlan {
  const assignments = new Map<string, string | null>();
  const kept = new Set<string>(); // staff ids keeping their assignment
  const pool: StaffMember[] = [];

  const usableFleet = fleet.filter(isUsableAircraft);

  // Types that fly this week (≥1 active route). Cabin crew are only rostered
  // onto these — crew sitting on idle types is released so the shared pool
  // can cover understaffed flying types instead.
  const flying = new Set<string>();
  for (const route of routes) {
    if (route.isActive && route.aircraftId) flying.add(route.aircraftId);
  }

  // --- 1. Validate sticky assignments ----------------------------------------
  for (const m of staff) {
    // A pilot or cabin crew member who hit a rolling flight/duty limit is on
    // mandatory rest: release them from any airframe and keep them out of the
    // fill pool for this week.
    const resting = isOnMandatoryRest(m);
    if (resting) {
      if (m.assignedAircraft) assignments.set(m.id, null); // explicitly released
      continue;
    }
    if (!m.assignedAircraft) {
      if (m.role !== 'engineer') pool.push(m);
      continue;
    }
    const aircraft = usableFleet.find((a) => a.id === m.assignedAircraft);
    const qualifies = !!aircraft && pilotQualifies(m, aircraft.typeId);
    // Cabin crew on idle types (no active route) are released so they can be
    // redeployed to understaffed flying types. Pilots stay put: their type
    // rating is what keeps the airframe ready to fly again.
    const idleCabin =
      !!aircraft && !flying.has(aircraft.typeId) && (m.role === 'purser' || m.role === 'cabin-crew');
    if (!qualifies || idleCabin) {
      if (m.role !== 'engineer') pool.push(m);
      assignments.set(m.id, null); // explicitly released
      continue;
    }
    kept.add(m.id);
    assignments.set(m.id, m.assignedAircraft);
  }

  // --- 2. Manning slots -------------------------------------------------------
  type RoleKey = 'captain' | 'firstOfficer' | 'purser' | 'cabinCrew';
  const slots = new Map<string, Record<RoleKey, number>>();
  for (const a of usableFleet) {
    if (!getAircraftCrewRequirements(a.typeId)) continue;
    slots.set(a.id, { captain: 0, firstOfficer: 0, cabinCrew: 0, purser: 0 });
  }
  for (const m of staff) {
    if (!m.assignedAircraft || !kept.has(m.id)) continue;
    const slot = slots.get(m.assignedAircraft);
    if (!slot) continue;
    if (m.role === 'captain') slot.captain += 1;
    else if (m.role === 'first-officer') slot.firstOfficer += 1;
    else if (m.role === 'purser') slot.purser += 1;
    else if (m.role === 'cabin-crew') slot.cabinCrew += 1;
  }

  // --- 2b. Workload-sized caps --------------------------------------------------
  // The staffing report requires WORKLOAD-sized crews per type (EU-OSL rotation
  // sets × the per-airframe minimum). The dispatcher must staff up to that
  // requirement — not just the bare minimum — otherwise the hired rotation
  // crew sits unassigned while the report still asks for them. Shared with
  // computeStaffingStatus so the report's "required" always matches what the
  // dispatcher can actually roster.
  const caps = computeAircraftCrewCaps(fleet, routes);

  // --- 3. Fill gaps from the pool (rated pilots first) ------------------------
  let totalStaffed = 0;
  let totalReleased = 0;
  const fillOrder: Array<{ role: StaffMember['role']; key: RoleKey }> = [
    { role: 'captain', key: 'captain' },
    { role: 'first-officer', key: 'firstOfficer' },
    { role: 'purser', key: 'purser' },
    { role: 'cabin-crew', key: 'cabinCrew' },
  ];

  for (const { role, key } of fillOrder) {
    for (const pass of [0, 1]) {
      for (const aircraft of usableFleet) {
        const slot = slots.get(aircraft.id);
        const cap = caps.get(aircraft.id);
        if (!slot || !cap) continue;
        if (slot[key] >= cap[key]) continue;
        // Cabin crew only roster onto types that fly; idle types stay empty.
        if ((key === 'purser' || key === 'cabinCrew') && !flying.has(aircraft.typeId)) continue;
        for (let i = 0; i < pool.length && slot[key] < cap[key]; ) {
          const m = pool[i];
          if (m.role !== role) { i += 1; continue; }
          if (pass === 0 ? m.typeRating !== null : m.typeRating === null) {
            // pass 0 wants rated, pass 1 wants unrated
            i += 1; continue;
          }
          if (!pilotQualifies(m, aircraft.typeId)) { i += 1; continue; }
          pool.splice(i, 1);
          assignments.set(m.id, aircraft.id);
          kept.add(m.id);
          slot[key] += 1;
          totalStaffed += 1;
        }
      }
    }
  }

  // --- 4. Release everyone still in the pool ----------------------------------
  for (const m of pool) {
    assignments.set(m.id, null);
    totalReleased += 1;
  }

  // --- 5. Manning report ---------------------------------------------------------
  // Cabin crew (pursers + cabin crew) are NOT type-specific: one fleet-wide
  // pool covers the combined WORKLOAD-sized requirement of all usable
  // airframes of types that actually fly (idle types need no cabin crew), and
  // a shortfall scales every passenger type down by the same pool coverage —
  // cabin crew rostered to type A can fly type B. Pilots stay type-specific.
  let purserRequired = 0;
  let cabinCrewRequired = 0;
  let purserAvailable = 0;
  let cabinCrewAvailable = 0;
  for (const a of usableFleet) {
    const cap = caps.get(a.id);
    if (!cap) continue;
    if (!flying.has(a.typeId)) continue; // idle type: needs no cabin crew
    purserRequired += cap.purser;
    cabinCrewRequired += cap.cabinCrew;
    const slot = slots.get(a.id);
    if (slot) {
      purserAvailable += slot.purser;
      cabinCrewAvailable += slot.cabinCrew;
    }
  }
  const cabinRequired = purserRequired + cabinCrewRequired;
  const cabinAvailable = purserAvailable + cabinCrewAvailable;
  const cabinPool: CabinPoolStatus = {
    purserRequired,
    purserAvailable,
    cabinCrewRequired,
    cabinCrewAvailable,
    required: cabinRequired,
    available: cabinAvailable,
    coverageFactor: cabinRequired === 0 ? 1 : Math.min(1, cabinAvailable / cabinRequired),
  };

  const manningByType: Record<string, AircraftCrewManning> = {};
  const typesInFleet = new Set(usableFleet.map((a) => a.typeId));
  for (const typeId of typesInFleet) {
    const req = getAircraftCrewRequirements(typeId)!;
    const airframes = usableFleet.filter((a) => a.typeId === typeId);
    let pilotPairedAircraft = 0;
    const sum: Record<RoleKey, number> = { captain: 0, firstOfficer: 0, cabinCrew: 0, purser: 0 };
    for (const a of airframes) {
      const slot = slots.get(a.id)!;
      sum.captain += slot.captain;
      sum.firstOfficer += slot.firstOfficer;
      sum.cabinCrew += slot.cabinCrew;
      sum.purser += slot.purser;
      // A complete pilot pair makes the airframe flyable; cabin coverage is
      // shared fleet-wide (see cabinPool).
      if (slot.captain >= req.captain && slot.firstOfficer >= req.firstOfficer) pilotPairedAircraft += 1;
    }
    const pilotCoverage = airframes.length === 0 ? 1 : pilotPairedAircraft / airframes.length;
    const needsCabin = req.purser > 0 || req.cabinCrew > 0;
    manningByType[typeId] = {
      typeId,
      usableAircraft: airframes.length,
      fullyMannedAircraft: pilotPairedAircraft,
      coverageFactor: pilotCoverage * (needsCabin ? cabinPool.coverageFactor : 1),
      required: { ...req },
      maned: { ...sum },
    };
  }

  const engineerRequired = getRequiredEngineerCount(fleet);
  const engineerHired = staff.filter((m) => m.role === 'engineer').length;

  return {
    assignments,
    manningByType,
    cabinPool,
    totalStaffed,
    totalReleased,
    changed: assignments.size > 0,
    engineerRequired,
    engineerHired,
    engineerShortfall: Math.max(0, engineerRequired - engineerHired),
  };
}

/**
 * Revenue/cost multiplier for a route's aircraft type: pilot-pair coverage on
 * its usable airframes × the fleet-wide cabin-pool coverage (1 when the type
 * has no usable airframe — the fleet utilization factor already zeroes out
 * the route there).
 */
export function getCrewCoverageFactor(plan: CrewPlan, typeId: string): number {
  const manning = plan.manningByType[typeId];
  if (!manning || manning.usableAircraft === 0) return 1;
  return manning.coverageFactor;
}