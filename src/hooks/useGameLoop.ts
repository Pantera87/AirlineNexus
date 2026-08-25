import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@store/gameStore';
import type { GameSpeed } from '@/types/game';
import { GameTimeEngine } from '@/utils/gameTimeEngine';

// Speed intervals in milliseconds (how often time advances)
const SPEED_INTERVALS: Record<GameSpeed, number> = {
  paused: 0,
  normal: 1000, // 1 game second per 1 second real time
  fast: 1000, // 1 game minute per 1 second real time (60x faster)
  fastest: 1000, // 1 game hour per 1 second real time (3600x faster)
};

// In-game milliseconds that elapse per tick — mirrors GameTimeEngine.advanceTimeBySpeed.
const GAME_MS_PER_TICK: Record<GameSpeed, number> = {
  paused: 0,
  normal: 1_000, // one game second
  fast: 60_000, // one game minute
  fastest: 3_600_000, // one game hour
};

// --- Weekly operations plan refresh (Phase 4b) ---
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ROUTE_ECON_WEEK_KEY = 'routeEconLastSettledWeek';

/**
 * Refreshes the weekly operations plan once per in-game week boundary. Cash is already
 * streaming continuously via accrueFinances(), so there is no catch-up batch to apply —
 * crossing a boundary just recomputes the plan (fresh fuel price + one ramp-up step).
 * The last refreshed epoch-week key is persisted to localStorage so a page reload does
 * not double-refresh or skip a boundary. On first run it only records the baseline.
 */
function refreshWeeklyPlanIfDue(currentDate: Date) {
  const currentWeekKey = Math.floor(currentDate.getTime() / WEEK_MS);

  // Read the raw string: Number(null) is 0, which would defeat the first-run
  // check and trigger a spurious settlement on a fresh game.
  const storedWeekKey = localStorage.getItem(ROUTE_ECON_WEEK_KEY);
  if (storedWeekKey === null || !Number.isFinite(Number(storedWeekKey))) {
    // First run (or corrupted value): record baseline, no settlement yet.
    localStorage.setItem(ROUTE_ECON_WEEK_KEY, String(currentWeekKey));
    return;
  }
  const lastWeekKey = Number(storedWeekKey);

  if (currentWeekKey <= lastWeekKey) {
    // No boundary crossed yet — or game time went backwards (e.g. after a reset).
    localStorage.setItem(ROUTE_ECON_WEEK_KEY, String(currentWeekKey));
    return;
  }

  useGameStore.getState().settleWeeklyRoutes();
  localStorage.setItem(ROUTE_ECON_WEEK_KEY, String(currentWeekKey));
}

// --- Monthly loan servicing (Phase 4c) ---
const LOAN_MONTH_KEY = 'loanServicingLastMonth';

/**
 * Processes monthly loan payments once per in-game month boundary crossed since the last tick.
 * The last processed month key is persisted to localStorage so a page reload does not
 * double-charge or skip a month (same pattern as refreshWeeklyPlanIfDue). On first run it
 * only records the baseline and does not charge for the partial current month. Only one
 * payment is applied per boundary crossing, even after long absences, to avoid draining cash.
 */
function settleMonthlyLoansIfDue(currentDate: Date) {
  const currentMonthKey = currentDate.getFullYear() * 12 + currentDate.getMonth();

  // Read the raw string: Number(null) is 0, which would defeat the first-run
  // check and charge a loan payment immediately on a fresh game.
  const storedMonthKey = localStorage.getItem(LOAN_MONTH_KEY);
  if (storedMonthKey === null || !Number.isFinite(Number(storedMonthKey))) {
    // First run (or corrupted value): record baseline, no payment yet.
    localStorage.setItem(LOAN_MONTH_KEY, String(currentMonthKey));
    return;
  }
  const lastMonthKey = Number(storedMonthKey);

  if (currentMonthKey > lastMonthKey) {
    useGameStore.getState().settleMonthlyLoans();
    localStorage.setItem(LOAN_MONTH_KEY, String(currentMonthKey));
  } else if (currentMonthKey < lastMonthKey) {
    // Game time went backwards (e.g. after a reset): re-baseline.
    localStorage.setItem(LOAN_MONTH_KEY, String(currentMonthKey));
  }
}

// --- Fleet dispatch (automatic per-type aircraft-to-route assignment) ---
const DAY_MS = WEEK_MS / 7;
const FLEET_DISPATCH_DAY_KEY = 'fleetDispatchLastDay';

