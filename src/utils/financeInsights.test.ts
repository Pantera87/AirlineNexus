import { describe, it, expect } from 'vitest';
import type { Airline, Aircraft, Loan, Route, StaffMember, WorldState } from '@/types/game';
import { AIRPORT_DATABASE } from '@/data/airports';
import { AIRCRAFT_DATABASE } from '@/data/aircraft';
import { checkLoopRange, getAircraftWeeklyFixedCosts } from './routeEngine';
import {
  WEEKS_PER_MONTH,
  computeExpenseBreakdown,
  computeIncomeBreakdown,
  computeOutlook,
  computeFinanceTips,
  type FinanceTip,
} from './financeInsights';

// --- Deterministic fixtures ---------------------------------------------------

const HUB = AIRPORT_DATABASE[0];
const TYPE = AIRCRAFT_DATABASE.find((t) => t.id === 'a380') ?? AIRCRAFT_DATABASE.find((t) => (t.range ?? 0) > 0)!;
const DEST = AIRPORT_DATABASE.find((a) => a.iata !== HUB.iata && checkLoopRange(TYPE, [HUB, a]).feasible)!;

function makeWorld(overrides: Partial<WorldState> = {}): WorldState {
  return {
    fuelPrice: 1.0,
    fuelPriceHistory: [],
    economicIndex: 70,
    travelDemand: 75,
    competitorAirlines: [],
    activeEvents: [],
    regulations: [],
    ...overrides,
  };
}

function makeAirline(overrides: Partial<Airline> = {}): Airline {
  return {
    id: 'al-1',
    name: 'Test Air',
    iataCode: 'TS',
    icaoCode: 'TST',
    headquarters: HUB.iata,
    founded: new Date(),
    businessModel: 'full-service',
    reputation: 50,
    rating: 3,
    alliance: null,
    fleet: [],
    routes: [],
    staff: [],
    finances: {
      cash: 1_000_000,
      totalRevenue: 0,
      totalExpenses: 0,
      profit: 0,
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      monthlyReports: [],
      loans: [],
      investments: [],
    },
    loyaltyProgram: { name: 'None', isActive: false, members: 0, tiers: [], partnerAirlines: [] },
    achievements: [],
    ...overrides,
  };
}

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'ac1',
    typeId: TYPE.id,
    registration: 'TEST-01',
    age: 2,
    condition: 90,
    status: 'available',
    currentLocation: HUB.iata,
    assignedRoute: null,
    totalFlightHours: 1000,
    lastMaintenance: new Date(),
    nextMaintenance: new Date(),
    liveries: [],
    currentLiveryIndex: 0,
    ...overrides,
  };
}

function makeStaff(role: StaffMember['role'] = 'engineer', salary = 50_000): StaffMember {
  return {
    id: 'st1',
    name: 'Test Staff',
    gender: 'male',
    photo: null,
    role,
    experience: 5,
    salary,
    performance: 80,
    assignedAircraft: null,
    assignedRoute: null,
    startDate: new Date(),
    morale: 80,
    flightHours: 0,
    typeRating: null,
    reducedWageUntil: null,
  };
}

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'r1',
    origin: HUB.iata,
    destination: DEST.iata,
    isActive: true,
    frequency: 1,
    aircraftId: TYPE.id,
    schedule: [],
    avgLoadFactor: 0.5,
    revenue: 100_000,
    cost: 80_000,
    profitability: 20_000,
    weeksActive: 10,
    ...overrides,
  };
}

const LOAN: Loan = {
  id: 'ln1',
  amount: 500_000,
  interestRate: 6,
  monthlyPayment: 10_000,
  remainingBalance: 100_000,
  startDate: new Date(),
  endDate: new Date(),
};

// --- computeExpenseBreakdown ---------------------------------------------------

