import { useEffect, useRef } from 'react';
import { useGameStore } from '@store/gameStore';
import type { GameSpeed } from '@/types/game';

// Speed intervals in milliseconds (how often 1 in-game day advances)
const SPEED_INTERVALS: Record<GameSpeed, number> = {
  paused: 0,
  normal: 2000, // 1 day per 2 seconds
  fast: 1000, // 1 day per 1 second
  fastest: 500, // 1 day per 0.5 seconds
};

/**
 * Game loop hook that advances the in-game date based on the current game speed.
 * Should be used in a component that is always mounted while the game is active (e.g. Layout).
 */
export function useGameLoop() {
  const gameSpeed = useGameStore((state) => state.gameSpeed);
  const isPaused = useGameStore((state) => state.isPaused);
  const advanceDate = useGameStore((state) => state.advanceDate);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Don't run if paused or speed is paused
    if (isPaused || gameSpeed === 'paused') {
      return;
    }

    const interval = SPEED_INTERVALS[gameSpeed] || 2000;
    intervalRef.current = setInterval(() => {
      advanceDate(1);
    }, interval);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [gameSpeed, isPaused, advanceDate]);

  return { gameSpeed, isPaused };
}