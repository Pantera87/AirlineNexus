import { describe, it, expect, beforeAll } from 'vitest';

// Memory-backed localStorage stub (must exist before the store module is imported,
// because zustand's persist middleware touches localStorage at module load).
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => void mem.clear(),
};

let useGameStore: typeof import('@/store/gameStore').useGameStore;

beforeAll(async () => {
  ({ useGameStore } = await import('@/store/gameStore'));
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // in-game milliseconds per week

function ensureGame() {
  const state = useGameStore.getState();
  if (!state.airline) {
    state.startGame({ name: 'Test Air', iataCode: 'TA', headquarters: 'JFK' });
  }
}

describe('real-time finance accrual (Phase 4b)', () => {
  it('stores a weekly plan when a route is created, without any lump-sum cash change', () => {
    ensureGame();
    if (useGameStore.getState().airline!.fleet.length === 0) {
      expect(useGameStore.getState().purchaseAircraft('embraer-175')).toBe(true);
    }

    const cashBefore = useGameStore.getState().airline!.finances.cash;
    const created = useGameStore.getState().createRoute({
      origin: 'JFK',
      destination: 'BOS',
      aircraftType: 'embraer-175',
      frequencyPerWeek: 7,
    });
    expect(created).toBe(true);

    const { finances } = useGameStore.getState().airline!;
    // The mid-week refresh must have computed a plan...
    expect(finances.weeklyPlan).toBeDefined();
    expect(finances.weeklyPlan!.revenue).toBeGreaterThan(0);
    expect(finances.weeklyPlan!.costs).toBeGreaterThan(0);
    // ...but no cash may have moved at creation time (the old batch bug).
    expect(finances.cash).toBe(cashBefore);
  });

  it('accrues cash proportionally to game time on each tick', () => {
    const before = useGameStore.getState().airline!.finances;
    const plan = before.weeklyPlan!;

    // One tick at "fast" speed is one in-game minute; simulate three consecutive ticks (3 game-minutes).
    const gameMsPerTick = WEEK_MS / 10080; // 60_000 ms — a week is 7 * 24 * 60 = 10080 minutes
    for (let i = 0; i < 3; i++) {
      useGameStore.getState().accrueFinances(gameMsPerTick);
    }

    const after = useGameStore.getState().airline!.finances;
    const expectedNet = plan.revenue - plan.costs;
    expect(after.cash - before.cash).toBeCloseTo((expectedNet * 3) / 10080, 4);
    expect(after.totalRevenue - before.totalRevenue).toBeCloseTo((plan.revenue * 3) / 10080, 4);
    expect(after.totalExpenses - before.totalExpenses).toBeCloseTo((plan.costs * 3) / 10080, 4);
    // The plan itself must not be altered by accrual.
    expect(after.weeklyPlan).toEqual(plan);
  });

  it('accrues exactly the weekly plan totals over a full in-game week', () => {
    const before = useGameStore.getState().airline!.finances;
    useGameStore.getState().accrueFinances(WEEK_MS);

    const after = useGameStore.getState().airline!.finances;
    expect(after.cash - before.cash).toBeCloseTo(before.weeklyPlan!.revenue - before.weeklyPlan!.costs, 4);
    expect(after.totalRevenue - before.totalRevenue).toBeCloseTo(before.weeklyPlan!.revenue, 4);
    expect(after.totalExpenses - before.totalExpenses).toBeCloseTo(before.weeklyPlan!.costs, 4);
  });

  it('advances the load-factor ramp only at real week boundaries, with no cash jump', () => {
    const route = useGameStore.getState().airline!.routes.find((r) => r.origin === 'JFK')!;
    // The mid-week refresh at creation must not have advanced the ramp.
    expect(route.weeksActive ?? 0).toBe(0);

    const cashBefore = useGameStore.getState().airline!.finances.cash;
    const result = useGameStore.getState().settleWeeklyRoutes(); // boundary: true by default
    const after = useGameStore.getState().airline!;

    expect(result).not.toBeNull();
    expect(after.routes.find((r) => r.origin === 'JFK')!.weeksActive).toBe(1);
    // The weekly boundary must no longer apply a lump sum — cash accrues per tick only.
    expect(after.finances.cash).toBe(cashBefore);
  });

  it('clears the plan when the last route is cancelled, stopping further accrual', () => {
    const airline = useGameStore.getState().airline!;
    const routeId = airline.routes.find((r) => r.origin === 'JFK')!.id;
    expect(useGameStore.getState().cancelRoute(routeId)).toBe(true);

    const before = useGameStore.getState().airline!.finances;
    expect(before.weeklyPlan).toEqual({ revenue: 0, costs: 0 });

    useGameStore.getState().accrueFinances(WEEK_MS / 2);
    expect(useGameStore.getState().airline!.finances.cash).toBe(before.cash);
  });
});
