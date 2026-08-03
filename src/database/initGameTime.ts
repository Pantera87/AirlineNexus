// Initialize game time persistence
import { BrowserDatabase } from './browser-db';

export const initializeGameTime = async () => {
  try {
    const db = BrowserDatabase.getInstance();
    
    // Check if game time exists, if not create it
    const gameTime = await db.getGameTime();
    if (!gameTime) {
      console.log('Creating default game time');
      await db.createGameTime({
        currentDate: new Date(2024, 0, 1),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      console.log('Game time already exists:', gameTime.currentDate);
    }
  } catch (error) {
    console.error('Failed to initialize game time:', error);
  }
};