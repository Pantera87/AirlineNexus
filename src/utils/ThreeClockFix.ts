/**
 * Fixed Clock implementation for THREE.js that handles invalid time values gracefully.
 * This is a replacement for the deprecated THREE.Clock class.
 */
export class ThreeClockFix {
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
   * Starts the clock
   */
  start(): void {
    this.startTime = performance.now();
    this.oldTime = this.startTime;
    this.elapsedTime = 0;
    this.running = true;
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
    const now = performance.now();
    
    // Validate the time values
    if (typeof now !== 'number' || isNaN(now) || !isFinite(now)) {
      return 0;
    }

    let delta = (now - this.oldTime) / 1000;
    
    // Reset delta if it's invalid (negative, too large, or NaN)
    if (delta < 0 || delta > 10 || isNaN(delta)) {
      delta = 0;
    }

    this.oldTime = now;
    this.elapsedTime += delta;

    return delta;
  }

  /**
   * Returns the total elapsed time in seconds since start()
   * @returns The elapsed time in seconds
   */
  getElapsedTime(): number {
    if (this.running) {
      const now = performance.now();
      if (typeof now === 'number' && !isNaN(now) && isFinite(now)) {
        return (now - this.startTime) / 1000;
      }
    }
    return this.elapsedTime;
  }

  /**
   * Resets the clock to zero
   */
  reset(): void {
    this.startTime = performance.now();
    this.oldTime = this.startTime;
    this.elapsedTime = 0;
  }
}