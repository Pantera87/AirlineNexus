// Game time repository for aviation simulation
import { GameTimeEntity } from '../entities/gameTime.entity';
import { LocalStorageDB } from '../localStorageDB';

export class GameTimeRepository {
  private static readonly ENTITY_NAME = 'gameTime';

  /**
   * Get the current game time from storage
   */
  static async find(): Promise<GameTimeEntity | null> {
    try {
      const gameTimeData = await LocalStorageDB.getGameTime();
      return gameTimeData;
    } catch (error) {
      console.error('Failed to get game time from repository:', error);
      return null;
    }
  }

  /**
   * Create a new game time entry
   */
  static async create(gameTime: Omit<GameTimeEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<GameTimeEntity> {
    try {
      const newGameTime = {
        id: 1,
        currentDate: gameTime.currentDate,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await LocalStorageDB.createGameTime(newGameTime);
      return newGameTime;
    } catch (error) {
      console.error('Failed to create game time in repository:', error);
      throw error;
    }
  }

  /**
   * Update an existing game time entry
   */
  static async update(id: number, gameTime: Partial<GameTimeEntity>): Promise<GameTimeEntity> {
    try {
      const existing = await this.find();
      if (existing) {
        const updated = {
          ...existing,
          ...gameTime,
          updatedAt: new Date()
        };
        
        await LocalStorageDB.updateGameTime(id, updated);
        return updated;
      } else {
        // If no existing record, create one
        return await this.create({ currentDate: gameTime.currentDate as Date });
      }
    } catch (error) {
      console.error('Failed to update game time in repository:', error);
      throw error;
    }
  }

  /**
   * Delete the game time entry
   */
  static async delete(id: number): Promise<void> {
    try {
      await LocalStorageDB.deleteGameTime(id);
    } catch (error) {
      console.error('Failed to delete game time from repository:', error);
      throw error;
    }
  }

  /**
   * Get the current game date
   */
  static async getCurrentDate(): Promise<Date | null> {
    try {
      const gameTime = await this.find();
      return gameTime ? gameTime.currentDate : null;
    } catch (error) {
      console.error('Failed to get current date from repository:', error);
      return null;
    }
  }

  /**
   * Set the current game date
   */
  static async setCurrentDate(date: Date): Promise<Date> {
    try {
      const existing = await this.find();
      if (existing) {
        const updated = await this.update(1, { currentDate: date });
        return updated.currentDate;
      } else {
        const created = await this.create({ currentDate: date });
        return created.currentDate;
      }
    } catch (error) {
      console.error('Failed to set current date in repository:', error);
      throw error;
    }
  }
}