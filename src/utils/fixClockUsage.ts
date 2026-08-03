/**
 * Comprehensive Clock Fix Implementation for Three.js Applications
 * This file provides robust alternatives to deprecated THREE.Clock
 */

/**
 * Fixed implementation that handles invalid time values gracefully
 */
export class CompleteClockFix {
  private startTime: number;
  private oldTime: number;
  private elapsedTime: number;
  private running: boolean;
  private errorCount: number;
  private maxErrors: number;

  constructor() {
    this.startTime = performance.now();
    this.oldTime = this.startTime;
    this.elapsedTime = 0;
    this.running = false;
    this.errorCount = 0;
    this.maxErrors = 100; // Prevent infinite error loops
  }

  /**
   * Starts the clock
   */
  start(): void {
    this.startTime = performance.now();
    this.oldTime = this.startTime;
    this.elapsedTime = 0;
    this.running = true;
    this.errorCount = 0; // Reset errors on start
  }

  /**
   * Stops the clock
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Returns the elapsed time in seconds since the last call to getDelta()
   * @returns The delta time in seconds, or 0 if invalid
   */
  getDelta(): number {
    try {
      const now = performance.now();
      
      // Validate the time values
      if (typeof now !== 'number' || isNaN(now) || !isFinite(now)) {
        this.errorCount++;
        if (this.errorCount > this.maxErrors) {
          console.warn('Clock error limit reached, resetting clock');
          this.reset();
        }
        return 0;
      }

      let delta = (now - this.oldTime) / 1000;
      
      // Reset delta if it's invalid (negative, too large, or NaN)
      if (delta < 0 || delta > 30 || isNaN(delta)) {
        // Large time jumps (more than 30 seconds) are likely due to tab switching
        if (delta > 30) {
          console.warn('Large time jump detected, resetting clock');
          this.reset();
          return 0;
        }
        delta = 0;
      }

      this.oldTime = now;
      this.elapsedTime += delta;

      // Reset error count on successful call
      this.errorCount = Math.max(0, this.errorCount - 1);
      
      return delta;
    } catch (error) {
      this.errorCount++;
      console.warn('Clock error occurred:', error);
      if (this.errorCount > this.maxErrors) {
        console.error('Too many clock errors, resetting');
        this.reset();
      }
      return 0;
    }
  }

  /**
   * Returns the total elapsed time in seconds since start()
   * @returns The elapsed time in seconds
   */
  getElapsedTime(): number {
    try {
      if (this.running) {
        const now = performance.now();
        if (typeof now === 'number' && !isNaN(now) && isFinite(now)) {
          return (now - this.startTime) / 1000;
        }
      }
      return this.elapsedTime;
    } catch (error) {
      console.warn('Error getting elapsed time:', error);
      return this.elapsedTime;
    }
  }

  /**
   * Resets the clock to zero
   */
  reset(): void {
    this.startTime = performance.now();
    this.oldTime = this.startTime;
    this.elapsedTime = 0;
    this.errorCount = 0;
  }

  /**
   * Gets current error status for debugging
   */
  getErrorStatus(): { count: number; max: number } {
    return {
      count: this.errorCount,
      max: this.maxErrors
    };
  }
}

/**
 * Robust Clock specifically designed for React Three Fiber components
 */
export class ReactThreeClock {
  private startTime: number;
  private oldTime: number;
  private elapsedTime: number;
  private running: boolean;

  constructor() {
    this.startTime = performance.now();
    this.oldTime = this.startTime;
    this.elapsedTime = 0;
    this.running = false;
  }

  /**
   * Get delta time for animation frame
   * @returns Delta in seconds, or 0 if invalid
   */
  getDelta(): number {
    const now = performance.now();
    
    // Validate
    if (typeof now !== 'number' || isNaN(now) || !isFinite(now)) {
      return 0;
    }

    let delta = (now - this.oldTime) / 1000;
    
    // Handle invalid deltas
    if (delta < 0 || delta > 10 || isNaN(delta)) {
      delta = 0;
    }

    this.oldTime = now;
    this.elapsedTime += delta;

    return delta;
  }

  /**
   * Get total elapsed time
   */
  getElapsedTime(): number {
    const now = performance.now();
    if (typeof now === 'number' && !isNaN(now) && isFinite(now)) {
      return (now - this.startTime) / 1000;
    }
    return this.elapsedTime;
  }

  /**
   * Reset the clock
   */
  reset(): void {
    this.startTime = performance.now();
    this.oldTime = this.startTime;
    this.elapsedTime = 0;
  }
}

/**
 * Helper function to create a safe animation loop
 */
export function safeAnimationLoop(
  callback: (delta: number, timestamp?: number) => void,
  options: { autoStart?: boolean; maxErrorCount?: number } = {}
): { start: () => void; stop: () => void; isActive: boolean } {
  const { autoStart = true, maxErrorCount = 5 } = options;
  
  let animationId: number | null = null;
  let errorCount = 0;
  let isActive = false;

  function loop(timestamp?: number) {
    try {
      if (errorCount > maxErrorCount) {
        console.warn('Animation loop stopped due to too many errors');
        stop();
        return;
      }

      const clock = new CompleteClockFix();
      const delta = clock.getDelta();
      
      if (delta >= 0) {
        callback(delta, timestamp);
        errorCount = Math.max(0, errorCount - 1); // Reduce error count on success
      } else {
        errorCount++;
      }
      
      animationId = requestAnimationFrame(loop);
    } catch (error) {
      errorCount++;
      console.error('Animation loop error:', error);
      if (errorCount < maxErrorCount) {
        animationId = requestAnimationFrame(loop);
      } else {
        console.error('Too many errors, stopping animation');
        stop();
      }
    }
  }

  function start() {
    if (!isActive) {
      isActive = true;
      animationId = requestAnimationFrame(loop);
    }
  }

  function stop() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
      isActive = false;
    }
  }

  if (autoStart) {
    start();
  }

  return {
    start,
    stop,
    isActive
  };
}

// Export a default clock instance for easy use in components
export const defaultClock = new CompleteClockFix();

// Export the complete fix as default export for easy migration
export default CompleteClockFix;