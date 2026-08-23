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
import { generateId, formatCurrency } from '@utils/helpers';
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
  currentScreen: Screen | 'fleet-marketplace';
  navigateTo: (screen: Screen | 'fleet-marketplace') => void;

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
  sellAircraft: (aircraftId: string, salePrice?: number) => { success: boolean; message: string };

  // Loan management
  payoffLoan: (loanId: string) => { success: boolean; message: string };
  prepayLoan: (loanId: string, amount: number) => { success: boolean; message: string };
  refinanceLoan: (loanId: string, newRatePercent: number, newTermMonths: number) => { success: boolean; message: string };

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
      navigateTo: (screen: Screen | 'fleet-marketplace') => {
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
        advanceDate: async (_hours: number) => {
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

      sellAircraft: (aircraftId: string, salePrice?: number) => {
        const state = get();
        const currency = state.settings.currencyFormat;
        const airline = state.airline;
        if (!airline) return { success: false, message: 'No active airline' };

        const aircraft = airline.fleet.find((a) => a.id === aircraftId);
        if (!aircraft) return { success: false, message: 'Aircraft not found in fleet' };

        // Block selling aircraft that still have an active loan on them.
        // The loan is linked via finances.loans[].aircraftId and would otherwise
        // be orphaned (liabilities kept, no way to pay it off).
        // `?? []` guards against old saves persisted before loans existed.
        const activeLoan = (airline.finances.loans ?? []).find(
          (loan) => loan.aircraftId === aircraft.id && loan.remainingBalance > 0
        );
        if (activeLoan) {
          return {
            success: false,
            message: `${aircraft.registration} has an active loan (${formatCurrency(activeLoan.remainingBalance, currency)} remaining). Pay it off before selling.`,
          };
        }

        // Calculate sale price if not provided
        const aircraftType = AIRCRAFT_DATABASE.find((a) => a.id === aircraft.typeId);
        let finalSalePrice: number;
        if (salePrice !== undefined && salePrice > 0) {
          finalSalePrice = salePrice;
        } else if (aircraftType) {
          // Depreciation: lose ~5% value per year, plus condition factor
          const ageFactor = Math.max(0.1, 1 - aircraft.age * 0.05);
          const conditionFactor = aircraft.condition / 100;
          finalSalePrice = Math.round(aircraftType.acquisitionCost * ageFactor * conditionFactor);
        } else {
          return { success: false, message: 'Unable to determine sale price for this aircraft' };
        }

        // Single atomic update: unassign from routes (if needed), remove the
        // aircraft from the fleet and apply the financial effects. Using one set()
        // avoids a stale-state overwrite where the second update would clobber
        // the route unassignment done by the first.
        const updatedRoutes = aircraft.assignedRoute
          ? airline.routes.map((r) => (r.aircraftId === aircraft.id ? { ...r, aircraftId: '' } : r))
          : airline.routes;

        set({
          airline: {
            ...airline,
            routes: updatedRoutes,
            fleet: airline.fleet.filter((a) => a.id !== aircraftId),
            finances: {
              ...airline.finances,
              cash: airline.finances.cash + finalSalePrice,
              // The aircraft's book value leaves the balance sheet; cash comes in.
              assets: Math.max(0, airline.finances.assets - (finalSalePrice * 0.5)),
              netWorth: airline.finances.netWorth + finalSalePrice,
            },
          },
        });

        return {
          success: true,
          message: `${aircraft.registration} sold for ${formatCurrency(finalSalePrice, currency)}`,
        };
      },

      // Loan management
      payoffLoan: (loanId) => {
        const state = get();
        const currency = state.settings.currencyFormat;
        const airline = state.airline;
        if (!airline) return { success: false, message: 'No active airline' };

        const loans = airline.finances.loans ?? [];
        const loan = loans.find((l) => l.id === loanId);
        if (!loan) return { success: false, message: 'Loan not found' };
        if (loan.remainingBalance <= 0) return { success: false, message: 'This loan is already paid off' };

        const amount = Math.round(loan.remainingBalance);
        if (airline.finances.cash < amount) {
          return {
            success: false,
            message: `Insufficient funds. You need ${formatCurrency(amount, currency)} but only have ${formatCurrency(airline.finances.cash, currency)}.`,
          };
        }

        const aircraft = airline.fleet.find((a) => a.id === loan.aircraftId);
        set({
          airline: {
            ...airline,
            finances: {
              ...airline.finances,
              cash: airline.finances.cash - amount,
              liabilities: Math.max(0, airline.finances.liabilities - amount),
              loans: loans.map((l) => (l.id === loanId ? { ...l, remainingBalance: 0 } : l)),
            },
          },
        });

        return {
          success: true,
            message: `Loan for ${aircraft?.registration ?? 'aircraft'} fully paid off (${formatCurrency(amount, currency)}).`,
        };
      },

      prepayLoan: (loanId, amount) => {
        const state = get();
        const currency = state.settings.currencyFormat;
        const airline = state.airline;
        if (!airline) return { success: false, message: 'No active airline' };

        const loans = airline.finances.loans ?? [];
        const loan = loans.find((l) => l.id === loanId);
        if (!loan) return { success: false, message: 'Loan not found' };
        if (loan.remainingBalance <= 0) return { success: false, message: 'This loan is already paid off' };

        const payment = Math.round(amount);
        if (payment <= 0) return { success: false, message: 'Enter a valid prepayment amount.' };
        if (payment > loan.remainingBalance) {
          return {
            success: false,
            message: `Cannot prepay more than the remaining balance of ${formatCurrency(loan.remainingBalance, currency)}.`,
          };
        }
        if (airline.finances.cash < payment) {
          return {
            success: false,
            message: `Insufficient funds. You need ${formatCurrency(payment, currency)} but only have ${formatCurrency(airline.finances.cash, currency)}.`,
          };
        }

        const newBalance = Math.max(0, loan.remainingBalance - payment);
        set({
          airline: {
            ...airline,
            finances: {
              ...airline.finances,
              cash: airline.finances.cash - payment,
              liabilities: Math.max(0, airline.finances.liabilities - payment),
              loans: loans.map((l) => (l.id === loanId ? { ...l, remainingBalance: newBalance } : l)),
            },
          },
        });

        return {
          success: true,
          message:
            newBalance <= 0
              ? `Loan paid off with prepayment of ${formatCurrency(payment, currency)}.`
              : `Prepaid ${formatCurrency(payment, currency)}. New balance: ${formatCurrency(newBalance, currency)}.`,
        };
      },

      refinanceLoan: (loanId, newRatePercent, newTermMonths) => {
        const state = get();
        const currency = state.settings.currencyFormat;
        const airline = state.airline;
        if (!airline) return { success: false, message: 'No active airline' };

        const loans = airline.finances.loans ?? [];
        const loan = loans.find((l) => l.id === loanId);
        if (!loan) return { success: false, message: 'Loan not found' };
        if (loan.remainingBalance <= 0) return { success: false, message: 'This loan is already paid off' };

        const rate = newRatePercent;
        const months = Math.max(1, Math.round(newTermMonths));
        if (!isFinite(rate) || rate < 0) return { success: false, message: 'Enter a valid interest rate.' };

        const principal = loan.remainingBalance;
        const monthlyRate = rate / 12 / 100;
        let newMonthlyPayment: number;
        if (monthlyRate === 0) {
          newMonthlyPayment = principal / months;
        } else {
          newMonthlyPayment =
            (principal * (monthlyRate * Math.pow(1 + monthlyRate, months))) /
            (Math.pow(1 + monthlyRate, months) - 1);
        }

        // Refinancing fee: 2% of the refinanced principal
        const refinanceFee = Math.round(principal * 0.02);
        if (airline.finances.cash < refinanceFee) {
          return {
            success: false,
            message: `Insufficient funds to cover the ${formatCurrency(refinanceFee, currency)} refinancing fee.`,
          };
        }

        const aircraft = airline.fleet.find((a) => a.id === loan.aircraftId);

        // The refinanced balance starts a fresh term from today.
        const refinanceDate = new Date(state.currentDate || new Date());
        const newEndDate = new Date(refinanceDate);
        newEndDate.setMonth(newEndDate.getMonth() + months);

        set({
          airline: {
            ...airline,
            finances: {
              ...airline.finances,
              cash: airline.finances.cash - refinanceFee,
              totalExpenses: airline.finances.totalExpenses + refinanceFee,
              loans: loans.map((l) =>
                l.id === loanId
                  ? {
                      ...l,
                      interestRate: rate,
                      monthlyPayment: Math.round(newMonthlyPayment),
                      startDate: refinanceDate,
                      endDate: newEndDate,
                    }
                  : l
              ),
            },
          },
        });

        return {
          success: true,
            message: `Loan for ${aircraft?.registration ?? 'aircraft'} refinanced at ${rate.toFixed(2)}% over ${months} months. New payment: ${formatCurrency(Math.round(newMonthlyPayment), currency)}. Fee: ${formatCurrency(refinanceFee, currency)}.`,
        };
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
          currentScreen: 'welcome' as const,
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