/**
 * Re-runs the automatic fleet dispatch once per in-game day boundary: airframes are
 * assigned to routes from the shared per-type pool, surplus/stale assignments return
 * to the hub, and one-time positioning costs are charged when an aircraft must be
 * deadheaded back. The last dispatched day key is persisted so a page reload does not
 * double-dispatch (same pattern as the weekly/monthly hooks above). On first run it
 * also dispatches — existing saves predate the dispatcher and need an initial assignment,
 * while fresh games have no routes yet, making it a harmless no-op.
 */
function dispatchFleetIfDue(currentDate: Date) {
  const currentDayKey = Math.floor(currentDate.getTime() / DAY_MS);

  const storedDayKey = localStorage.getItem(FLEET_DISPATCH_DAY_KEY);
  if (storedDayKey === null || !Number.isFinite(Number(storedDayKey))) {
    // First run (or corrupted value): run an initial dispatch, then record the baseline.
    useGameStore.getState().dispatchFleet();
    localStorage.setItem(FLEET_DISPATCH_DAY_KEY, String(currentDayKey));
    return;
  }
  const lastDayKey = Number(storedDayKey);

  if (currentDayKey > lastDayKey) {
    // Day boundary crossed — one dispatch per crossing (even after long absences).
    useGameStore.getState().dispatchFleet();
    localStorage.setItem(FLEET_DISPATCH_DAY_KEY, String(currentDayKey));
  } else if (currentDayKey < lastDayKey) {
    // Game time went backwards (e.g. after a reset): re-baseline without dispatching.
    localStorage.setItem(FLEET_DISPATCH_DAY_KEY, String(currentDayKey));
  }
}

/**
 * Game loop hook that advances the in-game date and time based on the current game speed.
 * Should be used in a component that is always mounted while the game is active (e.g. Layout).
 * Also accrues finances continuously every tick (Phase 4b) and refreshes the weekly
 * operations plan once per in-game week boundary; monthly loan payments are still
 * settled at month boundaries (Phase 4c).
 */
export function useGameLoop() {
  const gameSpeed = useGameStore((state) => state.gameSpeed);
  const isPaused = useGameStore((state) => state.isPaused);
  const setCurrentDate = useGameStore((state) => state.setCurrentDate);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize the time engine from database
  const [gameTimeEngine, setGameTimeEngine] = useState<GameTimeEngine | null>(null);
  const gameTimeEngineRef = useRef<GameTimeEngine | null>(null);

  useEffect(() => {
    const initializeTimeEngine = async () => {
      try {
        const engine = await GameTimeEngine.initializeFromDatabase();
        setGameTimeEngine(engine);
        gameTimeEngineRef.current = engine;
      } catch (error) {
        console.error('Failed to initialize time engine:', error);
        // Fallback to default
        const fallback = new GameTimeEngine();
        setGameTimeEngine(fallback);
        gameTimeEngineRef.current = fallback;
      }
    };

    initializeTimeEngine();

    return () => {
      if (gameTimeEngineRef.current) {
        gameTimeEngineRef.current.saveToDatabase();
      }
    };
  }, []);

    useEffect(() => {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Don't run if paused or speed is paused, or if time engine isn't initialized yet
      if (isPaused || gameSpeed === 'paused' || !gameTimeEngine) {
        return;
      }

      const interval = SPEED_INTERVALS[gameSpeed] || 1000;
      intervalRef.current = setInterval(async () => {
        // Advance time based on the speed using our new time engine
        gameTimeEngine.advanceTimeBySpeed(gameSpeed);
        const currentDate = await gameTimeEngine.saveAndGetCurrentDate();
        setCurrentDate(currentDate);

        // Phase 4b (real-time): accrue cash continuously for this tick's game time so
        // finances move as days pass instead of jumping at week boundaries.
        useGameStore.getState().accrueFinances(GAME_MS_PER_TICK[gameSpeed]);

        // Fleet dispatch: re-evaluate aircraft-to-route assignments once per in-game day.
        dispatchFleetIfDue(currentDate);

        // Phase 4b: refresh the weekly operations plan when an in-game week boundary is crossed
        refreshWeeklyPlanIfDue(currentDate);

        // Phase 4c: process monthly loan payments when an in-game month boundary is crossed
        settleMonthlyLoansIfDue(currentDate);
      }, interval);

      // Cleanup on unmount or when dependencies change
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [gameSpeed, isPaused, setCurrentDate, gameTimeEngine]);

  return { gameSpeed, isPaused };
}