describe('computeExpenseBreakdown', () => {
  it('returns zero categories for a bare airline', () => {
    const result = computeExpenseBreakdown(makeAirline(), makeWorld());
    expect(result.totalWeekly).toBe(0);
    expect(result.totalMonthly).toBe(0);
    expect(result.categories.every((c) => c.weeklyAmount === 0)).toBe(true);
  });

  it('adds fleet fixed costs per owned aircraft (with engineer-shortfall penalty)', () => {
    const result = computeExpenseBreakdown(makeAirline({ fleet: [makeAircraft()] }), makeWorld());
    const fleetFixed = result.categories.find((c) => c.key === 'fleet-fixed')!;
    // No engineers on staff (1 required for 1 aircraft) → 10% penalty on the base fixed cost
    expect(fleetFixed.weeklyAmount).toBe(Math.round(getAircraftWeeklyFixedCosts(TYPE) * 1.1));
  });

  it('converts monthly payroll into weekly/monthly amounts', () => {
    const result = computeExpenseBreakdown(makeAirline({ staff: [makeStaff('engineer', 100_000)] }), makeWorld());
    const payroll = result.categories.find((c) => c.key === 'payroll')!;
    expect(payroll.weeklyAmount).toBe(Math.round(100_000 / WEEKS_PER_MONTH));
    expect(payroll.monthlyAmount).toBe(100_000);
  });

  it('converts outstanding loan payments into weekly/monthly amounts', () => {
    const result = computeExpenseBreakdown(makeAirline({ finances: { ...makeAirline().finances, loans: [LOAN] } }), makeWorld());
    const loans = result.categories.find((c) => c.key === 'loans')!;
    expect(loans.weeklyAmount).toBe(Math.round(10_000 / WEEKS_PER_MONTH));
    expect(loans.monthlyAmount).toBe(10_000);
  });

  it('splits an active route\'s stored cost into fuel/fees/crew matching route.cost', () => {
    const airline = makeAirline({ routes: [makeRoute({ cost: 50_000 }), makeRoute({ id: 'r2', isActive: false, cost: 99_999 })] });
    const result = computeExpenseBreakdown(airline, makeWorld());
    const fuel = result.categories.find((c) => c.key === 'fuel')!.weeklyAmount;
    const fees = result.categories.find((c) => c.key === 'airport-fees')!.weeklyAmount;
    const crew = result.categories.find((c) => c.key === 'crew')!.weeklyAmount;
    expect(fuel).toBeGreaterThan(0);
    expect(fees).toBeGreaterThan(0);
    expect(crew).toBeGreaterThanOrEqual(0);
    // Inactive routes must be ignored; the active route's split must sum to its stored cost (± rounding)
    expect(fuel + fees + crew).toBeGreaterThan(49_990);
    expect(fuel + fees + crew).toBeLessThan(50_010);
  });

  it('includes all category keys in a stable order', () => {
    const result = computeExpenseBreakdown(makeAirline(), makeWorld());
    expect(result.categories.map((c) => c.key)).toEqual(['fuel', 'airport-fees', 'crew', 'fleet-fixed', 'payroll', 'loans']);
  });
});

// --- computeIncomeBreakdown ----------------------------------------------------

describe('computeIncomeBreakdown', () => {
  it('lists active routes by revenue, descending, with monthly totals', () => {
    const airline = makeAirline({
      routes: [
        makeRoute({ id: 'a', revenue: 40_000 }),
        makeRoute({ id: 'b', revenue: 100_000 }),
        makeRoute({ id: 'c', revenue: 999_999, isActive: false }),
      ],
    });
    const result = computeIncomeBreakdown(airline);
    expect(result.lines.map((l) => l.routeId)).toEqual(['b', 'a']);
    expect(result.totalWeekly).toBe(140_000);
    expect(result.totalMonthly).toBe(Math.round(140_000 * WEEKS_PER_MONTH));
    expect(result.lines[0].monthlyAmount).toBe(Math.round(100_000 * WEEKS_PER_MONTH));
  });

  it('returns empty for an airline without active routes', () => {
    const result = computeIncomeBreakdown(makeAirline());
    expect(result.lines).toEqual([]);
    expect(result.totalWeekly).toBe(0);
    expect(result.totalMonthly).toBe(0);
  });
});

// --- computeOutlook -------------------------------------------------------------

