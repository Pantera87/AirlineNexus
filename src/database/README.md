# Database Implementation for Airline Management Game

This document outlines the database implementation for the Airline Management Game, which provides persistent storage for game data including time progression and other game state information.

## Overview

The database system uses a hybrid approach that combines IndexedDB (primary) with localStorage (fallback) to ensure robust data persistence across different browsers and environments. This system includes version tracking and migration capabilities to maintain data integrity as the game evolves.

## Architecture

### Core Components

1. **HybridDatabase** - Main hybrid database implementation with IndexedDB/localStorage fallback
2. **LocalStorageDB** - LocalStorage-based database implementation (fallback)
3. **DatabaseInitializer** - High-level initialization and management of database operations
4. **Versioning System** - Automatic migration and version tracking

### Data Models

#### GameTimeEntity
```typescript
interface GameTimeEntity {
  id: number;
  currentDate: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

## Implementation Details

### Storage Structure

All data is stored in either IndexedDB or localStorage with the following keys:
- `gameTime` - Contains the current game time information
- `db_version` - Tracks database version for migrations
- `airline-sim-db_*` - Various game data entries

### Persistence Strategy

The system follows a simple pattern:
1. On application startup, initialize the hybrid database
2. Check for existing game time data
3. If no data exists, create a default entry
4. On game time changes, update the stored data
5. On application exit, data persists automatically

### Usage Examples

```typescript
import { DatabaseInitializer } from '@database/init';
import { HybridDatabase } from '@database/hybridDB';

// Initialize database
await DatabaseInitializer.initialize();

// Get current date
const currentDate = await DatabaseInitializer.getCurrentDate();

// Set current date
await DatabaseInitializer.setCurrentDate(new Date());

// Direct hybrid database usage
const gameTime = await HybridDatabase.getGameTime();
const updatedTime = await HybridDatabase.updateGameTime(1, { currentDate: new Date() });
```

## Implementation Notes

1. **Browser Compatibility**: Uses IndexedDB as primary storage with localStorage fallback
2. **Data Size Limitations**: IndexedDB supports larger data sizes than localStorage
3. **Data Security**: All data is stored locally in the browser, not sent to any server
4. **Error Handling**: All database operations include proper error handling and fallbacks

## Version Management

The database includes automatic version tracking and migration:
- Tracks version using `db_version` in localStorage
- Automatically runs migrations when needed
- Supports backward compatibility
- Graceful degradation when migrations fail

## Future Enhancements

1. **IndexedDB Schema Management**: More sophisticated IndexedDB schema handling
2. **Cloud Sync**: Optional cloud backup functionality
3. **Data Migration**: Enhanced migration system for complex schema changes
4. **Backup/Restore**: Manual backup and restore functionality
5. **Encryption**: Optional encryption for sensitive game data