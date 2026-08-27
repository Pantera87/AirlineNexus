// ============================================================
// Staff Engine — hiring, wages, promotions, type ratings, morale
// ------------------------------------------------------------
// Pure logic for the staff system (no store/state mutation of the
// game itself — gameStore actions call these helpers and apply the
// results). See utils/crewDispatcher.ts for the aircraft manning math.
// ============================================================

import type { AircraftCategory, StaffMember, StaffRole } from '@/types/game';
import { getAircraftById } from '@/data/aircraft';
import { clamp, formatCurrency, formatNumber, generateId, randomBetween, randomChoice } from './helpers';
import { DAILY_DUTY_HOURS } from './routeEngine';

// --- Role metadata ---------------------------------------------------------

export const ROLE_LABELS: Record<StaffRole, string> = {
  captain: 'Captain',
  'first-officer': 'First Officer',
  purser: 'Purser',
  'cabin-crew': 'Cabin Crew',
  engineer: 'Engineer',
};

export const ROLE_PLURAL: Record<StaffRole, string> = {
  captain: 'Captains',
  'first-officer': 'First Officers',
  purser: 'Pursers',
  'cabin-crew': 'Cabin Crew',
  engineer: 'Engineers',
};

/** Roles that fly aircraft (they carry a single active type rating + flying hours). */
export const PILOT_ROLES: StaffRole[] = ['captain', 'first-officer'];

export function isPilotRole(role: StaffRole): role is 'captain' | 'first-officer' {
  return role === 'captain' || role === 'first-officer';
}

// --- Wages ------------------------------------------------------------------
// Market salary is a monthly figure that scales with flying hours (pilots) or
// years of experience (other roles): base × (1 + progress × spread).

export interface RoleWageConfig {
  base: number; // monthly salary at zero experience
  spread: number; // multiplier applied at maxProgress
  maxProgress: number; // flight hours (pilots) or years (others)
}

export const ROLE_WAGES: Record<StaffRole, RoleWageConfig> = {
  captain: { base: 16000, spread: 0.8, maxProgress: 15000 }, // hours → $16k–$29k/mo
  'first-officer': { base: 10000, spread: 0.7, maxProgress: 15000 }, // → $10k–$17k/mo
  purser: { base: 7000, spread: 0.5, maxProgress: 10 }, // years → $7k–$10.5k/mo
  'cabin-crew': { base: 5000, spread: 0.5, maxProgress: 10 }, // → $5k–$7.5k/mo
  engineer: { base: 8000, spread: 0.5, maxProgress: 10 }, // → $8k–$12k/mo
};

/** How many flying hours make up a career year (used to derive experience for display). */
export const HOURS_PER_EXPERIENCE_YEAR = 1000;

/** Flat discount applied to an unrated pilot's wage during their reduced-wage period. */
export const REDUCED_WAGE_MULTIPLIER = 0.7;

/** Selectable reduced-wage durations (months) when hiring an unrated pilot. */
export const REDUCED_WAGE_OPTIONS = [3, 6, 12] as const;

/** Market wage for a pilot by role + flying hours. */
export function pilotMarketSalary(role: 'captain' | 'first-officer', flightHours: number): number {
  const cfg = ROLE_WAGES[role];
  const progress = clamp(flightHours, 0, cfg.maxProgress) / cfg.maxProgress;
  return Math.round(cfg.base * (1 + progress * cfg.spread) / 100) * 100;
}

/** Market wage for non-pilot roles by years of experience. */
export function nonPilotMarketSalary(role: StaffRole, experienceYears: number): number {
  const cfg = ROLE_WAGES[role];
  const progress = clamp(experienceYears, 0, cfg.maxProgress) / cfg.maxProgress;
  return Math.round(cfg.base * (1 + progress * cfg.spread) / 100) * 100;
}

// --- Type ratings -----------------------------------------------------------
// A pilot holds exactly ONE active type rating. Switching it is a paid
// "type conversion" whose cost scales with the size class of the aircraft.


// --- Candidate generation ---------------------------------------------------

// First names are split by gender so a candidate's portrait comes from the
// matching photo pool (public/staff-photos/{male,female}).
const MALE_FIRST_NAMES = [
  'James', 'Wei', 'Tariq', 'Liam', 'Omar', 'Diego', 'Ravi', 'Marek', 'Jonas', 'Pavel',
];

const FEMALE_FIRST_NAMES = [
  'Maria', 'Elena', 'Sofia', 'Yuki', 'Nina', 'Anna', 'Ingrid', 'Clara', 'Fatima', 'Leila',
];