describe('computeOutlook', () => {
  it('projects a healthy outlook from a positive run-rate', () => {
    const airline = makeAirline({
      finances: { ...makeAirline().finances, cash: 500_000, weeklyPlan: { revenue: 100_000, costs: 60_000 } },
      staff: [makeStaff('engineer', 100_000)],
    });
    const result = computeOutlook(airline, makeWorld());
    expect(result.weeklyNet).toBe(40_000);
    expect(result.monthlyNet).toBe(Math.round(40_000 * WEEKS_PER_MONTH - 100_000));
    expect(result.runwayWeeks).toBeNull();
    expect(result.risk).toBe('healthy');
    expect(result.projections).toHaveLength(3);
    const unroundedMonthlyNet = 40_000 * WEEKS_PER_MONTH - 100_000; // projections use the un-rounded run-rate
    expect(result.projections[0].cash).toBe(Math.round(500_000 + unroundedMonthlyNet));
    expect(result.projections[2].cash).toBe(Math.round(500_000 + unroundedMonthlyNet * 3));
  });

  it('flags critical risk when cash is negative', () => {
    const airline = makeAirline({
      finances: { ...makeAirline().finances, cash: -10_000, weeklyPlan: { revenue: 0, costs: 0 } },
    });
    expect(computeOutlook(airline, makeWorld()).risk).toBe('critical');
  });

  it('flags critical risk when the runway is under 4 weeks and at-risk between 4-12', () => {
    const burning = { revenue: 0, costs: 10_000 } as const; // weeklyNet -10k → burn ≈ 10k/week
    const shortRunway = makeAirline({ finances: { ...makeAirline().finances, cash: 30_000, weeklyPlan: { ...burning } } });
    expect(computeOutlook(shortRunway, makeWorld()).risk).toBe('critical');
    const mediumRunway = makeAirline({ finances: { ...makeAirline().finances, cash: 80_000, weeklyPlan: { ...burning } } });
    expect(computeOutlook(mediumRunway, makeWorld()).risk).toBe('at-risk');
  });

  it('falls back to stable when cash flow is flat and the runway is long', () => {
    const airline = makeAirline({
      finances: { ...makeAirline().finances, cash: 10_000_000, weeklyPlan: { revenue: 100_000, costs: 85_000 } },
      staff: [makeStaff('engineer', 65_000)], // 100k - 65k ≈ 35k < 85k×4.33 → net ≈ 0 (not positive)
    });
    const result = computeOutlook(airline, makeWorld());
    // monthlyNet ≈ 15k×4.333 − 65k ≈ 0.0k → not > 0 → stable
    expect(result.monthlyNet).toBeLessThanOrEqual(0);
    expect(result.risk).toBe('stable');
  });

  it('measures the fuel trend over the last ~4 weekly points', () => {
    const world = makeWorld({
      fuelPriceHistory: [1.0, 1.02, 1.04, 1.06, 1.1].map((price, i) => ({ date: new Date(2026, 0, 5 + i * 7).toISOString(), price })),
    });
    expect(computeOutlook(makeAirline(), world).fuelTrendPct).toBeCloseTo(10, 5);
  });

  it('builds the chart series as history + dashed forecast tail', () => {
    const airline = makeAirline({
      finances: {
        ...makeAirline().finances,
        cash: 1_000_000,
        weeklyPlan: { revenue: 0, costs: 0 },
        history: [
          { date: '2026-01-05T00:00:00.000Z', cash: 900, revenue: 0, costs: 0 },
          { date: '2026-01-12T00:00:00.000Z', cash: 1_000_000, revenue: 0, costs: 0 },
        ],
      },
    });
    const series = computeOutlook(airline, makeWorld()).series;
    expect(series).toHaveLength(5); // 2 history + 3 projections
    expect(series[0].forecast).toBeNull();
    expect(series[1].cash).toBe(1_000_000);
    expect(series[1].forecast).toBe(1_000_000); // last actual point bridges into the forecast
    expect(series[2].label).toBe('+1mo');
    expect(series[2].cash).toBeNull();
    expect(series[2].forecast).toBe(1_000_000); // flat plan → flat projection
  });

  it('seeds the series with the current cash when no history exists yet', () => {
    const series = computeOutlook(makeAirline(), makeWorld()).series;
    expect(series).toHaveLength(4); // "Now" + 3 projections
    expect(series[0].label).toBe('Now');
    expect(series[0].cash).toBe(1_000_000);
    expect(series[0].forecast).toBe(1_000_000);
  });
});

// --- computeFinanceTips ----------------------------------------------------------

