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

/**
 * Game loop hook that advances the in-game date and time based on the current game speed.
 * Should be used in a component that is always mounted while the game is active (e.g. Layout).
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