const LAST_NAMES = [
  'Smith', 'García', 'Chen', 'Petrov', 'Okafor', 'Müller', 'Rossi', 'Tanaka', 'Novak', 'Haddad',
  'Kowalski', 'Bergström', 'Silva', 'Andersson', 'Costa', 'Ivanov', 'Moreau', 'Yamamoto', 'Larsen', 'Pereira',
];

// --- Photo bank ------------------------------------------------------------
// Portraits live in public/staff-photos/{male,female}/ as 01.png … N.png.
// Each candidate picks a random 1-based index from its gender pool at
// generation time; if the file doesn't exist yet, the UI silently falls
// back to an initials avatar, so the game works before the bank is filled.

/** Number of portraits per gender folder the generator can randomly pick from. */
export const PHOTO_BANK_SIZE = 36;

/** Public path of a staff portrait (1-based index, zero-padded). */
export function staffPhotoPath(gender: 'male' | 'female', index: number): string {
  return `/staff-photos/${gender}/${String(index).padStart(2, '0')}.png`;
}

/** Flying-hours ranges for generated pilot candidates (they carry a whole career on them). */
const PILOT_HOURS_RANGE: Record<'captain' | 'first-officer', [number, number]> = {
  captain: [5000, 25000], // captains are senior; 3k+ hours for promotion is common ground
  'first-officer': [500, 12000],
};

const NON_PILOT_EXPERIENCE_RANGE: Record<Exclude<StaffRole, 'captain' | 'first-officer'>, [number, number]> = {
  purser: [1, 20],
  'cabin-crew': [0, 15],
  engineer: [1, 25],
};

/**
 * Generate one hiring candidate (no id — the caller assigns one).
 * Pilots: optionally carry a type rating; unrated pilots are hired into a
 * reduced-wage period (70% market) for `reducedWageMonths` months so the player
 * can save the conversion cost, or get a full market wage immediately.
 */
export function generateHiringCandidate(
  role: StaffRole,
  opts: { typeRating?: string | null; reducedWageMonths?: number } = {},
  now: Date = new Date()
): StaffMember {
  const gender: 'male' | 'female' = Math.random() < 0.5 ? 'male' : 'female';
  const name = `${randomChoice(gender === 'male' ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`;
  let salary: number;
  let flightHours = 0;
  let experience = 0;
  let typeRating: string | null = null;
  let reducedWageUntil: number | null = null;

  if (isPilotRole(role)) {
    const [min, max] = PILOT_HOURS_RANGE[role];
    flightHours = randomBetween(min, max);
    experience = Math.round(flightHours / HOURS_PER_EXPERIENCE_YEAR);
    typeRating = opts.typeRating ?? null;
    if (typeRating === null && (opts.reducedWageMonths ?? 0) > 0) {
      const market = pilotMarketSalary(role, flightHours);
      salary = Math.round((market * REDUCED_WAGE_MULTIPLIER) / 100) * 100;
      reducedWageUntil = new Date(now.getFullYear(), now.getMonth() + opts.reducedWageMonths!, 1).getTime();
    } else {
      salary = pilotMarketSalary(role, flightHours);
    }
  } else {
    const [min, max] = NON_PILOT_EXPERIENCE_RANGE[role];
    experience = randomBetween(min, max);
    salary = nonPilotMarketSalary(role, experience);
  }

  return {
    id: generateId('staff'),
    name,
    gender,
    photo: staffPhotoPath(gender, randomBetween(1, PHOTO_BANK_SIZE)),
    role,
    experience,
    salary,
    performance: randomBetween(55, 95),
    assignedAircraft: null,
    assignedRoute: null,
    startDate: now,
    morale: randomBetween(60, 90),
    flightHours,
    typeRating,
    reducedWageUntil,
  };
}

/** Generate a full candidate shortlist (3) for the hiring panel. */
export function generateHiringShortlist(
  role: StaffRole,
  count: number,
  opts: { typeRating?: string | null; reducedWageMonths?: number } = {},
  now: Date = new Date()
): StaffMember[] {
  return Array.from({ length: count }, () => generateHiringCandidate(role, opts, now));
}

// --- Promotions -------------------------------------------------------------

export const PROMOTION_FO_TO_CPT = {
  minFlightHours: 3000,
  minPerformance: 60,
  cost: 50000, // type-training + command course
};

export const PROMOTION_CC_TO_PURSER = {
  minExperienceYears: 2,
  minPerformance: 60,
  cost: 10000,
};

