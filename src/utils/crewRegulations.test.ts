import { describe, it, expect } from 'vitest';
import type { StaffMember } from '@/types/game';
import {
  DUTY_7D_HOURS,
  DUTY_TO_FLIGHT_RATIO,
  DUTY_HISTORY_MAX_WEEKS,
  FLIGHT_TIME_12MO_HOURS,
  FLIGHT_TIME_28D_HOURS,
  FDP_MIN_HOURS,
  appendDutyWeek,
  crossesWindowOfCircadianLow,
  crewSetsRequired,
  isOnMandatoryRest,
  maxFdpHours,
  maxLoopsPerDay,
  pilotDutyWindows,
  sustainableWeeklyFlightHours,
  weekStartIsoOf,
  weeklyRemainingFlightHours,
} from './crewRegulations';
import { accrueWeeklyFlyingHours, WEEKLY_DUTY_CAP_HOURS } from './staffEngine';

// --- Fixtures ------------------------------------------------------------------

let seq = 0;
function mkPilot(role: StaffMember['role'] = 'captain', flightHours = 0): StaffMember {
  seq += 1;
  return {
    id: `pilot-${seq}`,
    name: `Test Pilot ${seq}`,
    gender: 'male',
    photo: null,
    role,
    experience: 5,
    salary: 4000,
    performance: 70,
    assignedAircraft: null,
    assignedRoute: null,
    startDate: new Date('2024-01-01'),
    morale: 75,
    flightHours,
    typeRating: null,
    reducedWageUntil: null,
  };
}

/** Append N weeks (consecutive Mondays from 2026-01-05, noon UTC). */
function withWeeks(p: StaffMember, weeks: Array<{ week: number; flightHours: number }>): StaffMember {
  let out = p;
  for (const w of weeks) {
    const d = new Date(Date.UTC(2026, 0, 5 + (w.week - 1) * 7, 12, 0, 0));
    out = appendDutyWeek(out, w.flightHours, d.toISOString().slice(0, 10));
  }
  return out;
}

describe('weekStartIsoOf — Monday label of the in-game week', () => {
  it('maps Thursday to its Monday', () => {
    expect(weekStartIsoOf(new Date(Date.UTC(2026, 2, 5, 12, 0, 0)))).toBe('2026-03-02');
  });
  it('maps Sunday back to the same Monday', () => {
    expect(weekStartIsoOf(new Date(Date.UTC(2026, 2, 8, 12, 0, 0)))).toBe('2026-03-02');
  });
  it('is stable for a Monday itself', () => {
    expect(weekStartIsoOf(new Date(Date.UTC(2026, 2, 2, 12, 0, 0)))).toBe('2026-03-02');
  });
});

describe('maxFdpHours — report time × sector count table', () => {
  it('early report (06:30), 1 sector → full 13 h', () => {
    expect(maxFdpHours(6 * 60 + 30, 1)).toBe(13);
  });
  it('midday report (10:00), 4 sectors → 12 − 1 = 11 h', () => {
    expect(maxFdpHours(10 * 60, 4)).toBe(11);
  });
  it('late-evening report loses the WOC penalty', () => {
    // 22:00 report, 1 sector: base 10 h, duty 22:00→06:00 crosses 00:00–02:00.
    expect(maxFdpHours(22 * 60, 1)).toBe(9);
  });
  it('never goes below the 8 h floor', () => {
    // 23:00 report (base 10), 8 sectors (−3), WOC (−1) → 6 → clamped to 8.
    expect(maxFdpHours(23 * 60, 8)).toBe(FDP_MIN_HOURS);
  });
  it('never exceeds 13 h', () => {
    expect(maxFdpHours(5 * 60 + 15, 1)).toBeLessThanOrEqual(13);
  });
  it('never grows with the sector count', () => {
    const r = 6 * 60;
    for (let s = 2; s <= 8; s++) {
      expect(maxFdpHours(r, s)).toBeLessThanOrEqual(maxFdpHours(r, s - 1));
    }
  });
});

describe('crossesWindowOfCircadianLow', () => {
  it('detects a duty reaching into 00:00–02:00 the next day', () => {
    expect(crossesWindowOfCircadianLow(23 * 60, 90)).toBe(true); // 23:00 → 00:30
  });
  it('detects a duty starting inside the WOC', () => {
    expect(crossesWindowOfCircadianLow(30, 60)).toBe(true); // 00:30 → 01:30
  });
  it('ignores a daytime duty', () => {
    expect(crossesWindowOfCircadianLow(10 * 60, 600)).toBe(false);
  });
});

