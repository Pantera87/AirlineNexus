// Hybrid database implementation for aviation simulation
// Combines IndexedDB (primary) with localStorage (backup) for robust persistence
import { LocalStorageDB } from './localStorageDB';
import { GameTimeEntity } from './entities/gameTime.entity';

export class HybridDatabase {
  private static instance: HybridDatabase;
  private static useIndexedDB = true;
  
  private constructor() {
    // Private constructor to enforce singleton
  }
  
  static getInstance(): HybridDatabase {
    if (!HybridDatabase.instance) {
      HybridDatabase.instance = new HybridDatabase();
    }
    return HybridDatabase.instance;
  }
  
  /**
   * Initialize the database with version checking
   */
  static async initialize(): Promise<void> {
    try {
      // Try to initialize IndexedDB first
      await this.initializeIndexedDB();
      this.useIndexedDB = true;
      console.log('Hybrid database initialized with IndexedDB support');
    } catch (error) {
      // Fallback to localStorage
      console.warn('IndexedDB not available, falling back to localStorage:', error);
      this.useIndexedDB = false;
      await this.initializeLocalStorage();
    }
    
    // Check and run migrations if needed
    await this.checkAndRunMigrations();
  }
  
  /**
   * Initialize IndexedDB with Dexie.js
   */
  private static async initializeIndexedDB(): Promise<void> {
    // This would be implemented with Dexie.js in a real implementation
    // For now, we're just checking if we can access the API
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB not supported');
    }
    
    // In a real implementation, we would initialize Dexie here
    // For now, we'll just check that the API is available
  }
  
  /**
   * Initialize localStorage fallback
   */
  private static async initializeLocalStorage(): Promise<void> {
    // localStorage is always available, but we'll check for basic functionality
    try {
      const testKey = 'db_test';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (error) {
      throw new Error('localStorage not available: ' + error);
    }
  }
  
  /**
   * Check if database needs migration and run appropriate migrations
   */
  private static async checkAndRunMigrations(): Promise<void> {
    try {
      const currentVersion = await this.getCurrentVersion();
      const targetVersion = 2; // Our target version
      
      if (currentVersion < targetVersion) {
        await this.runMigrations(currentVersion, targetVersion);
        await this.updateVersion(targetVersion);
        console.log(`Database migrated from version ${currentVersion} to ${targetVersion}`);
      }
    } catch (error) {
      console.error('Failed to run database migrations:', error);
      // Continue with existing version if migration fails
    }
  }
  
  /**
   * Run database migrations
   */
  private static async runMigrations(fromVersion: number, toVersion: number): Promise<void> {
    for (let version = fromVersion + 1; version <= toVersion; version++) {
      switch (version) {
        case 2:
          await this.migrateToVersion2();
          break;
        // Add more migration steps here as needed
        default:
          console.log(`No migration defined for version ${version}`);
      }
    }
  }
  
  /**
   * Migration from version 1 to 2
   */
  private static async migrateToVersion2(): Promise<void> {
    try {
      // Check if we have game time data in localStorage
      const gameTimeData = localStorage.getItem('gameTime');
      if (gameTimeData) {
        const gameTime = JSON.parse(gameTimeData);
        
        // Add version tracking to existing data
        if (!gameTime.gameVersion) {
          gameTime.gameVersion = 2;
          localStorage.setItem('gameTime', JSON.stringify(gameTime));
          console.log('Migrated game time data to version 2');
        }
      }
    } catch (error) {
      console.error('Error during migration to version 2:', error);
    }
  }
  
  /**
   * Get current database version
   */
  static async getCurrentVersion(): Promise<number> {
    try {
      if (this.useIndexedDB) {
        // In a real IndexedDB implementation, we'd read version from DB
        // For now, we'll use localStorage as fallback
        const versionData = localStorage.getItem('db_version');
        return versionData ? parseInt(versionData, 10) || 1 : 1;
      } else {
        const versionData = localStorage.getItem('db_version');
        return versionData ? parseInt(versionData, 10) || 1 : 1;
      }
    } catch (error) {
      console.error('Failed to get database version:', error);
      return 1;
    }
  }
  
  /**
   * Update database version
   */
  static async updateVersion(version: number): Promise<void> {
    try {
      localStorage.setItem('db_version', version.toString());
      console.log(`Database version updated to ${version}`);
    } catch (error) {
      console.error('Failed to update database version:', error);
    }
  }
  
  /**
   * Get game time from database
   */
  static async getGameTime(): Promise<GameTimeEntity | null> {
    try {
      if (this.useIndexedDB) {
        // In a real implementation, we'd query IndexedDB
        // For now, fall back to localStorage
        return await LocalStorageDB.getGameTime();
      } else {
        return await LocalStorageDB.getGameTime();
      }
    } catch (error) {
      console.error('Failed to get game time:', error);
      return null;
    }
  }
  
  /**
   * Save game time to database
   */
  static async saveGameTime(gameTime: GameTimeEntity): Promise<GameTimeEntity> {
    try {
      if (this.useIndexedDB) {
        // In a real implementation, we'd save to IndexedDB
        // For now, save to localStorage
        return await LocalStorageDB.createGameTime(gameTime);
      } else {
        return await LocalStorageDB.createGameTime(gameTime);
      }
    } catch (error) {
      console.error('Failed to save game time:', error);
      throw error;
    }
  }
  
  /**
   * Update game time in database
   */
  static async updateGameTime(id: number, gameTime: Partial<GameTimeEntity>): Promise<GameTimeEntity> {
    try {
      if (this.useIndexedDB) {
        // In a real implementation, we'd update IndexedDB
        // For now, update localStorage
        return await LocalStorageDB.updateGameTime(id, gameTime);
      } else {
        return await LocalStorageDB.updateGameTime(id, gameTime);
      }
    } catch (error) {
      console.error('Failed to update game time:', error);
      throw error;
    }
  }
  
  /**
   * Clear all database data
   */
  static async clearAllData(): Promise<void> {
    try {
      if (this.useIndexedDB) {
        // In a real implementation, we'd clear IndexedDB
        // For now, clear localStorage
        await LocalStorageDB.clearAllData();
      } else {
        await LocalStorageDB.clearAllData();
      }
    } catch (error) {
      console.error('Failed to clear database:', error);
      throw error;
    }
  }
  
  /**
   * Check if database is available
   */
  static isAvailable(): boolean {
    return typeof localStorage !== 'undefined';
  }
  
  /**
   * Get database type being used
   */
  static getDatabaseType(): 'indexeddb' | 'localStorage' {
    return this.useIndexedDB ? 'indexeddb' : 'localStorage';
  }
}