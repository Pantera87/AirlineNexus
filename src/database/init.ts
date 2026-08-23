// Database initialization for aviation simulation
import { HybridDatabase } from './hybridDB';

export class DatabaseInitializer {
  /**
   * Initialize the database
   */
  static async initialize(): Promise<void> {
    try {
      // Initialize hybrid database
      console.log('Initializing database...');
      
      // Initialize the hybrid database
      await HybridDatabase.initialize();
      
      // Check if we have a saved game time
      const gameTime = await HybridDatabase.getGameTime();
      if (!gameTime) {
        console.log('No existing game time found, creating default...');
        // Create default game time if none exists
        await HybridDatabase.saveGameTime({
          id: 1,
          currentDate: new Date(), // Use current system time
          createdAt: new Date(),
          updatedAt: new Date()
        });
      } else {
        console.log('Game time loaded from database:', gameTime.currentDate);
      }
      
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }
  
  /**
   * Get the current game date from database
   */
  static async getCurrentDate(): Promise<Date | null> {
    try {
      const gameTime = await HybridDatabase.getGameTime();
      if (gameTime && gameTime.currentDate) {
        // Ensure we return a proper Date object
        if (gameTime.currentDate instanceof Date) {
          return gameTime.currentDate;
        } else if (typeof gameTime.currentDate === 'string') {
          const parsedDate = new Date(gameTime.currentDate);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Failed to get current date from database:', error);
      return null;
    }
  }

  /**
   * Get the airline from database
   */
  static async getAirline(): Promise<any | null> {
    try {
      // In a real implementation, we'd query IndexedDB
      // For now, we'll use localStorage as fallback
      const airlineData = localStorage.getItem('airline-sim-airline');
      if (airlineData) {
        const airline = JSON.parse(airlineData);
        return airline;
      }
      return null;
    } catch (error) {
      console.error('Failed to get airline from database:', error);
      return null;
    }
  }
  
  /**
   * Set the current game date in database
   */
  static async setCurrentDate(date: Date): Promise<Date> {
    try {
      const gameTime = await HybridDatabase.getGameTime();
      if (gameTime) {
        const updatedGameTime = await HybridDatabase.updateGameTime(1, {
          currentDate: date
        });
        return updatedGameTime.currentDate;
      } else {
        // Create new game time if it doesn't exist
        const newGameTime = await HybridDatabase.saveGameTime({
          id: 1,
          currentDate: date,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        return newGameTime.currentDate;
      }
    } catch (error) {
      console.error('Failed to set current date in database:', error);
      throw error;
    }
  }
  
  /**
   * Clear all database data
   */
  static async clearAllData(): Promise<void> {
    try {
      await HybridDatabase.clearAllData();
      console.log('All database data cleared');
    } catch (error) {
      console.error('Failed to clear database:', error);
      throw error;
    }
  }
}
