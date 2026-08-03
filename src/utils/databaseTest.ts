// Test file to verify database persistence is working correctly
import { DatabaseInitializer } from '@/database/init';
import { useGameStore } from '@/store/gameStore';

/**
 * Test database persistence functionality
 */
export const testDatabasePersistence = async () => {
  try {
    console.log('=== Testing Database Persistence ===');
    
    // Initialize database
    await DatabaseInitializer.initialize();
    console.log('✓ Database initialized');
    
    // Get current date from database
    const currentDate = await DatabaseInitializer.getCurrentDate();
    console.log('✓ Current date from database:', currentDate);
    
    // Set a test date
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 10); // 10 days in the future
    await DatabaseInitializer.setCurrentDate(testDate);
    console.log('✓ Test date set in database:', testDate);
    
    // Get the date back
    const retrievedDate = await DatabaseInitializer.getCurrentDate();
    console.log('✓ Retrieved date from database:', retrievedDate);
    
    // Verify it matches
    if (retrievedDate && retrievedDate.getTime() === testDate.getTime()) {
      console.log('✓ Date persistence test PASSED');
    } else {
      console.log('✗ Date persistence test FAILED');
    }
    
    // Test with store
    const store = useGameStore.getState();
    console.log('✓ Store state retrieved');
    
    // Try to set date through store
    await store.setCurrentDate(testDate);
    console.log('✓ Date set through store');
    
    // Try to get it back
    const storeDate = store.currentDate;
    console.log('✓ Store date:', storeDate);
    
    console.log('=== Database Persistence Test Complete ===');
  } catch (error) {
    console.error('Database persistence test failed:', error);
  }
};

/**
 * Debug function to check what's in localStorage vs database
 */
export const debugPersistence = async () => {
  console.log('=== Debugging Persistence ===');
  
  // Check localStorage
  console.log('localStorage items:');
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      console.log(`  ${key}: ${localStorage.getItem(key)}`);
    }
  }
  
  // Check database
  try {
    const date = await DatabaseInitializer.getCurrentDate();
    console.log('Database date:', date);
  } catch (error) {
    console.error('Error getting database date:', error);
  }
  
  console.log('=== Debug Complete ===');
};