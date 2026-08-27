// ============================================================
// Crew Dispatcher — per-aircraft-type staff manning
// ------------------------------------------------------------
// Pure planning engine for the staff side of operations. An aircraft type
// needs a fixed crew per usable airframe: 1 captain + 1 first officer
// (pilot type ratings must match or be pending — unrated pilots still fly),
// 1 purser and ceil(maxPassengers / 50) cabin crew. Engineers are fleet-level:
// 1 per 5 owned aircraft; a shortfall becomes a maintenance penalty applied
// by gameStore. Mirrors the structure of utils/fleetDispatcher.ts: sticky
// assignments, one pass over a free pool, no state mutation here.
// ============================================================

import type { Aircraft, StaffMember } from '@/types/game';
import { AIRCRAFT_DATABASE } from '@/data/aircraft';

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

export interface AircraftCrewManning {
  typeId: string;
  /** Usable airframes of this type (available / in-flight). */
  usableAircraft: number;
  /** Usable airframes that have a COMPLETE crew. */
  fullyMannedAircraft: number;
  /** fullyManned / usable (1 when no usable airframe — nothing to man). */
  coverageFactor: number;
  required: Record<'captain' | 'firstOfficer' | 'cabinCrew' | 'purser', number>;
  maned: Record<'captain' | 'firstOfficer' | 'cabinCrew' | 'purser', number>;
}

export interface CrewPlan {
  /** Staff id → aircraft id (null = unassigned). Only touched members are listed. */
  assignments: Map<string, string | null>;
  manningByType: Record<string, AircraftCrewManning>;
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
 * are matched before unrated ones.
 */
export function computeCrewPlan(staff: StaffMember[], fleet: Aircraft[]): CrewPlan {
  const assignments = new Map<string, string | null>();
  const kept = new Set<string>(); // staff ids keeping their assignment
  const pool: StaffMember[] = [];

  const usableFleet = fleet.filter(isUsableAircraft);

  // --- 1. Validate sticky assignments ----------------------------------------
  for (const m of staff) {
    if (!m.assignedAircraft) {
      if (m.role !== 'engineer') pool.push(m);
      continue;
    }
    const aircraft = usableFleet.find((a) => a.id === m.assignedAircraft);
    const qualifies = !!aircraft && pilotQualifies(m, aircraft.typeId);
    if (!qualifies) {
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
        const req = getAircraftCrewRequirements(aircraft.typeId);
        if (!slot || !req) continue;
        if (slot[key] >= req[key]) continue;
        for (let i = 0; i < pool.length && slot[key] < req[key]; ) {
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

  // --- 5. Manning report per type ----------------------------------------------
  const manningByType: Record<string, AircraftCrewManning> = {};
  const typesInFleet = new Set(usableFleet.map((a) => a.typeId));
  for (const typeId of typesInFleet) {
    const req = getAircraftCrewRequirements(typeId)!;
    const airframes = usableFleet.filter((a) => a.typeId === typeId);
    let fullyMannedAircraft = 0;
    const sum: Record<RoleKey, number> = { captain: 0, firstOfficer: 0, cabinCrew: 0, purser: 0 };
    for (const a of airframes) {
      const slot = slots.get(a.id)!;
      sum.captain += slot.captain;
      sum.firstOfficer += slot.firstOfficer;
      sum.cabinCrew += slot.cabinCrew;
      sum.purser += slot.purser;
      if (
        slot.captain >= req.captain && slot.firstOfficer >= req.firstOfficer &&
        slot.cabinCrew >= req.cabinCrew && slot.purser >= req.purser
      ) fullyMannedAircraft += 1;
    }
    manningByType[typeId] = {
      typeId,
      usableAircraft: airframes.length,
      fullyMannedAircraft,
      coverageFactor: airframes.length === 0 ? 1 : fullyMannedAircraft / airframes.length,
      required: { ...req },
      maned: { ...sum },
    };
  }

  const engineerRequired = getRequiredEngineerCount(fleet);
  const engineerHired = staff.filter((m) => m.role === 'engineer').length;

  return {
    assignments,
    manningByType,
    totalStaffed,
    totalReleased,
    changed: assignments.size > 0,
    engineerRequired,
    engineerHired,
    engineerShortfall: Math.max(0, engineerRequired - engineerHired),
  };
}

/**
 * Revenue/cost multiplier for a route's aircraft type: the fraction of usable
 * airframes of that type with a complete crew (1 when the type has no usable
 * airframe — the fleet utilization factor already zeroes out the route there).
 */
export function getCrewCoverageFactor(plan: CrewPlan, typeId: string): number {
  const manning = plan.manningByType[typeId];
  if (!manning || manning.usableAircraft === 0) return 1;
  return manning.coverageFactor;
}