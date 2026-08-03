import { describe, it, expect, vi } from 'vitest';
import { CompleteClockFix } from '../fixClockUsage';

describe('CompleteClockFix', () => {
  beforeEach(() => {
    // Mock performance.now to control time values
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with valid start times', () => {
    const clock = new CompleteClockFix();
    expect(clock).toBeDefined();
  });

  it('should return valid delta values', () => {
    const clock = new CompleteClockFix();
    
    // First call should return 0 (no previous time)
    const firstDelta = clock.getDelta();
    expect(firstDelta).toBeGreaterThanOrEqual(0);
    
    // Second call should return a positive value
    vi.advanceTimersByTime(1000); // Advance by 1 second
    const secondDelta = clock.getDelta();
    expect(secondDelta).toBeGreaterThan(0);
    expect(secondDelta).toBeLessThan(2); // Should be around 1 second
  });

  it('should handle invalid time values gracefully', () => {
    // This test would require mocking performance.now to return invalid values
    // For now, just ensure no crashes occur
    const clock = new CompleteClockFix();
    
    // Call multiple times to ensure stability
    for (let i = 0; i < 5; i++) {
      const delta = clock.getDelta();
      expect(typeof delta).toBe('number');
    }
  });

  it('should reset properly', () => {
    const clock = new CompleteClockFix();
    
    vi.advanceTimersByTime(1000);
    const firstDelta = clock.getDelta();
    
    clock.reset();
    
    // After reset, should start fresh
    const secondDelta = clock.getDelta();
    expect(secondDelta).toBeGreaterThanOrEqual(0);
  });

  it('should return elapsed time correctly', () => {
    const clock = new CompleteClockFix();
    
    vi.advanceTimersByTime(1000);
    const delta = clock.getDelta();
    
    const elapsedTime = clock.getElapsedTime();
    expect(elapsedTime).toBeGreaterThan(0);
  });
});