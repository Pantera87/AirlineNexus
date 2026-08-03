# Database Usage Guide for Airline Management Game

This guide explains how to use the persistent database system implemented in the Airline Management Game.

## Overview

The database system provides persistent storage for game state, particularly the current game date, allowing players to resume their game from where they left off.

## System Architecture

The system follows a layered architecture:

1. **Entities** - Data models (GameTimeEntity)
2. **Repositories** - Business logic for data operations (GameTimeRepository)
3. **Database Layer** - Low-level storage operations (LocalStorageDB)
4. **Initializer** - High-level database management (DatabaseInitializer)

## Key Features

- **Automatic Initialization**: Database initializes on app startup
- **Persistent Time Storage**: Game date persists between sessions
- **Error Handling**: Graceful handling of database errors
- **Browser-based**: Uses localStorage for all data storage

## How to Use

### 1. Initialize Database

The database initializes automatically when the application starts. However, you can manually initialize it:

```typescript
import { DatabaseInitializer } from '@database/init';

// Initialize the database
await DatabaseInitializer.initialize();
```

### 2. Get Current Game Date

```typescript
import { DatabaseInitializer } from '@database/init';

// Get the current game date
const currentDate = await DatabaseInitializer.getCurrentDate();
if (currentDate) {
  console.log('Current game date:', currentDate);
}
```

### 3. Set Current Game Date

```typescript
import { DatabaseInitializer } from '@database/init';

// Set a new game date
const newDate = new Date(2024, 5, 15); // June 15, 2024
await DatabaseInitializer.setCurrentDate(newDate);
```

### 4. Direct Repository Usage

For more granular control, you can use the repository directly:

```typescript
import { GameTimeRepository } from '@database/repositories/gameTime.repository';

// Find existing game time
const gameTime = await GameTimeRepository.find();

// Create new game time
const newGameTime = await GameTimeRepository.create({
  currentDate: new Date()
});

// Update existing game time
const updated = await GameTimeRepository.update(1, {
  currentDate: new Date(2024, 6, 20)
});
```

## Data Persistence

All data is automatically persisted using browser localStorage. The system:

1. Checks for existing data on startup
2. Creates default data if none exists
3. Updates data when changes occur
4. Persists changes automatically

## Error Handling

The database system includes comprehensive error handling:

- All operations are wrapped in try-catch blocks
- Failed operations return null or throw errors appropriately
- Console logging for debugging purposes
- Graceful fallbacks when database operations fail

## Best Practices

1. **Always Initialize**: Call `DatabaseInitializer.initialize()` at app startup
2. **Handle Null Returns**: Methods may return null if no data exists
3. **Validate Dates**: Always validate that Date objects are valid before using them
4. **Use Async/Await**: All database operations are asynchronous
5. **Check Browser Support**: Ensure localStorage is available in the browser

## Troubleshooting

### Common Issues

1. **Database Not Initializing**: Ensure `DatabaseInitializer.initialize()` is called
2. **Date Not Persisting**: Check browser localStorage is enabled and not full
3. **Type Errors**: Make sure you're importing types correctly from `@database/`

### Debugging

Enable logging in the database files to see what's happening:

```typescript
// In any database file, add console.log statements
console.log('Debug: Database operation started');
```

## Future Enhancements

The system is designed to be extensible:

1. **IndexedDB Support**: Can be extended to use IndexedDB for larger datasets
2. **Cloud Sync**: Add optional cloud backup functionality
3. **Data Migration**: Support for upgrading data between game versions
4. **Backup/Restore**: Manual backup and restore functionality

## File Structure

```
src/database/
├── index.ts              # Main export file
├── init.ts               # Database initialization
├── localStorageDB.ts     # Low-level localStorage operations
├── entities/
│   └── gameTime.entity.ts # Game time data model
└── repositories/
    └── gameTime.repository.ts # Game time operations