export interface PromotionEligibility {
  eligible: boolean;
  reasons: string[]; // unmet requirements (empty when eligible)
  cost: number;
  newRole: StaffRole;
}

/** Promotion gates. Only FO→Captain and Cabin Crew→Purser exist. */
export function getPromotionEligibility(member: StaffMember): PromotionEligibility | null {
  if (member.role === 'first-officer') {
    const gate = PROMOTION_FO_TO_CPT;
    const reasons: string[] = [];
    if (member.flightHours < gate.minFlightHours) {
      reasons.push(`Flying hours: ${formatNumber(member.flightHours)} / ${formatNumber(gate.minFlightHours)} hrs required`);
    }
    if (member.performance < gate.minPerformance) {
      reasons.push(`Performance: ${member.performance} / ${gate.minPerformance} required`);
    }
    return { eligible: reasons.length === 0, reasons, cost: gate.cost, newRole: 'captain' };
  }

  if (member.role === 'cabin-crew') {
    const gate = PROMOTION_CC_TO_PURSER;
    const reasons: string[] = [];
    if (member.experience < gate.minExperienceYears) {
      reasons.push(`Experience: ${member.experience} / ${gate.minExperienceYears} yrs required`);
    }
    if (member.performance < gate.minPerformance) {
      reasons.push(`Performance: ${member.performance} / ${gate.minPerformance} required`);
    }
    return { eligible: reasons.length === 0, reasons, cost: gate.cost, newRole: 'purser' };
  }

  return null; // No promotion path for this role
}

/** Apply a promotion (caller must check eligibility + affordability). Role changes; type rating is untouched. */
export function applyPromotion(member: StaffMember, newRole: StaffRole): StaffMember {
  return {
    ...member,
    role: newRole,
    // A new purser earns the market wage for their experience; a new captain jumps to the captain curve.
    salary: isPilotRole(newRole)
      ? pilotMarketSalary(newRole, member.flightHours)
      : nonPilotMarketSalary(newRole, member.experience),
    morale: clamp(member.morale + 10, 0, 100),
  };
}

export const TYPE_RATING_CONVERSION_COSTS: Record<AircraftCategory, number> = {
  regional: 20000,
  turboprop: 20000,
  'narrow-body': 40000,
  'business-jet': 40000,
  cargo: 40000,
  'wide-body': 75000,
};

/** One-time cost to re-rate a pilot onto the given aircraft type (their old rating is dropped). */
export function getTypeConversionCost(typeId: string): number | null {
  const type = getAircraftById(typeId);
  if (!type) return null;
  return TYPE_RATING_CONVERSION_COSTS[type.category] ?? 40000;
}

// --- Type rating conversion -------------------------------------------------

export interface TypeConversionResult {
  ok: boolean;
  reason: string; // failure explanation (empty on success)
  cost: number;
  updated: StaffMember | null; // the member after conversion
}

/**
 * Re-rate a pilot onto a specific aircraft type (their previous rating is dropped —
 * one active rating only). Pure: returns the updated member without mutating.
 */
export function convertTypeRating(member: StaffMember, newTypeId: string): TypeConversionResult {
  if (!isPilotRole(member.role)) {
    return { ok: false, reason: 'Only pilots hold type ratings.', cost: 0, updated: null };
  }
  if (member.typeRating === newTypeId) {
    return { ok: false, reason: `Already rated on ${getAircraftById(newTypeId)?.name ?? newTypeId}.`, cost: 0, updated: null };
  }
  const cost = getTypeConversionCost(newTypeId);
  if (cost === null) {
    return { ok: false, reason: 'Unknown aircraft type.', cost: 0, updated: null };
  }
  const updated: StaffMember = {
    ...member,
    typeRating: newTypeId,
    // A fresh rating slightly improves morale (new assignment) — no other state change.
    morale: clamp(member.morale + 5, 0, 100),
  };
  return { ok: true, reason: '', cost, updated };
}

/** Human-readable label for the conversion cost (used in UI tooltips/confirmations). */
export function describeTypeConversionCost(typeId: string): string {
  const type = getAircraftById(typeId);
  const cost = getTypeConversionCost(typeId);
  if (!type || cost === null) return 'Unknown type';
  return `${type.name} (${type.category}) — ${formatCurrency(cost)}`;
}


// --- Morale ------------------------------------------------------------------
// Factor-registry pattern: each factor is a pure (member) => delta function with
// an id + label, so the monthly update stays auditable and easy to extend.
// No gameplay effect yet — morale is informational for now.

export type MoraleFactor = {
  id: string;
  label: string;
  compute: (member: StaffMember) => number;
};

