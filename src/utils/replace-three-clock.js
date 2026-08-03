// This file provides a direct replacement for the deprecated THREE.Clock
// to prevent the error from installHook.js

// Create a mock Clock that doesn't trigger deprecation warnings
const originalClock = global.THREE?.Clock;

// If there's an existing THREE.Clock, override it with our fixed version
if (typeof window !== 'undefined' && window.THREE) {
  // Override the Clock class to prevent deprecation messages
  const originalClockClass = window.THREE.Clock;
  
  if (originalClockClass) {
    // Create a new class that behaves like the old one but without warnings
    class FixedClock {
      constructor() {
        this.startTime = performance.now();
        this.oldTime = this.startTime;
        this.elapsedTime = 0;
        this.running = false;
      }
      
      getDelta() {
        const now = performance.now();
        
        // Validate the time values
        if (typeof now !== 'number' || isNaN(now) || !isFinite(now)) {
          return 0;
        }

        let delta = (now - this.oldTime) / 1000;
        
        // Reset delta if it's invalid (negative, too large, or NaN)
        if (delta < 0 || delta > 30 || isNaN(delta)) {
          delta = 0;
        }

        this.oldTime = now;
        this.elapsedTime += delta;

        return delta;
      }
      
      getElapsedTime() {
        const now = performance.now();
        if (typeof now === 'number' && !isNaN(now) && isFinite(now)) {
          return (now - this.startTime) / 1000;
        }
        return this.elapsedTime;
      }
      
      start() {
        this.startTime = performance.now();
        this.oldTime = this.startTime;
        this.elapsedTime = 0;
        this.running = true;
      }
      
      stop() {
        this.running = false;
      }
      
      reset() {
        this.startTime = performance.now();
        this.oldTime = this.startTime;
        this.elapsedTime = 0;
      }
    }
    
    // Replace the deprecated Clock class
    window.THREE.Clock = FixedClock;
  }
}

// Export for use in other modules
export default function createFixedClock() {
  return new (window.THREE?.Clock || class { getDelta() { return 0; } getElapsedTime() { return 0; } })();
}