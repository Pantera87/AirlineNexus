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

// --- Weekly route economics settlement (Phase 4b) ---
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ROUTE_ECON_WEEK_KEY = 'routeEconLastSettledWeek';
const MAX_CATCHUP_WEEKS = 52; // Cap catch-up settlements at one year

/**
 * Settles route economics for every in-game week boundary crossed since the
 * last settlement. The last settled epoch-week key is persisted to localStorage
 * so a page reload mid-week does not double-settle or skip a week (same pattern
 * as useUsedMarketTimer). On first run it only records the baseline and does
 * not charge for the partial current week.
 */
function settleWeeklyRoutesIfDue(currentDate: Date) {
  const currentWeekKey = Math.floor(currentDate.getTime() / WEEK_MS);

  // Read the raw string: Number(null) is 0, which would defeat the first-run
  // check and trigger a massive catch-up settlement on a fresh game.
  const storedWeekKey = localStorage.getItem(ROUTE_ECON_WEEK_KEY);
  if (storedWeekKey === null || !Number.isFinite(Number(storedWeekKey))) {
    // First run (or corrupted value): record baseline, no settlement yet.
    localStorage.setItem(ROUTE_ECON_WEEK_KEY, String(currentWeekKey));
    return;
  }
  const lastWeekKey = Number(storedWeekKey);

  let weeksToSettle = currentWeekKey - lastWeekKey;
  if (weeksToSettle <= 0) {
    // Game time went backwards (e.g. after a reset): re-baseline.
    localStorage.setItem(ROUTE_ECON_WEEK_KEY, String(currentWeekKey));
    return;
  }

  weeksToSettle = Math.min(weeksToSettle, MAX_CATCHUP_WEEKS);
  for (let i = 0; i < weeksToSettle; i++) {
    useGameStore.getState().settleWeeklyRoutes();
  }

  // Advance the stored key by what we actually settled so any remaining
  // catch-up continues on subsequent ticks.
  localStorage.setItem(ROUTE_ECON_WEEK_KEY, String(lastWeekKey + weeksToSettle));
}

// --- Monthly loan servicing (Phase 4c) ---
const LOAN_MONTH_KEY = 'loanServicingLastMonth';

/**
 * Processes monthly loan payments once per in-game month boundary crossed since the last tick.
 * The last processed month key is persisted to localStorage so a page reload does not
 * double-charge or skip a month (same pattern as settleWeeklyRoutesIfDue). On first run it
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

/**
 * Game loop hook that advances the in-game date and time based on the current game speed.
 * Should be used in a component that is always mounted while the game is active (e.g. Layout).
 * Also settles route economics once per in-game week boundary (Phase 4b).
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

        // Phase 4b: settle route economics for any in-game week boundary crossed this tick
        settleWeeklyRoutesIfDue(currentDate);

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
