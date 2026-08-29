// ============================================================
// Crew regulations — flight/duty time limitations (EU-OSL style)
// ============================================================
// The crew-time rule set enforced on all flying crew (pilots and cabin crew):
//   1. Flight-time caps (actual block hours flown):
//        - max 100 h in any 28 consecutive days
//        - max 900 h in any 12 consecutive calendar months
//   2. Duty-time caps (report→release hours, flight × DUTY_TO_FLIGHT_RATIO):
//        - max  60 h in any 7 consecutive days
//        - max 110 h in any 14 consecutive days
//        - max 190 h in any 28 consecutive days
//   3. Flight Duty Period (FDP): the max single-duty length depends on the
//      report-time window and the number of sectors in the day; a duty that
//      crosses the Window of Circadian Low (00:00–02:00) is shortened.
//
// The game tracks crew time per IN-GAME WEEK (one record per pilot per week
// in StaffMember.dutyHistory — including zero-hour records for rest weeks,
// so the sliding windows advance). "Consecutive days" limits are therefore
// approximated over whole in-game weeks (1 week = 7 days).
//
// Everything here is pure (no store access) so it can be unit-tested.

import type { PilotDutyWeek, StaffMember, StaffRole } from '@/types/game';

// --- Regulated roles -----------------------------------------------------------

/** Every role that boards aircraft and is therefore subject to crew-time limits. */
export const FLYING_CREW_ROLES: StaffRole[] = ['captain', 'first-officer', 'purser', 'cabin-crew'];

/** True when a role is subject to the EU-OSL crew-time limits (pilots and cabin crew). */
export function isFlyingCrewRole(role: StaffRole): boolean {
  return FLYING_CREW_ROLES.includes(role);
}

// --- Cap constants ----------------------------------------------------------

/** Max flight hours in any 28 consecutive days (≈ 4 in-game weeks). */
export const FLIGHT_TIME_28D_HOURS = 100;
/** Max flight hours in any 12 consecutive calendar months. */
export const FLIGHT_TIME_12MO_HOURS = 900;
/** Max duty hours in any 7 consecutive days. */
export const DUTY_7D_HOURS = 60;
/** Max duty hours in any 14 consecutive days. */
export const DUTY_14D_HOURS = 110;
/** Max duty hours in any 28 consecutive days. */
export const DUTY_28D_HOURS = 190;

/** Duty hours consumed per flight hour (briefing, pre-flight, turnaround, release). */
export const DUTY_TO_FLIGHT_RATIO = 1.3;

/** How many weekly duty records to keep per pilot (53 covers the 12-month window). */
export const DUTY_HISTORY_MAX_WEEKS = 53;

/** A pilot with at most this much weekly flying capacity left is sent to rest. */
export const REST_THRESHOLD_HOURS = 1;

// --- Flight Duty Period (FDP) model ------------------------------------------

/** Minutes from report to first departure (briefing + pre-flight). */
export const PRE_REPORT_MINUTES = 30;
/** Minutes from last arrival to crew release. */
export const POST_RELEASE_MINUTES = 30;
/** Default report offset: the first leg departs 06:30 local, crews report before it. */
export const DEFAULT_FIRST_DEPARTURE_MINUTES = 6 * 60 + 30;

/**
 * Max FDP length (hours) for a day of duty, keyed by the report-time window
 * and the number of sectors flown that day. Later report times start lower
 * (the duty ends further into the night) and each extra sector adds a
 * turnaround inside the duty. The WOC penalty is applied on top (below).
 *
 *              1–2 sectors   3–4 sectors   5–6 sectors   7+ sectors
 * 05:00–08:00       13           12              11             10
 * 08:00–14:00       12           11              10              9
 * 14:00–21:00       11           10               9              8
 * 21:00–05:00       10            9               8              8 (floor)
 */
export const FDP_REPORT_BASE_HOURS: Array<{ from: number; to: number; base: number }> = [
  { from: 5 * 60, to: 8 * 60, base: 13 }, // early morning
  { from: 8 * 60, to: 14 * 60, base: 12 }, // midday
  { from: 14 * 60, to: 21 * 60, base: 11 }, // afternoon/evening
  { from: 21 * 60, to: 29 * 60, base: 10 }, // late night (21:00–05:00)
];

/** Sector-count penalty tiers (subtracted from the report-time base). */
export const FDP_SECTOR_PENALTIES: Array<{ maxSectors: number; penalty: number }> = [
  { maxSectors: 2, penalty: 0 },
  { maxSectors: 4, penalty: 1 },
  { maxSectors: 6, penalty: 2 },
  { maxSectors: Number.POSITIVE_INFINITY, penalty: 3 },
];