describe('maxLoopsPerDay — FDP-aware cycle cap', () => {
  it('a 90-min 2-sector loop allows 6 cycles in a 06:30-start day of duty', () => {
    // report 06:00: bases 13/12/11/10 h by sector tier; duty = n×90 + 60 min.
    // n=6 → 600 min duty ≤ 600 min (8+ sectors → 10 h); n=7 → 690 > 600.
    expect(maxLoopsPerDay(2, 90)).toBe(6);
  });
  it('a 6-hour loop cannot run more than once a day', () => {
    expect(maxLoopsPerDay(2, 360)).toBe(1);
  });
  it('returns 0 for degenerate input', () => {
    expect(maxLoopsPerDay(0, 60)).toBe(0);
    expect(maxLoopsPerDay(2, 0)).toBe(0);
  });
});

describe('rolling windows & mandatory rest', () => {
  it('a fresh pilot has capacity and is not on rest', () => {
    const p = mkPilot();
    expect(isOnMandatoryRest(p)).toBe(false);
    // Tightest window for a fresh pilot: 900 h / 365 d × 7 ≈ 17.26 h/week.
    expect(weeklyRemainingFlightHours(p)).toBeCloseTo((FLIGHT_TIME_12MO_HOURS * 7) / 365, 1);
  });

  it('reaching the 28-day flight cap (100 h over 4 weeks) triggers rest', () => {
    const p = withWeeks(mkPilot(), [0, 1, 2, 3].map((w) => ({ week: w, flightHours: FLIGHT_TIME_28D_HOURS / 4 })));
    expect(pilotDutyWindows(p).flight28d).toBe(FLIGHT_TIME_28D_HOURS);
    expect(isOnMandatoryRest(p)).toBe(true);
  });

  it('7-day duty window: at the cap → rest, a bit under → flying', () => {
    const atCapFlight = Math.round((DUTY_7D_HOURS / DUTY_TO_FLIGHT_RATIO) * 10) / 10; // ≈46.2 h
    const atCap = withWeeks(mkPilot(), [{ week: 1, flightHours: atCapFlight }]);
    expect(weeklyRemainingFlightHours(atCap)).toBeLessThanOrEqual(1);
    expect(isOnMandatoryRest(atCap)).toBe(true);
    const under = withWeeks(mkPilot(), [{ week: 1, flightHours: atCapFlight - 2 }]);
    expect(isOnMandatoryRest(under)).toBe(false);
  });

  it('rest slides off once rest weeks push the busy week out of the window', () => {
    let p = withWeeks(mkPilot(), [
      { week: 1, flightHours: 45 },
      { week: 2, flightHours: 45 },
      { week: 3, flightHours: 45 },
      { week: 4, flightHours: 45 },
    ]); // 4 × 45 × 1.3 = 234 duty in 28d > 190 → rest
    expect(isOnMandatoryRest(p)).toBe(true);
    p = withWeeks(p, [
      { week: 5, flightHours: 0 },
      { week: 6, flightHours: 0 },
      { week: 7, flightHours: 0 },
      { week: 8, flightHours: 0 },
    ]); // the 45 h weeks slide out of the 28-day window
    expect(isOnMandatoryRest(p)).toBe(false);
  });

  it('the 12-month flight cap triggers rest', () => {
    let p = mkPilot();
    for (let w = 0; w < 52; w++) {
      p = appendDutyWeek(p, 18, weekStartIsoOf(new Date(Date.UTC(2026, 0, 5 + w * 7, 12))));
    } // 52 × 18 = 936 h > 900
    expect(pilotDutyWindows(p).flight12mo).toBeGreaterThan(FLIGHT_TIME_12MO_HOURS);
    expect(isOnMandatoryRest(p)).toBe(true);
  });

  it('cabin crew are subject to the same limits as pilots', () => {
    const cc = mkPilot('cabin-crew');
    const atCap = withWeeks(cc, [0, 1, 2, 3].map((w) => ({ week: w, flightHours: FLIGHT_TIME_28D_HOURS / 4 })));
    expect(pilotDutyWindows(atCap).flight28d).toBe(FLIGHT_TIME_28D_HOURS);
    expect(isOnMandatoryRest(atCap)).toBe(true);
  });

  it('pursers (senior cabin crew) are subject to the limits too', () => {
    const p = withWeeks(
      mkPilot('purser'),
      [0, 1, 2, 3].map((w) => ({ week: w, flightHours: FLIGHT_TIME_28D_HOURS / 4 + 2 }))
    ); // 4 × 27 h = 108 flight h in 28d > 100 → the 28-day flight cap is reached
    expect(isOnMandatoryRest(p)).toBe(true);
  });

  it('non-flying roles (engineers) are never on mandatory rest', () => {
    let e = mkPilot('engineer');
    e = withWeeks(e, Array.from({ length: 4 }, (_, w) => ({ week: w + 1, flightHours: 100 })));
    expect(isOnMandatoryRest(e)).toBe(false);
  });
});

