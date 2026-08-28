import { describe, it, expect, beforeAll } from 'vitest';

// Memory-backed localStorage stub (must exist before the store module is imported,
// because zustand persist touches window.localStorage at module load). vitest runs
// in a node environment without `window`, so point it at globalThis to mirror a
// browser; zustand's default storage is createJSONStorage(() => window.localStorage).
const mem = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => void mem.clear(),
};
(globalThis as any).localStorage = localStorageStub;
(globalThis as any).window = globalThis;

let revivePersistedDates: typeof import('@/store/gameStore').revivePersistedDates;
let useGameStore: typeof import('@/store/gameStore').useGameStore;

beforeAll(async () => {
  // Seed a "legacy" save the way zustand persist wrote it: Dates JSON-stringified.
  mem.set(
    'airline-sim-storage',
    JSON.stringify({
      state: { currentDate: DATE_A, airline: { founded: DATE_B }, world: { activeEvents: [], regulations: [] } },
      version: 0,
    })
  );
  ({ revivePersistedDates, useGameStore } = await import('@/store/gameStore'));
});

const DATE_A = '2024-06-15T08:30:00.000Z';
const DATE_B = '2025-01-02T00:00:00.000Z';

/** Builds a minimally-populated persisted-state fixture with ISO-string dates. */
function makeStringDatedState() {
  return {
    currentDate: DATE_A,
    airline: {
      founded: DATE_B,
      staff: [
        { id: 's1', name: 'A', startDate: DATE_B, reducedWageUntil: null, morale: 80, performance: 70 },
      ],
      fleet: [{ id: 'f1', registration: 'N100AA', lastMaintenance: DATE_B, nextMaintenance: DATE_A }],
      finances: {
        cash: 1_000_000,
        monthlyReports: [{ month: DATE_B }],
        loans: [{ id: 'l1', startDate: DATE_B, endDate: DATE_A }],
        investments: [{ id: 'i1', dateAcquired: DATE_B }],
        // String-typed by design — must survive revival untouched.
        history: [{ date: '2025-01-01T00:00:00.000Z', cash: 0, revenue: 0, costs: 0 }],
      },
    },
    world: {
      fuelPrice: 0.1,
      fuelPriceHistory: [{ date: '2024-12-30T00:00:00.000Z', price: 0.1 }],
      regulations: [{ id: 'r1', effectiveDate: DATE_B }],
      activeEvents: [{ id: 'e1', date: DATE_A }],
    },
  } as unknown as Parameters<typeof revivePersistedDates>[0];
}

describe('revivePersistedDates', () => {
  it('revives currentDate from an ISO string to a working Date', () => {
    const state = makeStringDatedState();
    revivePersistedDates(state);
    expect(state.currentDate).toBeInstanceOf(Date);
    expect((state.currentDate as Date).getTime()).toBe(Date.parse(DATE_A));
  });

  it('revives airline-level Date fields (founded, staff startDates, maintenance dates)', () => {
    const state = makeStringDatedState();
    revivePersistedDates(state);
    const airline = state.airline!;
    expect(airline.founded).toBeInstanceOf(Date);
    expect(airline.staff[0].startDate).toBeInstanceOf(Date);
    expect((airline.staff[0].startDate as Date).getTime()).toBe(Date.parse(DATE_B));
    expect(airline.fleet[0].lastMaintenance).toBeInstanceOf(Date);
    expect(airline.fleet[0].nextMaintenance).toBeInstanceOf(Date);
  });

  it('revives finance Date fields (report months, loan dates, investment dates)', () => {
    const state = makeStringDatedState();
    revivePersistedDates(state);
    const finances = state.airline!.finances;
    expect(finances.monthlyReports[0].month).toBeInstanceOf(Date);
    expect((finances.monthlyReports[0].month as Date).getTime()).toBe(Date.parse(DATE_B));
    expect(finances.loans[0].startDate).toBeInstanceOf(Date);
    expect(finances.loans[0].endDate).toBeInstanceOf(Date);
    expect(finances.investments[0].dateAcquired).toBeInstanceOf(Date);
  });

  it('revives world Date fields (regulation dates, event dates)', () => {
    const state = makeStringDatedState();
    revivePersistedDates(state);
    expect(state.world!.regulations[0].effectiveDate).toBeInstanceOf(Date);
    expect(state.world!.activeEvents[0].date).toBeInstanceOf(Date);
    expect((state.world!.activeEvents[0].date as Date).getTime()).toBe(Date.parse(DATE_A));
  });

  it('leaves string-typed dates and numeric timestamps untouched', () => {
    const state = makeStringDatedState();
    const historyDate = state.airline!.finances.history![0].date;
    const fuelDate = state.world!.fuelPriceHistory[0].date;
    revivePersistedDates(state);
    expect(state.airline!.finances.history![0].date).toBe(historyDate);
    expect(typeof state.airline!.finances.history![0].date).toBe('string');
    expect(state.world!.fuelPriceHistory[0].date).toBe(fuelDate);
    expect(state.airline!.staff[0].reducedWageUntil).toBeNull();
  });

  it('keeps fields that are already real Dates unchanged', () => {
    const existing = new Date(2024, 5, 15, 8, 30);
    const state = makeStringDatedState();
    state.currentDate = existing;
    state.airline!.staff[0].startDate = existing;
    revivePersistedDates(state);
    expect(state.currentDate).toBe(existing);
    expect(state.airline!.staff[0].startDate).toBe(existing);
  });
});

describe('persist rehydration (integration)', () => {
  it('restores currentDate as a working Date from a saved game', () => {
    const currentDate = useGameStore.getState().currentDate;
    expect(currentDate).toBeInstanceOf(Date);
    expect(currentDate.getTime()).toBe(Date.parse(DATE_A));
    // The exact call that crashed in StaffScreen (reduced-wage check).
    expect(() => currentDate.getTime()).not.toThrow();
  });
});