/** Hours subtracted when the duty crosses the Window of Circadian Low (00:00–02:00). */
export const FDP_WOC_PENALTY_HOURS = 1;
/** WOC start/end in minutes-of-day. */
const WOC_START_MINUTES = 0;
const WOC_END_MINUTES = 2 * 60;

/** Absolute minimum FDP length (hours) — duties are never shorter than this. */
export const FDP_MIN_HOURS = 8;

/** True if a duty of `durationMin` starting at `startMin` (minutes-of-day) overlaps 00:00–02:00. */
export function crossesWindowOfCircadianLow(startMin: number, durationMin: number): boolean {
  const end = startMin + durationMin;
  const span = Math.ceil(end / (24 * 60)) + 1;
  for (let k = 0; k < span; k++) {
    const wocStart = k * 24 * 60 + WOC_START_MINUTES;
    const wocEnd = k * 24 * 60 + WOC_END_MINUTES;
    if (startMin < wocEnd && end > wocStart) return true;
  }
  return false;
}

/**
 * Max FDP length (hours) for a duty starting at `reportMin` (minutes-of-day,
 * 0–1440) flying `sectorCount` sectors, after applying the sector and WOC
 * penalties. Clamped to [FDP_MIN_HOURS, 13].
 */
export function maxFdpHours(reportMin: number, sectorCount: number): number {
  const r = ((Math.round(reportMin) % 1440) + 1440) % 1440;
  const bucket = FDP_REPORT_BASE_HOURS.find((b) => r >= b.from && r < b.to) ?? FDP_REPORT_BASE_HOURS[0];
  const tier = FDP_SECTOR_PENALTIES.find((t) => Math.max(1, sectorCount) <= t.maxSectors) ?? FDP_SECTOR_PENALTIES[0];
  let fdpMin = (bucket.base - tier.penalty) * 60;
  if (crossesWindowOfCircadianLow(r, fdpMin)) fdpMin -= FDP_WOC_PENALTY_HOURS * 60;
  return Math.min(13, Math.max(FDP_MIN_HOURS, fdpMin / 60));
}

/**
 * How many full loop cycles fit into one day of duty: starts at
 * `firstDepartureMin` (default 06:30), each cycle takes `cycleMin` and the
 * duty ends 30 min after the last arrival. The result is capped so the
 * total duty fits both the 24 h day and the FDP for the day's sector count.
 * Returns 0 when even one cycle doesn't fit.
 */
export function maxLoopsPerDay(
  legsPerLoop: number,
  cycleMin: number,
  firstDepartureMin: number = DEFAULT_FIRST_DEPARTURE_MINUTES
): number {
  if (legsPerLoop <= 0 || cycleMin <= 0) return 0;
  const reportMin = firstDepartureMin - PRE_REPORT_MINUTES;
  let loops = 0;
  for (let n = 1; n <= 12; n++) {
    const dutyMin = n * cycleMin + PRE_REPORT_MINUTES + POST_RELEASE_MINUTES;
    if (dutyMin > 24 * 60) break;
    const fdpMin = maxFdpHours(reportMin, n * legsPerLoop) * 60;
    if (dutyMin > fdpMin) break;
    loops = n;
  }
  return loops;
}

// --- Rolling duty/flight windows ----------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The ISO date (YYYY-MM-DD) of the Monday of the week containing `date` —
 * the stable label used for one duty-history record per in-game week.
 */
export function weekStartIsoOf(date: Date): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

/** Sum of the last `weeks` weekly flight-hour records (0 for missing history). */
export function windowFlightHours(history: PilotDutyWeek[] | undefined, weeks: number): number {
  return windowSum(history, weeks, (w) => w.flightHours);
}

/** Sum of the last `weeks` weekly duty-hour records (0 for missing history). */
export function windowDutyHours(history: PilotDutyWeek[] | undefined, weeks: number): number {
  return windowSum(history, weeks, (w) => w.dutyHours);
}

function windowSum(
  history: PilotDutyWeek[] | undefined,
  weeks: number,
  pick: (w: PilotDutyWeek) => number
): number {
  if (!history || weeks <= 0) return 0;
  return history.slice(-weeks).reduce((sum, w) => sum + (pick(w) || 0), 0);
}

/** The pilot's used hours in every rolling limit window (all in absolute hours). */
export interface PilotDutyWindows {
  /** Flight hours in the last 28 days (cap: FLIGHT_TIME_28D_HOURS). */
  flight28d: number;
  /** Flight hours in the last 12 calendar months (cap: FLIGHT_TIME_12MO_HOURS). */
  flight12mo: number;
  /** Duty hours in the last 7 days (cap: DUTY_7D_HOURS). */
  duty7d: number;
  /** Duty hours in the last 14 days (cap: DUTY_14D_HOURS). */
  duty14d: number;
  /** Duty hours in the last 28 days (cap: DUTY_28D_HOURS). */
  duty28d: number;
}

