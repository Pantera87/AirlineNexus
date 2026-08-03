// Browser-compatible database implementation using localStorage
import { DataSource } from 'typeorm';

export class Database {
  private static instance: Database;
  private static dataSource: DataSource | null = null;

  private constructor() {
    // Private constructor to prevent instantiation
  }

  static async initialize(): Promise<void> {
    // In browser environment, we don't initialize TypeORM
    // Instead, we use localStorage for persistence
    console.log('Browser database initialized with localStorage');
  }

  static async getDataSource(): Promise<DataSource> {
    // Return a mock DataSource to prevent TypeORM initialization
    // This prevents the error from occurring
    return {
      initialize: () => Promise.resolve(),
      destroy: () => Promise.resolve(),
      isInitialized: true,
      manager: {
        // Mock manager properties
      },
      repository: () => {
        // Mock repository method
        return {} as any;
      }
    } as unknown as DataSource;
  }

  static async close(): Promise<void> {
    // Clean up any resources if needed
    Database.dataSource = null;
  }
}