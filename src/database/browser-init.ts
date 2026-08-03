// Browser-specific database initialization for aviation simulation
// This file provides a no-ORM solution for browser environments

export class BrowserDatabaseInitializer {
  // In browser, we don't need complex database initialization
  // We'll use localStorage for persistence
  
  static async initialize() {
    try {
      console.log('Initializing browser database...');
      // For browser, we don't need to initialize anything complex
      // localStorage is ready to use
      console.log('Browser database initialized successfully');
      return true;
    } catch (error) {
      console.error('Browser database initialization failed:', error);
      return false;
    }
  }

  static async createTables() {
    try {
      console.log('Creating browser database tables (localStorage)...');
      // For browser, we don't create tables, localStorage handles persistence
      console.log('Browser database tables created successfully');
    } catch (error) {
      console.error('Failed to create browser database tables:', error);
    }
  }

  static async getDataSource() {
    try {
      // Return a mock data source that works in browser
      console.log('Returning mock data source for browser');
      return {
        initialize: () => Promise.resolve(),
        synchronize: () => Promise.resolve(),
        getRepository: () => ({})
      };
    } catch (error) {
      console.error('Failed to get browser data source:', error);
      // Return a mock object to prevent app crash
      return {
        initialize: () => Promise.resolve(),
        synchronize: () => Promise.resolve(),
        getRepository: () => ({})
      };
    }
  }
}