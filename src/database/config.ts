// Database configuration for aviation simulation
// This file is designed to be browser-compatible

export class DatabaseConfig {
  static getDataSource() {
    // In browser environment, return a mock configuration
    // This is a placeholder since we're using localStorage instead of TypeORM
    console.log('Returning mock database config for browser environment');
    return {
      type: 'sqlite',
      database: './database.sqlite',
      synchronize: true,
      logging: false,
      entities: [],
    };
  }
}