/** Compute all rolling-window usage for a pilot from their dutyHistory. */
export function pilotDutyWindows(member: Pick<StaffMember, 'dutyHistory'>): PilotDutyWindows {
  const h = member.dutyHistory;
  return {
    flight28d: windowFlightHours(h, 4),
    flight12mo: windowFlightHours(h, 52),
    duty7d: windowDutyHours(h, 1),
    duty14d: windowDutyHours(h, 2),
    duty28d: windowDutyHours(h, 4),
  };
}

/**
 * Maximum additional FLIGHT hours this pilot may accrue next week before any
 * rolling limit would be exceeded. Each window contributes its remaining
 * allowance prorated to one week; the tightest one wins. 0 = at the limit.
 */
export function weeklyRemainingFlightHours(member: Pick<StaffMember, 'dutyHistory'>): number {
  const w = pilotDutyWindows(member);
  const allowances = [
    // Duty caps, expressed in flight hours, prorated over the window:
    (DUTY_7D_HOURS - w.duty7d) / DUTY_TO_FLIGHT_RATIO,
    (DUTY_14D_HOURS - w.duty14d) / 2 / DUTY_TO_FLIGHT_RATIO,
    (DUTY_28D_HOURS - w.duty28d) / 4 / DUTY_TO_FLIGHT_RATIO,
    // Flight caps (already in flight hours):
    (FLIGHT_TIME_28D_HOURS - w.flight28d) / 4,
    (FLIGHT_TIME_12MO_HOURS - w.flight12mo) * 7 / 365,
  ];
  return Math.max(0, Math.min(...allowances));
}

/**
 * A crew member is on mandatory rest when a hard window is exhausted (28-day
 * flight, 28-day duty or 12-month flight cap reached) or when the tightest
 * window leaves (almost) no capacity for next week. Applies to pilots and
 * cabin crew alike; non-flying roles are never on rest.
 */
export function isOnMandatoryRest(member: Pick<StaffMember, 'role' | 'dutyHistory'>): boolean {
  if (!isFlyingCrewRole(member.role)) return false;
  const w = pilotDutyWindows(member);
  if (w.flight28d >= FLIGHT_TIME_28D_HOURS) return true;
  if (w.duty28d >= DUTY_28D_HOURS) return true;
  if (w.flight12mo >= FLIGHT_TIME_12MO_HOURS) return true;
  return weeklyRemainingFlightHours(member) <= REST_THRESHOLD_HOURS;
}

/**
 * Maximum flight hours a single crew member can sustainably fly per week
 * without ever breaching an EU-OSL limit — the weekly proration of the
 * tightest cap (28-day flight, 28-day duty, 12-month flight).
 */
export function sustainableWeeklyFlightHours(): number {
  return Math.min(
    FLIGHT_TIME_28D_HOURS / 4, // prorated 28-day flight cap
    DUTY_28D_HOURS / 4 / DUTY_TO_FLIGHT_RATIO, // prorated 28-day duty cap
    FLIGHT_TIME_12MO_HOURS / 52, // prorated 12-month flight cap
  );
}

/**
 * How many full crew sets are required to sustain a weekly flying workload
 * without violating crew-time limits. A 24 h route (~168 h/week) far exceeds
 * one person's sustainable share, so it needs many rotating sets — the same
 * crew cannot legally fly it straight through. 0 workload → 0 sets.
 */
export function crewSetsRequired(weeklyFlightHours: number): number {
  if (weeklyFlightHours <= 0) return 0;
  return Math.max(1, Math.ceil(weeklyFlightHours / sustainableWeeklyFlightHours()));
}

/**
 * Append (or merge) this week's duty record onto a pilot. Pure — returns a
 * new member. `flightHours <= 0` still records the week (a rest week) so the
 * sliding windows slide forward; the history is trimmed to the last
 * DUTY_HISTORY_MAX_WEEKS records.
 */
export function appendDutyWeek(
  member: StaffMember,
  flightHours: number,
  weekStartIso: string
): StaffMember {
  const hours = Math.max(0, round1(flightHours));
  const dutyHours = round1(hours * DUTY_TO_FLIGHT_RATIO);
  const history = [...(member.dutyHistory ?? [])];
  const last = history[history.length - 1];
  if (last && last.weekStart === weekStartIso) {
    history[history.length - 1] = {
      ...last,
      flightHours: round1(last.flightHours + hours),
      dutyHours: round1(last.dutyHours + dutyHours),
    };
  } else {
    history.push({ weekStart: weekStartIso, flightHours: hours, dutyHours });
  }
  return { ...member, dutyHistory: history.slice(-DUTY_HISTORY_MAX_WEEKS) };
}