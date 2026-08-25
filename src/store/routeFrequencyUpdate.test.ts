import { describe, it, expect, beforeAll } from 'vitest';
import { maxLoopFrequencyPerWeek, maxLoopCyclesPerDay, getRoutePath } from '@/utils/routeEngine';
import { AIRPORT_DATABASE } from '@/data/airports';
import { AIRCRAFT_DATABASE } from '@/data/aircraft';

// Memory-backed localStorage stub (must exist before the store module is imported).
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

describe('route frequency saves (manage route modal → updateRoute)', () => {
  it('maxLoopFrequencyPerWeek returns a WEEKLY cap, not cycles/day', () => {
    const path = getRoutePath({ origin: 'JFK', destination: 'LHR' }).map(
      (i) => AIRPORT_DATABASE.find((a) => a.iata === i)!
    );
    const a380 = AIRCRAFT_DATABASE.find((a) => a.id === 'a380')!;
    // Long-haul JFK-LHR on an A380 is ~1 loop/day → weekly cap of 7 (not "1").
    expect(maxLoopCyclesPerDay(path, a380)).toBe(1);
    expect(maxLoopFrequencyPerWeek(path, a380)).toBe(7);
  });

  it('persists frequency changes exactly like the modal does', () => {
    let s = useGameStore.getState();
    if (!s.airline) {
      s.startGame({ name: 'Test Air', iataCode: 'TA', headquarters: 'JFK' });
    }
    s = useGameStore.getState();
    if (s.airline!.fleet.length === 0) {
      expect(s.purchaseAircraft('embraer-175')).toBe(true);
    }

    // Creation keeps the requested 2x/day (14/wk) on a short-haul loop.
    const created = s.createRoute({ origin: 'JFK', destination: 'BOS', aircraftType: 'embraer-175', frequencyPerWeek: 14 });
    expect(created).toBe(true);
    const route0 = useGameStore.getState().airline!.routes.find((r) => r.destination === 'BOS')!;
    expect(route0.frequency).toBe(14);

    // Same-aircraft + new frequency (what onSave sends when the type is unchanged).
    let ok = useGameStore.getState().updateRoute(route0.id, { frequency: 7, aircraftType: 'embraer-175' });
    expect(ok).toBe(true);
    expect(useGameStore.getState().airline!.routes.find((r) => r.id === route0.id)!.frequency).toBe(7);

    // A frequency-only save of the max weekly value must survive (previously it was
    // clamped down to raw cycles/day and appeared to "do nothing").
    ok = useGameStore.getState().updateRoute(route0.id, { frequency: 28 });
    expect(ok).toBe(true);
    expect(useGameStore.getState().airline!.routes.find((r) => r.id === route0.id)!.frequency).toBe(28);

    // Pause/resume path still works.
    ok = useGameStore.getState().updateRoute(route0.id, { isActive: false });
    expect(ok).toBe(true);
    expect(useGameStore.getState().airline!.routes.find((r) => r.id === route0.id)!.isActive).toBe(false);

    // Out-of-range frequency is rejected explicitly.
    ok = useGameStore.getState().updateRoute(route0.id, { frequency: 99 });
    expect(ok).toBe(false);
  });
});
