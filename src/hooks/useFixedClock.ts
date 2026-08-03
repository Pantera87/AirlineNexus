import { useEffect, useRef } from 'react';
import { CompleteClockFix } from '@/utils/fixClockUsage';

/**
 * Custom hook for time management that avoids THREE.Clock deprecation issues
 */
export function useFixedClock() {
  const clockRef = useRef<CompleteClockFix | null>(null);
  
  if (!clockRef.current) {
    clockRef.current = new CompleteClockFix();
  }
  
  return clockRef.current;
}

/**
 * React Three Fiber compatible hook that provides time delta for animation
 */
export function useFixedDelta() {
  const clock = useFixedClock();
  
  // This returns the safe delta value without any THREE.Clock dependencies
  return () => {
    return clock.getDelta();
  };
}