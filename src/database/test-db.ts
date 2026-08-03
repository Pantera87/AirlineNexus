// Test file to verify database functionality
import { DatabaseInitializer } from './init';
import { HybridDatabase } from './hybridDB';

// Test database functionality
const testDatabase = async () => {
  try {
    console.log('Testing database initialization...');
    
    // Initialize database
    await DatabaseInitializer.initialize();
    console.log('Database initialized successfully');
    
    // Test getting current date
    const currentDate = await DatabaseInitializer.getCurrentDate();
    console.log('Current date from database:', currentDate);
    
    // Test setting current date
    const testDate = new Date(2024, 5, 15); // June 15, 2024
    await DatabaseInitializer.setCurrentDate(testDate);
    console.log('Set test date to:', testDate);
    
    // Verify the date was saved
    const savedDate = await DatabaseInitializer.getCurrentDate();
    console.log('Verified date from database:', savedDate);
    
    // Test checking database availability
    const isAvailable = HybridDatabase.isAvailable();
    console.log('Database available:', isAvailable);
    
    console.log('Database test completed successfully');
  } catch (error) {
    console.error('Database test failed:', error);
  }
};

// Run the test
testDatabase();