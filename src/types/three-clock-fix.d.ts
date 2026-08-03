/**
 * TypeScript declarations for the fixed Clock implementation
 * This helps with type checking and avoids conflicts with deprecated THREE.Clock
 */

declare module 'three' {
  // This is a workaround to prevent importing deprecated Clock from Three.js
  // When using our replacement, these are not needed
  interface Clock {
    getDelta(): number;
    getElapsedTime(): number;
  }
}

// Define our custom clock types
export class ThreeClockFix {
  constructor();
  start(): void;
  stop(): void;
  getDelta(): number;
  getElapsedTime(): number;
  reset(): void;
}

export class CompleteClockFix {
  constructor();
  start(): void;
  stop(): void;
  getDelta(): number;
  getElapsedTime(): number;
  reset(): void;
  getErrorStatus(): { count: number; max: number };
}

export class ReactThreeClock {
  constructor();
  getDelta(): number;
  getElapsedTime(): number;
  reset(): void;
}

export function safeAnimationLoop(
  callback: (delta: number, timestamp?: number) => void,
  options?: { autoStart?: boolean; maxErrorCount?: number }
): { start: () => void; stop: () => void; isActive: boolean };

export const defaultClock: CompleteClockFix;