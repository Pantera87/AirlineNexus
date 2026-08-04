import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  GameState,
  Airline,
  Aircraft,
  Route,
  GameSpeed,
  Difficulty,
  Screen,
  Notification,
  GameSettings,
  WorldState,
  BusinessModel,
} from '@/types/game';
import { AIRCRAFT_DATABASE } from '@data/aircraft';
import { generateId } from '@utils/helpers';
import { DatabaseInitializer } from '@/database/init';
import { GameTimeEngine } from '@/utils/gameTimeEngine';
import { GameTimeRepository } from '@/database/repositories/gameTime.repository';

// Default world state
const defaultWorldState: WorldState = {
  fuelPrice: 2.50, // USD per kg
  economicIndex: 75,
  travelDemand: 80,
  competitorAirlines: [
    {
      id: 'comp-1',
      name: 'Global Airways',
      iataCode: 'GA',
      marketShare: 15,
      reputation: 78,
      fleetSize: 120,
      routes: 250,
    },
    {
      id: 'comp-2',
      name: 'Pacific Airlines',
      iataCode: 'PA',
      marketShare: 12,
      reputation: 72,
      fleetSize: 95,
      routes: 180,
    },
    {
      id: 'comp-3',
      name: 'EuroWings',
      iataCode: 'EW',
      marketShare: 10,
      reputation: 80,
      fleetSize: 110,
      routes: 220,
    },
  ],
  activeEvents: [],
  regulations: [],
};

// Default game settings
const defaultSettings: GameSettings = {
  notificationsEnabled: true,
  soundEnabled: true,
  musicEnabled: true,
  showTooltips: true,
  currencyFormat: 'USD',
  dateFormat: 'US',
};

// Initial game state
const initialState: GameState = {
  airline: null,
  currentDate: new Date(2024, 0, 1), // Start Jan 1, 2024
  gameSpeed: 'paused',
  isPaused: true,
  difficulty: 'normal',
  world: defaultWorldState,
  notifications: [],
  settings: defaultSettings,
};

// Game store interface
interface GameStore extends GameState {
  // Navigation
  currentScreen: Screen;
  navigateTo: (screen: Screen) => void;

  // Game control
  startGame: (airlineData: Partial<Airline>) => void;
  togglePause: () => void;
  setGameSpeed: (speed: GameSpeed) => void;
  setDifficulty: (difficulty: Difficulty) => void;

  // Date/time management
  advanceDate: (hours: number) => Promise<void>;
  setCurrentDate: (date: Date) => Promise<void>;
  getCurrentDate: () => Date;

  // Notifications
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;

  // Settings
  updateSettings: (settings: Partial<GameSettings>) => void;

  // World state
  updateWorldState: (updates: Partial<WorldState>) => void;

  // Aircraft management
  purchaseAircraft: (typeId: string) => boolean;

  // Route management
  createRoute: (origin: string, destination: string) => boolean;

  // Reset
  resetGame: () => Promise<void>;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      // Initial state
      ...initialState,
      currentScreen: 'welcome',

      // Navigation
      navigateTo: (screen: Screen) => {
        set({ currentScreen: screen });
      },

      // Game control
      startGame: (airlineData: Partial<Airline>) => {
        const newAirline: Airline = {
          id: `airline-${Date.now()}`,
          name: airlineData.name || 'Airline Nexus Airlines',
          iataCode: airlineData.iataCode || 'AN',
          icaoCode: airlineData.icaoCode || 'ALN',
          headquarters: airlineData.headquarters || 'JFK',
          founded: get().currentDate,
          businessModel: (airlineData.businessModel as BusinessModel) || 'full-service',
          reputation: 50,
          rating: 3,
          alliance: null,
          fleet: [],
          routes: [],
          staff: [],
          finances: {
            cash: airlineData.finances?.cash || 50000000, // $50M starting cash
            totalRevenue: 0,
            totalExpenses: 0,
            profit: 0,
            assets: airlineData.finances?.cash || 50000000,
            liabilities: 0,
            netWorth: airlineData.finances?.cash || 50000000,
            monthlyReports: [],
            loans: [],
            investments: [],
          },
          loyaltyProgram: {
            name: `${airlineData.name || 'Airline Nexus'} Miles`,
            isActive: false,
            members: 0,
            tiers: [],
            partnerAirlines: [],
          },
          achievements: [],
        };

        set({
          airline: newAirline,
          isPaused: true,
          gameSpeed: 'paused',
          currentScreen: 'dashboard',
        });

        // Add welcome notification
        get().addNotification({
          type: 'success',
          title: 'Welcome to Airline Nexus!',
          message: `${newAirline.name} is ready for takeoff. Start by acquiring your first aircraft.`,
        });
      },

      togglePause: () => {
        const { isPaused, gameSpeed } = get();
        set({
          isPaused: !isPaused,
          gameSpeed: !isPaused ? 'paused' : gameSpeed === 'paused' ? 'normal' : gameSpeed,
        });
      },

