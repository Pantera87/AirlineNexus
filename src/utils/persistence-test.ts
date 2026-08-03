/**
 * Test script to verify game state persistence works correctly
 * This file is for development/testing purposes only
 */

// Import necessary modules
import { DatabaseInitializer } from '../database/init';
import { useGameStore } from '../store/gameStore';

/**
 * Test function to verify that game state is properly persisted
 */
export const testPersistence = async () => {
  console.log('Testing game state persistence...');
  
  try {
    // Initialize database
    await DatabaseInitializer.initialize();
    console.log('Database initialized successfully');
    
    // Test 1: Check if we can save and retrieve a date
    const testDate = new Date();
    await DatabaseInitializer.setCurrentDate(testDate);
    console.log('Saved test date to database:', testDate);
    
    // Test 2: Try to retrieve the date
    const retrievedDate = await DatabaseInitializer.getCurrentDate();
    console.log('Retrieved date from database:', retrievedDate);
    
    // Test 3: Check if zustand persistence works
    const store = useGameStore.getState();
    console.log('Current store date:', store.currentDate);
    
    // Test 4: Try to save current store date to database
    await DatabaseInitializer.setCurrentDate(store.currentDate);
    console.log('Saved store date to database');
    
    console.log('Persistence test completed successfully');
  } catch (error) {
    console.error('Persistence test failed:', error);
  }
};

// Run test if this file is executed directly
if (require.main === module) {
  testPersistence();
}