export const MORALE_FACTORS: MoraleFactor[] = [
  // Underpaid staff (still in their reduced-wage period, or hired under market)
  {
    id: 'wage-gap',
    label: 'Wage below market',
    compute: (m) => {
      const market = isPilotRole(m.role)
        ? pilotMarketSalary(m.role, m.flightHours)
        : nonPilotMarketSalary(m.role, m.experience);
      if (market <= 0) return 0;
      const ratio = m.salary / market;
      if (ratio >= 0.95) return 0;
      if (ratio >= 0.7) return -3; // the reduced-wage band
      return -6;
    },
  },
  // High performers get a small bump
  {
    id: 'high-performer',
    label: 'High performer',
    compute: (m) => (m.performance >= 85 ? 2 : 0),
  },
  // Low morale recovers slowly toward the 70 baseline
  {
    id: 'baseline-drift',
    label: 'Baseline drift',
    compute: (m) => (m.morale > 70 ? -2 : m.morale < 70 ? 2 : 0),
  },
];

/** Apply one month's morale update to every member (pure). */
export function applyMonthlyMoraleUpdate(staff: StaffMember[]): StaffMember[] {
  return staff.map((m) => {
    let delta = 0;
    for (const factor of MORALE_FACTORS) delta += factor.compute(m);
    return { ...m, morale: clamp(m.morale + delta, 0, 100) };
  });
}

// --- Flying hours -----------------------------------------------------------
// Pilots accrue flying hours each week. The needed hours per aircraft type come
// from the route settlement (utilization of the fleet); the store distributes
// them across the rated, ASSIGNED pilots of that type via accrueWeeklyFlyingHours.
// Every pilot is capped at the weekly duty limit.

/** Weekly duty cap in flying hours per pilot (matches the fleet utilization model). */
export const WEEKLY_DUTY_CAP_HOURS = DAILY_DUTY_HOURS * 7;

/**
 * Distribute `typeHours` of weekly flying hours across the given pilots
 * (already filtered to rated + assigned pilots of one aircraft type).
 * Pure — returns updated members with rounded hours, capped per pilot.
 */
export function accrueWeeklyFlyingHours(pilots: StaffMember[], typeHours: number): StaffMember[] {
  if (typeHours <= 0 || pilots.length === 0) return pilots;

  const out: StaffMember[] = pilots.map((p) => ({ ...p, flightHours: Math.round(p.flightHours * 10) / 10 }));
  const remainingCap = out.map((p) => Math.max(0, WEEKLY_DUTY_CAP_HOURS - p.flightHours));
  let remaining = typeHours;

  // Evenly split each round among pilots who still have weekly capacity.
  for (let round = 0; round < 64 && remaining > 1e-9; round++) {
    const aliveIdx: number[] = [];
    for (let i = 0; i < out.length; i++) if (remainingCap[i] > 1e-9) aliveIdx.push(i);
    if (aliveIdx.length === 0) break;
    const minCap = Math.min(...aliveIdx.map((i) => remainingCap[i]));
    const share = Math.min(remaining / aliveIdx.length, minCap);
    if (share <= 1e-9) break;
    for (const i of aliveIdx) {
      out[i].flightHours = Math.round((out[i].flightHours + share) * 10) / 10;
      remainingCap[i] -= share;
      remaining -= share;
    }
  }
  return out;
}

// --- Monthly payroll & wage reversion ----------------------------------------

export interface MonthlyPayrollResult {
  staff: StaffMember[];
  totalSalary: number;
  reversionCount: number; // members whose reduced-wage period expired this month
}

/**
 * One monthly payroll settlement: totals salaries, reverts any expired
 * reduced-wage periods to full market wages, and applies the morale update.
 * Pure — the store applies the returned staff and the cash effect itself.
 */
export function settleMonthlyPayroll(staff: StaffMember[], now: Date): MonthlyPayrollResult {
  let reversionCount = 0;

  const afterWageReversion = staff.map((m) => {
    if (m.reducedWageUntil !== null && m.reducedWageUntil <= now.getTime()) {
      reversionCount += 1;
      const market = isPilotRole(m.role)
        ? pilotMarketSalary(m.role, m.flightHours)
        : nonPilotMarketSalary(m.role, m.experience);
      return { ...m, salary: market, reducedWageUntil: null };
    }
    return m;
  });

  const totalSalary = afterWageReversion.reduce((sum, m) => sum + m.salary, 0);
  const staffWithMorale = applyMonthlyMoraleUpdate(afterWageReversion);

  return { staff: staffWithMorale, totalSalary, reversionCount };
}

