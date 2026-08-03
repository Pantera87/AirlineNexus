// LocalStorage-based database implementation for aviation simulation
// This completely replaces TypeORM with browser-compatible localStorage operations

export class LocalStorageDB {
  private static DB_NAME = 'airline-sim-db';
  
  // Game time operations
   static async getGameTime(): Promise<any | null> {
     try {
       const gameTimeData = localStorage.getItem('gameTime');
       if (gameTimeData) {
         const parsed = JSON.parse(gameTimeData);
         // Convert date strings back to Date objects
         if (parsed.currentDate && typeof parsed.currentDate === 'string') {
           parsed.currentDate = new Date(parsed.currentDate);
         }
         if (parsed.createdAt && typeof parsed.createdAt === 'string') {
           parsed.createdAt = new Date(parsed.createdAt);
         }
         if (parsed.updatedAt && typeof parsed.updatedAt === 'string') {
           parsed.updatedAt = new Date(parsed.updatedAt);
         }
         return parsed;
       }
       return null;
     } catch (error) {
       console.error('Failed to get game time from localStorage:', error);
       return null;
     }
   }

  static async createGameTime(gameTime: any): Promise<any> {
    try {
      const newGameTime = {
        id: 1,
        currentDate: gameTime.currentDate || new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      localStorage.setItem('gameTime', JSON.stringify(newGameTime));
      return newGameTime;
    } catch (error) {
      console.error('Failed to create game time in localStorage:', error);
      return gameTime;
    }
  }

  static async updateGameTime(id: number, gameTime: any): Promise<any> {
    try {
      const existing = await this.getGameTime();
      if (existing) {
        const updated = {
          ...existing,
          ...gameTime,
          updatedAt: new Date()
        };
        localStorage.setItem('gameTime', JSON.stringify(updated));
        return updated;
      } else {
        return await this.createGameTime(gameTime);
      }
    } catch (error) {
      console.error('Failed to update game time in localStorage:', error);
      return gameTime;
    }
  }

  static async deleteGameTime(id: number): Promise<void> {
    try {
      localStorage.removeItem('gameTime');
    } catch (error) {
      console.error('Failed to delete game time from localStorage:', error);
    }
  }
  
  // Generic operations for other entities
  static async getEntity<T>(entityName: string, id: string): Promise<T | null> {
    try {
      const data = localStorage.getItem(`${entityName}_${id}`);
      if (data) {
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error(`Failed to get ${entityName} from localStorage:`, error);
      return null;
    }
  }
  
  static async saveEntity<T>(entityName: string, entity: T): Promise<T> {
    try {
      const id = (entity as any).id || Math.random().toString(36).substr(2, 9);
      (entity as any).id = id;
      localStorage.setItem(`${entityName}_${id}`, JSON.stringify(entity));
      return entity;
    } catch (error) {
      console.error(`Failed to save ${entityName} to localStorage:`, error);
      return entity;
    }
  }
  
  static async getAllEntities<T>(entityName: string): Promise<T[]> {
    try {
      const items: T[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${entityName}_`)) {
          const item = localStorage.getItem(key);
          if (item) {
            items.push(JSON.parse(item));
          }
        }
      }
      return items;
    } catch (error) {
      console.error(`Failed to get all ${entityName} from localStorage:`, error);
      return [];
    }
  }
  
  // Clear all data (for reset functionality)
  static async clearAllData(): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.DB_NAME)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.error('Failed to clear database:', error);
    }
  }
}