// Debug script to understand database date handling
import { HybridDatabase } from './hybridDB';

async function debugDatabase() {
  console.log('=== Debugging Database Date Handling ===');
  
  try {
    // Initialize database
    await HybridDatabase.initialize();
    
    // Check if we have existing data
    const gameTime = await HybridDatabase.getGameTime();
    console.log('Current game time from DB:', gameTime);
    
    if (gameTime) {
      console.log('Type of currentDate:', typeof gameTime.currentDate);
      console.log('Value of currentDate:', gameTime.currentDate);
      
      // Try to create a new Date from the stored value
      if (typeof gameTime.currentDate === 'string') {
        const parsed = new Date(gameTime.currentDate);
        console.log('Parsed string date:', parsed, 'isValid:', !isNaN(parsed.getTime()));
      }
    } else {
      console.log('No existing game time - creating default');
      await HybridDatabase.saveGameTime({
        id: 1,
        currentDate: new Date(2024, 0, 1),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Try to get the date again
    const gameTime2 = await HybridDatabase.getGameTime();
    console.log('After potential update:', gameTime2);
    
  } catch (error) {
    console.error('Error in debug:', error);
  }
}

debugDatabase();