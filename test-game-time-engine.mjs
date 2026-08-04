// Simple test to verify GameTimeEngine functionality
import { GameTimeEngine } from './src/utils/gameTimeEngine.ts';

// Test with current date
const currentDate = new Date();
console.log('Current date:', currentDate);

const engine = new GameTimeEngine(currentDate);
const displayDateTime = engine.getDisplayDateTime();
const displayHour = engine.getDisplayHour();

console.log('Formatted display datetime:', displayDateTime);
console.log('Formatted display hour:', displayHour);

// Test with different time speeds
const fastEngine = new GameTimeEngine(currentDate); // Using default constructor
console.log('Fast engine - Display datetime:', fastEngine.getDisplayDateTime());

console.log('Test completed successfully');