      setGameSpeed: (speed: GameSpeed) => {
        set({
          gameSpeed: speed,
          isPaused: speed === 'paused',
        });
      },

      setDifficulty: (difficulty: Difficulty) => {
        set({ difficulty });
      },

       // Date/time management
        advanceDate: async (hours: number) => {
          try {
            const gameTimeEngine = await GameTimeEngine.initializeFromDatabase();
            // For backward compatibility, we still need to handle the hours parameter
            // but for our new implementation, we'll use the speed-based advancement
            if (get().gameSpeed === 'paused') return;
            
            // For normal, fast, and fastest speeds, advance by 1 unit based on speed
            gameTimeEngine.advanceTimeBySpeed(get().gameSpeed);
            const newDate = await gameTimeEngine.saveAndGetCurrentDate();
            set({ currentDate: newDate });
          } catch (error) {
            console.error('Failed to advance date:', error);
            // Fallback to local advancement
            const gameTimeEngine = new GameTimeEngine(get().currentDate);
            // For backward compatibility, we still pass hours but it won't be used in our new method
            gameTimeEngine.advanceTimeBySpeed(get().gameSpeed);
            set({ currentDate: gameTimeEngine.getCurrentDate() });
          }
        },

      setCurrentDate: async (date: Date) => {
        // Validate that the date is a valid Date object
        if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
          console.error('Invalid date passed to setCurrentDate:', date);
          return;
        }

        try {
          // Save to database
          await GameTimeRepository.setCurrentDate(date);
          set({ currentDate: date });
        } catch (error) {
          console.error('Failed to save date to database, using local storage only:', error);
          set({ currentDate: date });
        }
      },

      getCurrentDate: () => {
        return new Date(get().currentDate);
      },

      // Notifications
      addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>) => {
        const newNotification: Notification = {
          ...notification,
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          isRead: false,
        };
        set({
          notifications: [newNotification, ...get().notifications].slice(0, 50), // Keep last 50
        });
      },

      markNotificationRead: (id: string) => {
        set({
          notifications: get().notifications.map(n =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        });
      },

      clearNotifications: () => {
        set({ notifications: [] });
      },

      // Settings
      updateSettings: (settings: Partial<GameSettings>) => {
        set({
          settings: { ...get().settings, ...settings },
        });
      },

      // World state
      updateWorldState: (updates: Partial<WorldState>) => {
        set({
          world: { ...get().world, ...updates },
        });
      },

      // Aircraft management
      purchaseAircraft: (typeId: string) => {
        const state = get();
        const airline = state.airline;
        if (!airline) return false;

        const aircraftType = AIRCRAFT_DATABASE.find((a) => a.id === typeId);
        if (!aircraftType) return false;

        if (airline.finances.cash < aircraftType.acquisitionCost) {
          return false;
        }

        const newAircraft: Aircraft = {
          id: generateId('aircraft'),
          typeId,
          registration: `N${Math.floor(10000 + Math.random() * 90000)}`,
          age: 0,
          condition: 100,
          status: 'available',
          currentLocation: airline.headquarters,
          assignedRoute: null,
          totalFlightHours: 0,
          lastMaintenance: new Date(state.currentDate),
          nextMaintenance: new Date(
            new Date(state.currentDate).getTime() + 30 * 24 * 60 * 60 * 1000
          ),
          liveries: [],
          currentLiveryIndex: 0,
        };

        set({
          airline: {
            ...airline,
            fleet: [...airline.fleet, newAircraft],
            finances: {
              ...airline.finances,
              cash: airline.finances.cash - aircraftType.acquisitionCost,
            },
          },
        });

        return true;
      },

      // Route management
      createRoute: (origin: string, destination: string) => {
        const state = get();
        const airline = state.airline;
        if (!airline) return false;

        if (origin === destination) return false;

        const newRoute: Route = {
          id: generateId('route'),
          origin,
          destination,
          isActive: true,
          frequency: 7,
          aircraftId: '',
          schedule: [],
          avgLoadFactor: 0,
          revenue: 0,
          cost: 0,
          profitability: 0,
        };

        set({
          airline: {
            ...airline,
            routes: [...airline.routes, newRoute],
          },
        });

        return true;
      },

      // Reset
      resetGame: async () => {
        try {
          // Clear game time from database when resetting
          await GameTimeRepository.delete(1);
        } catch (error) {
          console.error('Failed to clear game time from database:', error);
        }

        set({
          ...initialState,
          currentScreen: 'welcome',
          settings: get().settings, // Preserve settings
        });
      },
    }),
    {
      name: 'airline-sim-storage',
      // Don't persist certain volatile state
      partialize: (state) => ({
        airline: state.airline,
        currentDate: state.currentDate,
        currentScreen: state.currentScreen,
        settings: state.settings,
        world: state.world,
      }),
    }
  )
);