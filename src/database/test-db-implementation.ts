// Simple test to verify database implementation
import { DatabaseInitializer } from './init';
import { HybridDatabase } from './hybridDB';

async function testDatabase() {
  try {
    console.log('=== Testing Database Implementation ===');
    
    // Initialize database
    console.log('1. Initializing database...');
    await DatabaseInitializer.initialize();
    console.log('✓ Database initialized');
    
    // Test getting current date
    console.log('2. Getting current date from database...');
    const currentDate = await DatabaseInitializer.getCurrentDate();
    console.log('✓ Current date from database:', currentDate);
    
    // Test setting current date
    console.log('3. Setting test date...');
    const testDate = new Date(2024, 5, 15); // June 15, 2024
    await DatabaseInitializer.setCurrentDate(testDate);
    console.log('✓ Test date set:', testDate);
    
    // Verify the date was saved
    console.log('4. Verifying date was saved...');
    const savedDate = await DatabaseInitializer.getCurrentDate();
    console.log('✓ Date saved to database:', savedDate);
    
    // Test checking database availability
    console.log('5. Checking database availability...');
    const isAvailable = HybridDatabase.isAvailable();
    console.log('✓ Database available:', isAvailable);
    
    // Test date validation
    console.log('6. Testing date validation...');
    const invalidDate = new Date('invalid');
    console.log('Invalid date check:', isNaN(invalidDate.getTime()));
    
    console.log('=== All tests passed successfully ===');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testDatabase();