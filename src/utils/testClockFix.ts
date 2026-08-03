/**
 * Simple test to verify the Clock fix is working correctly
 */
import { CompleteClockFix } from './fixClockUsage';

console.log('Testing Three.js Clock Fix...');

// Create a new clock instance
const clock = new CompleteClockFix();

try {
  // Test initial state
  console.log('Initial delta:', clock.getDelta());
  
  // Test after some time
  setTimeout(() => {
    const delta1 = clock.getDelta();
    console.log('After 100ms delta:', delta1);
    
    // Test elapsed time
    const elapsed = clock.getElapsedTime();
    console.log('Elapsed time:', elapsed.toFixed(3), 'seconds');
    
    // Test reset
    clock.reset();
    console.log('After reset, delta:', clock.getDelta());
    console.log('Test completed successfully!');
  }, 100);
  
} catch (error) {
  console.error('Clock test failed:', error);
}