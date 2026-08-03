# Aviation Simulation Database

This directory contains the database structure and implementation for the aviation simulation game.

## Database Structure

The database is designed to handle large amounts of real-world aviation data including:

### Core Entities
- **Airports**: World-wide airport information with stats like capacity, location, runways, and size
- **Aircraft Types**: Detailed aircraft specifications and performance data
- **Aircraft Instances**: Individual aircraft tracking with status and maintenance records
- **Routes**: Flight route information with operational data
- **Flight Schedules**: Detailed flight scheduling information
- **Flight Progress**: Real-time flight tracking and progress monitoring
- **Airlines**: Airline information and operational data
- **Staff**: Personnel tracking and management
- **Financial Records**: Revenue, expenses, and financial tracking
- **Events**: Game events and their impacts on the simulation

## Current Implementation

The game features a hybrid database system that combines IndexedDB (primary) with localStorage (fallback) to ensure robust data persistence across different browsers and environments.

### Implementation Details
1. **Primary Storage**: IndexedDB (via Dexie.js) for better performance and larger storage capacity
2. **Fallback Storage**: localStorage for environments where IndexedDB is not available
3. **Version Management**: Automatic migration system with version tracking
4. **Error Handling**: Graceful degradation when storage mechanisms fail

## Implemented Entities

- AirportEntity
- AircraftTypeEntity
- AircraftEntity
- RouteEntity
- FlightScheduleEntity
- FlightProgressEntity
- AirlineEntity
- StaffEntity
- FinancialTransactionEntity
- GameEventEntity
- GameTimeEntity

## Implemented Repositories

- AirportRepository
- AircraftTypeRepository
- AircraftRepository
- AirlineRepository
- RouteRepository
- StaffRepository
- FinancialTransactionRepository
- EventRepository
- FlightProgressRepository
- GameTimeRepository

## Directory Structure

```
src/database/
├── entities/              # Data models
├── repositories/          # Data access layer
├── hybridDB.ts            # Hybrid IndexedDB/localStorage implementation
├── localStorageDB.ts      # LocalStorage fallback implementation
├── init.ts                # Database initialization
├── database.ts            # Main database module
├── index.ts               # Main exports
├── config.ts              # Database configuration
├── README.md              # This file
├── dbplan.md              # Database plan and implementation
├── versioning.md          # Database versioning and migration guide
└── versioning.md          # Database versioning and migration guide
```

## Implementation Approach

This implementation uses:
1. **IndexedDB** with Dexie.js for primary storage (lightweight and scalable)
2. **localStorage** as fallback for environments where IndexedDB is not available
3. **TypeScript interfaces** for type safety
4. **Repository pattern** for data access
5. **Version tracking** and migration system for data integrity

## Database Versioning

The database includes automatic version tracking:
- Tracks version using `db_version` in localStorage
- Automatically runs migrations when needed
- Supports backward compatibility
- Graceful degradation when migrations fail

## Directory Structure

The database system is organized to support:
1. **Entities** - Data models for each domain
2. **Repositories** - Data access layer with CRUD operations
3. **HybridDB** - Main database implementation with fallback
4. **Versioning** - Migration and tracking system
5. **Initialization** - Startup and configuration logic

## Future Improvements

1. Add more sophisticated IndexedDB schema management
2. Implement database backup and restore functionality
3. Add encryption for sensitive game data
4. Implement more granular versioning for different data entities
5. Add cloud synchronization capabilities