describe('appendDutyWeek', () => {
  it('records flight and duty (×1.3) hours for a new week', () => {
    const p = appendDutyWeek(mkPilot(), 10, '2026-03-02');
    expect(p.dutyHistory).toHaveLength(1);
    expect(p.dutyHistory![0]).toEqual({ weekStart: '2026-03-02', flightHours: 10, dutyHours: 13.0 });
  });

  it('merges when the same week is appended twice', () => {
    let p = appendDutyWeek(mkPilot(), 5, '2026-03-02');
    p = appendDutyWeek(p, 3, '2026-03-02');
    expect(p.dutyHistory).toHaveLength(1);
    expect(p.dutyHistory![0].flightHours).toBe(8);
    expect(p.dutyHistory![0].dutyHours).toBeCloseTo(10.4, 1);
  });

  it('trims the history to the last DUTY_HISTORY_MAX_WEEKS records', () => {
    let p = mkPilot();
    for (let w = 0; w < DUTY_HISTORY_MAX_WEEKS + 10; w++) {
      const d = new Date(Date.UTC(2025, 6, 1 + w * 7, 12, 0, 0));
      p = appendDutyWeek(p, 1, d.toISOString().slice(0, 10));
    }
    expect(p.dutyHistory).toHaveLength(DUTY_HISTORY_MAX_WEEKS);
    expect(pilotDutyWindows(p).flight12mo).toBeLessThanOrEqual(DUTY_HISTORY_MAX_WEEKS);
  });
});

describe('accrueWeeklyFlyingHours — weekly distribution with regulation caps', () => {
  it('splits hours evenly but never exceeds the tightest window per pilot', () => {
    const cap = weeklyRemainingFlightHours(mkPilot()); // ≈17.26 h for a fresh pilot
    const [a, b] = accrueWeeklyFlyingHours([mkPilot(), mkPilot()], 40, '2026-03-02');
    expect(a.flightHours).toBeCloseTo(cap, 1);
    expect(b.flightHours).toBeCloseTo(cap, 1);
    expect(a.dutyHistory).toHaveLength(1);
  });

  it('records a rest week (0 h) for exhausted pilots; fresh pilots absorb the surplus', () => {
    const a0 = withWeeks(mkPilot('captain'), [0, 1, 2, 3].map((w) => ({ week: w, flightHours: 25 })));
    const b0 = mkPilot('first-officer');
    expect(isOnMandatoryRest(a0)).toBe(true);
    const [a, b] = accrueWeeklyFlyingHours([a0, b0], 40, '2026-03-09');
    expect(a.dutyHistory![a.dutyHistory!.length - 1].flightHours).toBe(0);
    expect(b.flightHours).toBeGreaterThan(0);
    expect(WEEKLY_DUTY_CAP_HOURS).toBeGreaterThan(weeklyRemainingFlightHours(mkPilot()));
  });
});

describe('sustainableWeeklyFlightHours — weekly EU-OSL proration', () => {
  it('is the tightest weekly proration of the caps (defaults: 12-month flight cap binds)', () => {
    // 900 h / 52 weeks ≈ 17.31 h — tighter than 100/4 = 25 h and the duty proration.
    expect(sustainableWeeklyFlightHours()).toBeCloseTo(FLIGHT_TIME_12MO_HOURS / 52, 5);
  });

  it('never exceeds a quarter of the 28-day flight cap or a 52nd of the 12-month cap', () => {
    const w = sustainableWeeklyFlightHours();
    expect(w).toBeLessThanOrEqual(FLIGHT_TIME_28D_HOURS / 4 + 1e-9);
    expect(w).toBeLessThanOrEqual(FLIGHT_TIME_12MO_HOURS / 52 + 1e-9);
    expect(w).toBeGreaterThan(0);
  });
});

describe('crewSetsRequired — rotating crew sets for a workload', () => {
  it('returns 0 for zero or negative workload', () => {
    expect(crewSetsRequired(0)).toBe(0);
    expect(crewSetsRequired(-12)).toBe(0);
  });

  it('returns 1 for any positive workload up to one person weekly share', () => {
    expect(crewSetsRequired(1)).toBe(1);
    expect(crewSetsRequired(sustainableWeeklyFlightHours())).toBe(1);
  });

  it('a 24 h route at 4×/week (96 cycle-h) needs multiple rotating sets', () => {
    // 96 / 17.31 ≈ 5.55 → 6 full sets
    expect(crewSetsRequired(24 * 4)).toBe(6);
  });

  it('scales with workload', () => {
    expect(crewSetsRequired(96 * 2)).toBe(12);
  });
});