const SEVERITY_RANK: Record<FinanceTip['severity'], number> = { critical: 0, warning: 1, info: 2, positive: 3 };

describe('computeFinanceTips', () => {
  it('flags a negative cash balance as critical', () => {
    const airline = makeAirline({ finances: { ...makeAirline().finances, cash: -50_000 } });
    const tips = computeFinanceTips(airline, makeWorld(), computeExpenseBreakdown(airline, makeWorld()), computeOutlook(airline, makeWorld()));
    expect(tips[0].severity).toBe('critical');
    expect(tips[0].title).toMatch(/negative/);
  });

  it('flags a short cash runway while cash is still positive', () => {
    const airline = makeAirline({
      finances: { ...makeAirline().finances, cash: 20_000, weeklyPlan: { revenue: 0, costs: 20_000 } },
    });
    const tips = computeFinanceTips(airline, makeWorld(), computeExpenseBreakdown(airline, makeWorld()), computeOutlook(airline, makeWorld()));
    expect(tips[0].severity).toBe('critical');
    expect(tips[0].title).toMatch(/runway/i);
  });

  it('flags losing routes with their weekly loss', () => {
    const airline = makeAirline({
      routes: [makeRoute({ revenue: 100_000, cost: 125_000, profitability: -25_000 })],
      finances: { ...makeAirline().finances, weeklyPlan: { revenue: 100_000, costs: 125_000 } },
    });
    const tips = computeFinanceTips(airline, makeWorld(), computeExpenseBreakdown(airline, makeWorld()), computeOutlook(airline, makeWorld()));
    const tip = tips.find((t) => t.title.match(/losing money/i));
    expect(tip).toBeTruthy();
    expect(tip!.severity).toBe('warning'); // 25% of revenue — below the 30% critical threshold
    expect(tip!.detail).toMatch(/total loss/);
  });

  it('gives an all-clear when nothing is wrong', () => {
    const airline = makeAirline({
      reputation: 60,
      staff: [makeStaff('engineer', 5_000)],
      finances: { ...makeAirline().finances, cash: 1_000_000, weeklyPlan: { revenue: 100_000, costs: 50_000 } },
    });
    const world = makeWorld({ economicIndex: 70, travelDemand: 75 });
    const tips = computeFinanceTips(airline, world, computeExpenseBreakdown(airline, world), computeOutlook(airline, world));
    expect(tips).toHaveLength(1);
    expect(tips[0].severity).toBe('positive');
  });

  it('caps output at 8 tips, sorted by severity', () => {
    const world = makeWorld({
      travelDemand: 30,
      economicIndex: 40,
      fuelPriceHistory: [1.0, 1.02, 1.04, 1.06, 1.1].map((price, i) => ({ date: new Date(2026, 0, 5 + i * 7).toISOString(), price })),
    });
    const airline = makeAirline({
      reputation: 30,
      staff: [],
      fleet: [
        makeAircraft({ id: 'ac1', status: 'maintenance' }),
        makeAircraft({ id: 'ac2', status: 'maintenance' }),
        makeAircraft({ id: 'ac3', status: 'available' }),
      ],
      routes: [
        makeRoute({ id: 'a', revenue: 50_000, cost: 90_000, profitability: -40_000 }),
        makeRoute({ id: 'b', revenue: 30_000, cost: 55_000, profitability: -25_000, avgLoadFactor: 0.2, weeksActive: 6 }),
        makeRoute({ id: 'c', revenue: 20_000, cost: 40_000, profitability: -20_000, avgLoadFactor: 0.15, weeksActive: 8 }),
      ],
      finances: {
        ...makeAirline().finances,
        cash: -50_000,
        weeklyPlan: { revenue: 100_000, costs: 250_000 },
        loans: [LOAN],
      },
    });
    const tips = computeFinanceTips(airline, world, computeExpenseBreakdown(airline, world), computeOutlook(airline, world));
    expect(tips.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < tips.length; i += 1) {
      expect(SEVERITY_RANK[tips[i].severity]).toBeGreaterThanOrEqual(SEVERITY_RANK[tips[i - 1].severity]);
    }
    expect(tips[0].severity).toBe('critical');
    expect(tips.some((t) => t.severity === 'positive')).toBe(false);
  });
});