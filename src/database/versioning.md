# Database Versioning and Migration Guide

## Overview

The airline management game uses a hybrid database system that combines IndexedDB (primary) with localStorage (fallback) to ensure robust data persistence across different browsers and environments. This system includes version tracking and migration capabilities to maintain data integrity as the game evolves.

## Database Structure

### Current Implementation
- **Primary Storage**: IndexedDB (via Dexie.js)
- **Fallback Storage**: localStorage
- **Version Management**: Database version tracking with migration support

### Version History

| Version | Changes |
|---------|---------|
| 1.0 | Initial implementation with localStorage only |
| 2.0 | Added IndexedDB support with hybrid architecture and version tracking |

## Version Tracking

The database version is tracked in localStorage with the key `db_version`. This allows for:
- Automatic migration of existing data
- Version compatibility checking
- Graceful fallback to older versions when needed

## Migration Process

When the game starts, it:
1. Checks the current database version
2. Compares with the target version (2.0)
3. Runs necessary migrations if needed
4. Updates the version tracking

### Migration Steps

**Version 1 → 2**:
- Adds version tracking to existing game time data
- Ensures all game time data has proper version metadata

## Usage

### Initialize Database
```typescript
import { HybridDatabase } from '@database/hybridDB';

// Initialize the database with version checking
await HybridDatabase.initialize();
```

### Check Database Version
```typescript
const version = await HybridDatabase.getCurrentVersion();
console.log(`Database version: ${version}`);
```

### Update Database Version
```typescript
await HybridDatabase.updateVersion(2);
```

## Fallback Behavior

If IndexedDB is not available (e.g., in private browsing mode or unsupported browsers), the system automatically falls back to localStorage with the same API interface.

## Future Extensions

- Add more sophisticated IndexedDB schema management
- Implement database backup and restore functionality
- Add encryption for sensitive game data
- Implement more granular versioning for different data entities

## Error Handling

The database system includes comprehensive error handling:
- Fallback to localStorage when IndexedDB fails
- Graceful degradation when version migrations fail
- Detailed logging for debugging purposes