# THREE.js Time Handling Fix

## Problem: "three.time invalid date" Error

The error "three.time invalid date" typically occurs when:

1. Using the deprecated `Clock` class incorrectly
2. Trying to access a non-existent `three.time` function
3. Incorrectly handling time values in animation loops
4. Using `performance.now()` without proper handling

## Root Cause

In THREE.js version 183+, the `Clock` class was deprecated and replaced with `Timer`. The old `Clock` class used `performance.now()` but had issues with time calculation and could produce invalid dates in certain edge cases.

## Solution

Replace deprecated time handling with the modern `Timer` class:

### 1. Basic Usage

```javascript
import { timeManager } from './timeUtils.js';

// Initialize
timeManager.init();

function animate() {
    // Update timer with timestamp
    timeManager.update();
    
    // Get time delta (seconds)
    const delta = timeManager.getDelta();
    
    // Get elapsed time (seconds)
    const elapsed = timeManager.getElapsed();
    
    // Your animation code here
    // ...
    
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
```

### 2. Alternative: Using the Clock Replacement

```javascript
import { ClockReplacement } from './fixDeprecatedClock.js';

// This provides backward compatibility
const clock = new ClockReplacement(true); // autoStart = true

function animate() {
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    
    // Your animation code here
    // ...
    
    requestAnimationFrame(animate);
}
```

### 3. Manual Time Handling (for simple cases)

```javascript
let lastTime = 0;

function animate() {
    const currentTime = performance.now() / 1000;
    const delta = currentTime - lastTime;
    lastTime = currentTime;
    
    // Your animation code here
    // ...
    
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
```

## Key Improvements

- **Consistent timing**: `Timer` provides more reliable time calculations
- **Page Visibility API support**: Prevents large time jumps when tab is inactive
- **Better error handling**: No more invalid date errors
- **Modern API**: Uses `performance.now()` correctly
- **Timescale control**: Ability to slow down or speed up time

## Migration Steps

1. Replace `import { Clock } from 'three'` with `import { Timer } from 'three'`
2. Replace `new Clock()` with `new Timer()`
3. Replace `clock.getDelta()` with `timer.getDelta()`
4. Replace `clock.getElapsedTime()` with `timer.getElapsed()`
5. Add `timer.update()` call in your animation loop before getting time values

## Best Practices

1. Always call `timer.update()` once per frame with the timestamp from `requestAnimationFrame`
2. Use `timer.getDelta()` for frame-rate independent animations
3. Use `timer.getElapsed()` for total elapsed time tracking
4. Connect to document for visibility handling: `timer.connect(document)`
5. Reset or dispose of timers when no longer needed

This solution eliminates the "invalid date" error and provides a more robust time handling system for THREE.js applications.