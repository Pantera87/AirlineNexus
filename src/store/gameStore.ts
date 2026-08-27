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
  Airport,
} from '@/types/game';
import { AIRCRAFT_DATABASE } from '@data/aircraft';
import { AIRPORT_DATABASE } from '@/data/airports';
import { generateRegistrationForHub } from '@/data/registrationPrefixes';
import { generateId, formatCurrency } from '@utils/helpers';
import { GameTimeEngine } from '@/utils/gameTimeEngine';
import {
  calculateRouteDistanceNm,
  estimateFlightTimeMinutes,
  findAircraftById,
  previewRouteEconomics,
  getAircraftWeeklyFixedCosts,
  maxFrequencyPerWeek,
  getRouteCycleMinutes,
  DAILY_DUTY_HOURS,
  getRoutePath,
  calculateLoopDistanceNm,
  scoreLoopDemand,
  checkLoopRange,
  maxLoopFrequencyPerWeek,
  getLoopLegs,
  getLoopCycleMinutes,
  previewLoopEconomics,
} from '@/utils/routeEngine';
import { computeDispatchPlan } from '@/utils/fleetDispatcher';
import type { RouteStaffing } from '@/utils/fleetDispatcher';
import { generateTimetable, needsTimetableRegeneration } from '@/utils/timetable';
import { GameTimeRepository } from '@/database/repositories/gameTime.repository';

// In-game milliseconds per week (one in-game day is 24 hours of simulated time).
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Resolve a route's full loop path (HUB → stops… → DEST) to airport objects, or null if any IATA is unknown. */
function resolveRoutePathAirports(route: Route): Airport[] | null {
  const airports = getRoutePath(route).map((iata) => AIRPORT_DATABASE.find((a) => a.iata === iata));
  return airports.every((a) => !!a) ? (airports as Airport[]) : null;
}

// Default world state
const defaultWorldState: WorldState = {
  fuelPrice: 0.95, // USD per kg (realistic jet-fuel band is roughly $0.60–$1.40/kg)
  fuelPriceHistory: [],
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
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  // Settings
  updateSettings: (settings: Partial<GameSettings>) => void;

  // World state
  updateWorldState: (updates: Partial<WorldState>) => void;
  /** Weekly fuel market random-walk — updates world.fuelPrice and records it in history */
  updateFuelPrice: () => void;

  // Aircraft management
  purchaseAircraft: (typeId: string) => boolean;
  sellAircraft: (aircraftId: string, salePrice?: number) => { success: boolean; message: string };
  /**
   * Automatic fleet dispatch: assigns aircraft from the shared per-type pool to
   * active routes (sticky + free-pool fill), repositions/releases as needed,
   * charges one-time positioning costs, and refreshes the weekly plan.
   */
  dispatchFleet: () => { dispatched: number; released: number; shortfalls: RouteStaffing[]; totalPositionCost: number } | null;

  // Loan management
  payoffLoan: (loanId: string) => { success: boolean; message: string };
  prepayLoan: (loanId: string, amount: number) => { success: boolean; message: string };
  refinanceLoan: (loanId: string, newRatePercent: number, newTermMonths: number) => { success: boolean; message: string };

  // Route management
  createRoute: (params: {
    origin: string; // must be the airline's hub
    destination: string;
    stops?: string[]; // intermediate airports in flight order (multi-hop loop)
    aircraftType?: string;
    frequencyPerWeek?: number;
  }) => boolean;
  updateRoute: (routeId: string, updates: { frequency?: number; aircraftType?: string; isActive?: boolean }) => boolean;
  cancelRoute: (routeId: string) => boolean;

  // Hub policy enforcement — cancels legacy routes that don't originate at the hub.
  enforceHubRoutes: () => number;

  // Weekly operations plan (Phase 4b) — recomputes this week's projected revenue/costs via the
  // route engine and stores them in finances.weeklyPlan. Does NOT apply a lump sum to cash:
  // the game loop streams it into cash continuously via accrueFinances() as time passes.
  // At real week boundaries (default) it also advances the load-factor ramp, moves the fuel
  // market, and notifies; mid-week refreshes pass { boundary: false }.
  settleWeeklyRoutes: (options?: { boundary?: boolean }) => {
    settledRoutes: number;
    totalRevenue: number;
    totalCosts: number;
    totalProfit: number;
  } | null;

  // Continuous cash accrual (Phase 4b) — called by the game loop every tick with the elapsed
  // in-game milliseconds since the last tick, applying that fraction of the current weekly
  // plan to cash/revenue/expenses.
  accrueFinances: (gameMsAdvanced: number) => void;

  // Monthly loan servicing (Phase 4c) — called by the game loop on month boundaries.
  settleMonthlyLoans: () => { settledPayments: number; totalPaid: number } | null;

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
          // Seed the fuel price history so the Fuel Market chart has a starting point.
          world: {
            ...get().world,
            fuelPriceHistory: [
              ...(get().world.fuelPriceHistory ?? []),
              { date: get().currentDate.toISOString(), price: get().world.fuelPrice },
            ],
          },
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

      markAllNotificationsRead: () => {
        set({
          notifications: get().notifications.map(n =>
            n.isRead ? n : { ...n, isRead: true }
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

      /**
       * Weekly fuel market update — random-walks the jet-fuel price and records
       * it in the history for the Fuel Market chart. Called at the start of each
       * weekly settlement so flight costs always use the current market price.
       */
      updateFuelPrice: () => {
        const state = get();
        const prevPrice = state.world.fuelPrice;

        // Random walk: ±8% drift, clamped to a realistic band ($0.60–$1.40/kg)
        const drift = (Math.random() * 2 - 1) * 0.08;
        let nextPrice = prevPrice * (1 + drift);
        nextPrice = Math.min(1.4, Math.max(0.6, nextPrice));
        nextPrice = Math.round(nextPrice * 100) / 100;

        const history = [
          ...(state.world.fuelPriceHistory ?? []),
          { date: state.currentDate.toISOString(), price: nextPrice },
        ].slice(-104); // Keep ~2 years of weekly points

        set({
          world: { ...state.world, fuelPrice: nextPrice, fuelPriceHistory: history },
        });

        const changePct = ((nextPrice - prevPrice) / prevPrice) * 100;
        if (state.settings.notificationsEnabled && Math.abs(changePct) >= 5) {
          get().addNotification({
            type: nextPrice > prevPrice ? 'warning' : 'success',
            title: `Fuel prices ${nextPrice > prevPrice ? 'surge' : 'drop'} ${Math.abs(changePct).toFixed(1)}%`,
            message: `Jet fuel is now trading at $${nextPrice.toFixed(2)}/kg (was $${prevPrice.toFixed(2)}/kg). Expect your flight costs to adjust accordingly.`,
          });
        }
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
          registration: generateRegistrationForHub(airline.headquarters, airline.fleet.map((a) => a.registration)),
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

        // New airframe joins the shared pool → re-dispatch (it may cover a short-staffed
        // route) and refresh the continuous accrual plan immediately.
        get().dispatchFleet();

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

        // Single atomic update: remove the aircraft from the fleet and apply the
        // financial effects. Routes keep their type id — dispatchFleet() below
        // re-evaluates the shared pool around the missing airframe. (The old code
        // compared r.aircraftId === aircraft.id, but routes store a TYPE id, so it
        // never matched.)
        set({
          airline: {
            ...airline,
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

        // Fleet size changed → re-dispatch (releases/reassigns around the missing aircraft)
        // and refresh the continuous accrual plan immediately.
        get().dispatchFleet();

        return {
          success: true,
          message: `${aircraft.registration} sold for ${formatCurrency(finalSalePrice, currency)}`,
        };
      },

      // Automatic fleet dispatch — planning logic lives in utils/fleetDispatcher.ts.
      // Routes reference an AIRCRAFT TYPE (route.aircraftId = type id); the physical
      // airframes covering a route come from the shared per-type pool. This action is
      // idempotent: when nothing changed it only refreshes the weekly plan.
      dispatchFleet: () => {
        const state = get();
        const airline = state.airline;
        if (!airline) return null;

        const plan = computeDispatchPlan({
          hubIata: airline.headquarters,
          routes: airline.routes,
          fleet: airline.fleet,
          resolvePath: (r) => resolveRoutePathAirports(r),
          fuelPricePerKg: state.world.fuelPrice,
          cash: airline.finances.cash,
        });

        if (!plan.changed) {
          // No assignments moved — still refresh the plan so economics track staffing.
          get().settleWeeklyRoutes({ boundary: false });
          return { dispatched: 0, released: 0, shortfalls: plan.shortfalls, totalPositionCost: 0 };
        }

        // Single atomic update: apply assignment/positioning changes and charge the
        // one-time positioning costs (one-off operating expense).
        set({
          airline: {
            ...airline,
            fleet: airline.fleet.map((a) => {
              if (!plan.assignments.has(a.id)) return a;
              const target = plan.assignments.get(a.id)!;
              return {
                ...a,
                assignedRoute: target,
                // Deployed airframes are based at the hub (every loop starts/ends there);
                // released ones return to the hub pool. Live in-flight positions belong
                // to the future simulation layer and will overwrite these per cycle.
                status: (target ? 'in-flight' : 'available') as Aircraft['status'],
                currentLocation: airline.headquarters,
              };
            }),
            finances:
              plan.totalPositionCost > 0
                ? {
                    ...airline.finances,
                    cash: airline.finances.cash - plan.totalPositionCost,
                    totalExpenses: airline.finances.totalExpenses + plan.totalPositionCost,
                    netWorth: airline.finances.netWorth - plan.totalPositionCost,
                  }
                : airline.finances,
          },
        });

        // Staffing changed → refresh the continuous accrual plan immediately.
        get().settleWeeklyRoutes({ boundary: false });

        const currency = state.settings.currencyFormat;
        if (state.settings.notificationsEnabled) {
          const parts: string[] = [];
          if (plan.dispatchedCount > 0) parts.push(`${plan.dispatchedCount} aircraft deployed`);
          if (plan.releasedCount > 0) parts.push(`${plan.releasedCount} returned to the pool`);
          if (plan.totalPositionCost > 0) parts.push(`positioning cost ${formatCurrency(plan.totalPositionCost, currency)}`);
          const hasShortfall = plan.shortfalls.length > 0;
          get().addNotification({
            type: hasShortfall ? 'warning' : 'success',
            title: hasShortfall ? 'Fleet short-staffed' : 'Fleet dispatched',
            message:
              `Automatic dispatch: ${parts.join(', ')}.` +
              (hasShortfall
                ? ` Short-staffed routes: ${plan.shortfalls
                    .map((s) => {
                      const route = airline.routes.find((r) => r.id === s.routeId);
                      const label = route ? getRoutePath(route).join('→') : s.routeId;
                      const typeName = AIRCRAFT_DATABASE.find((t) => t.id === s.typeId)?.name ?? s.typeId;
                      return `${label} ${s.staffed}/${s.required}× ${typeName}`;
                    })
                    .join('; ')}.`
                : ''),
          });
        }

        return {
          dispatched: plan.dispatchedCount,
          released: plan.releasedCount,
          shortfalls: plan.shortfalls,
          totalPositionCost: plan.totalPositionCost,
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
      createRoute: ({ origin, destination, stops = [], aircraftType, frequencyPerWeek }) => {
        const state = get();
        const airline = state.airline;
        if (!airline) return false;

        // Hub policy: every route must begin AND end at the airline's hub.
        if (origin !== airline.headquarters) return false;
        if (destination === origin) return false;

        // Resolve the full loop path: HUB → stops… → destination → back to HUB.
        const pathIatas = getRoutePath({ origin, stops, destination });
        if (new Set(pathIatas).size !== pathIatas.length) return false; // duplicate airport in the loop
        const pathAirports = pathIatas.map((iata) => AIRPORT_DATABASE.find((a) => a.iata === iata));
        if (pathAirports.some((a) => !a)) return false;

        const isMultiHop = stops.length > 0;
        // Direct routes keep the legacy one-way origin→destination distance/flight-time semantics.
        // Multi-hop loops store the total loop distance and full-cycle block time.
        const distanceNm = isMultiHop
          ? calculateLoopDistanceNm(pathAirports as Airport[])
          : calculateRouteDistanceNm(pathAirports[0]!, pathAirports[pathAirports.length - 1]!);
        // Loop demand: average per-leg score (transfer legs between non-hub airports are penalized).
        const demandScore = scoreLoopDemand(pathAirports[0]!, pathAirports as Airport[]);
        const assignedType = aircraftType ? findAircraftById(aircraftType) : undefined;

        // Every leg of the loop must fit within the assigned aircraft's effective range.
        if (assignedType && !checkLoopRange(assignedType, pathAirports as Airport[]).feasible) return false;

        const flightTimeMin = isMultiHop
          ? assignedType
            ? getLoopLegs(pathAirports as Airport[]).reduce(
                (sum, [a, b]) => sum + estimateFlightTimeMinutes(calculateRouteDistanceNm(a, b), assignedType!),
                0
              )
            : undefined
          : assignedType
            ? estimateFlightTimeMinutes(distanceNm, assignedType)
            : undefined;

        // Frequency is full loop cycles per week; clamp to what the assigned aircraft can
        // physically complete (cycle time = all legs + turnaround at every airport visited).
        let frequency = Math.max(1, Math.min(28, frequencyPerWeek ?? 7));
        if (assignedType) {
          frequency = Math.min(frequency, maxLoopFrequencyPerWeek(pathAirports as Airport[], assignedType));
        }

        // Weekly timetable: hub-local departure/arrival times for every scheduled cycle.
        // Flight numbers use this route's 1-based position in the routes array.
        const routeId = generateId('route');
        const timetable =
          assignedType && pathAirports.length > 1
            ? generateTimetable(
                routeId,
                airline.routes.length + 1,
                frequency,
                pathAirports as Airport[],
                assignedType,
                airline.iataCode
              )
            : undefined;

        const newRoute: Route = {
          id: routeId,
          origin,
          destination,
          ...(isMultiHop ? { stops } : {}),
          isActive: true,
          frequency,
          aircraftId: aircraftType ?? '',
          schedule: [],
          avgLoadFactor: 0,
          revenue: 0,
          cost: 0,
          profitability: 0,
          distanceNm,
          flightTimeMin,
          demandScore,
          timetable,
        };

        set({
          airline: {
            ...airline,
            routes: [...airline.routes, newRoute],
          },
        });

        // New route may need aircraft → re-dispatch and refresh the plan immediately.
        get().dispatchFleet();

        return true;
      },

      updateRoute: (routeId, { frequency, aircraftType, isActive }) => {
        const state = get();
        const airline = state.airline;
        if (!airline) return false;
        const route = airline.routes.find((r) => r.id === routeId);
        if (!route) return false;

        let next: Route = { ...route };

        if (frequency !== undefined) {
          const f = Math.round(frequency);
          if (!Number.isFinite(f) || f < 1 || f > 28) return false;
          next.frequency = f;
        }

        if (aircraftType !== undefined) {
          const type = findAircraftById(aircraftType);
          if (!type) return false;
          next.aircraftId = aircraftType;
          // The new type must fit EVERY leg of the loop — otherwise the route could
          // never operate, so reject the change instead of persisting a broken state.
          const feasibilityPath = resolveRoutePathAirports(next);
          if (feasibilityPath && !checkLoopRange(type, feasibilityPath).feasible) return false;
          // Recompute block time for the new aircraft on this route.
          const pathAirports = resolveRoutePathAirports(next);
          if (pathAirports && (next.stops?.length ?? 0) > 0) {
            // Multi-hop loop: full-cycle block time across all legs.
            next.flightTimeMin = getLoopLegs(pathAirports).reduce(
              (sum, [a, b]) => sum + estimateFlightTimeMinutes(calculateRouteDistanceNm(a, b), type),
              0
            );
          } else if (route.distanceNm) {
            next.flightTimeMin = estimateFlightTimeMinutes(route.distanceNm, type);
          }
        }

        // Re-clamp frequency to what the route's aircraft can physically complete per week.
        const finalType = findAircraftById(next.aircraftId);
        if (finalType) {
          const pathAirports = resolveRoutePathAirports(next);
          if (pathAirports) {
            next.frequency = Math.min(next.frequency, maxLoopFrequencyPerWeek(pathAirports, finalType));
          } else if (next.distanceNm) {
            next.frequency = Math.min(next.frequency, maxFrequencyPerWeek(next.distanceNm, finalType));
          }
        }

        if (isActive !== undefined) {
          next.isActive = isActive;
        }

        // Regenerate the weekly timetable when frequency/aircraft changed (or it's missing).
        const timetablePath = resolveRoutePathAirports(next);
        const timetableType = findAircraftById(next.aircraftId);
        if (timetablePath && timetableType && needsTimetableRegeneration(next, timetablePath, timetableType)) {
          next = {
            ...next,
            timetable: generateTimetable(
              routeId,
              airline.routes.findIndex((r) => r.id === routeId) + 1,
              next.frequency,
              timetablePath,
              timetableType,
              airline.iataCode
            ),
          };
        }

        set({
          airline: {
            ...airline,
            routes: airline.routes.map((r) => (r.id === routeId ? next : r)),
          },
        });

        // Type/frequency may have changed → re-dispatch (rebalance the pool) and refresh.
        get().dispatchFleet();

        return true;
      },

      cancelRoute: (routeId) => {
        const state = get();
        const airline = state.airline;
        if (!airline) return false;
        const route = airline.routes.find((r) => r.id === routeId);
        if (!route) return false;

        set({
          airline: {
            ...airline,
            routes: airline.routes.filter((r) => r.id !== routeId),
          },
        });

        // Freed capacity returns to the pool → re-dispatch and refresh finances.
        get().dispatchFleet();

        return true;
      },

      // Hub policy enforcement — cancels legacy routes that don't originate at the hub.
      enforceHubRoutes: () => {
        const state = get();
        const airline = state.airline;
        if (!airline) return 0;

        const nonCompliant = airline.routes.filter((r) => r.origin !== airline.headquarters);
        if (nonCompliant.length === 0) return 0;

        set({
          airline: {
            ...airline,
            routes: airline.routes.filter((r) => r.origin === airline.headquarters),
          },
        });

        // Re-plan so revenue reflects only hub-based operations (and re-dispatch,
        // since the cancelled routes' aircraft return to the pool).
        get().dispatchFleet();

        get().addNotification({
          title: 'Hub network policy applied',
          message: `${nonCompliant.length} route${nonCompliant.length > 1 ? 's' : ''} cancelled — all routes must now begin and end at your hub (${airline.headquarters}).`,
          type: 'warning',
        });

        return nonCompliant.length;
      },

      // Weekly operations plan (Phase 4b) — recomputes this week's projected revenue/costs via the
      // route engine and stores them in finances.weeklyPlan. Does NOT apply a lump sum to cash:
      // the game loop streams it into cash continuously via accrueFinances() as time passes.
      // At real week boundaries (default) it also advances the load-factor ramp, moves the fuel
      // market, and notifies; mid-week refreshes pass { boundary: false }.
      settleWeeklyRoutes: (options?) => {
        const boundary = options?.boundary !== false;
        const state = get();
        const airline = state.airline;
        if (!airline) return null;

        // At a real week boundary, move the fuel market first so this week's plan uses the current price.
        if (boundary) get().updateFuelPrice();
        const fuelPricePerKg = get().world.fuelPrice;

        // No routes at all: nothing operates, so stream no cash and clear any stale plan.
        if (airline.routes.length === 0) {
          set({ airline: { ...airline, finances: { ...airline.finances, weeklyPlan: { revenue: 0, costs: 0 } } } });
          return null;
        }

        const currency = state.settings.currencyFormat;
        let totalRevenue = 0;
        let totalCosts = 0;
        let settledRoutes = 0;

        // Competitor pressure: combined market share of all competitors, as a fraction (0-1).
        const competitionShare = Math.min(
          1,
          (state.world.competitorAirlines ?? []).reduce((sum, c) => sum + (c.marketShare || 0), 0) / 100
        );

        // Aircraft utilization: total weekly CYCLE hours needed per type (both legs + turnarounds)
        // vs. fleet capacity of DAILY_DUTY_HOURS per aircraft per day. Only USABLE airframes
        // (available or in-flight) count toward capacity — grounded/maintenance/parked/unsold
        // aircraft cannot fly, so a fully grounded type earns nothing this week.
        const usableCountByType = new Map<string, number>();
        for (const ac of airline.fleet ?? []) {
          if (ac.status === 'available' || ac.status === 'in-flight') {
            usableCountByType.set(ac.typeId, (usableCountByType.get(ac.typeId) ?? 0) + 1);
          }
        }
        const neededHoursByType = new Map<string, number>();
        for (const route of airline.routes) {
          if (!route.isActive || !route.aircraftId) continue;
          const type = findAircraftById(route.aircraftId);
          if (!type || !route.distanceNm) continue;
          // Full loop cycle hours: all legs + turnaround at every airport visited.
          const pathAirports = resolveRoutePathAirports(route);
          const cycleHours = (pathAirports ? getLoopCycleMinutes(pathAirports, type) : getRouteCycleMinutes(route.distanceNm, type)) / 60;
          neededHoursByType.set(
            route.aircraftId,
            (neededHoursByType.get(route.aircraftId) ?? 0) + route.frequency * cycleHours
          );
        }
        const utilizationFactor = (typeId: string): number => {
          const needed = neededHoursByType.get(typeId) ?? 0;
          if (needed <= 0) return 1;
          // The shared pool of usable airframes must cover the combined workload of all
          // routes of this type; when it can't, operations scale down proportionally —
          // and with zero usable aircraft the type simply doesn't operate.
          const usable = usableCountByType.get(typeId) ?? 0;
          if (usable === 0) return 0;
          const capacity = usable * DAILY_DUTY_HOURS * 7;
          return Math.min(1, capacity / needed);
        };

        const updatedRoutes = airline.routes.map((route) => {
          if (!route.isActive) return route;

          const originAirport = AIRPORT_DATABASE.find((a) => a.iata === route.origin);
          const destAirport = AIRPORT_DATABASE.find((a) => a.iata === route.destination);
          const aircraftType = findAircraftById(route.aircraftId);
          if (!originAirport || !destAirport || !aircraftType) return route;

          // Project one week of operations using the route engine's economics model.
          // Load factor ramps up with weeks in service, is reduced by competition and nudged by reputation.
          const weeksSoFar = route.weeksActive ?? 0;
          // Closed hub loop: project every leg of HUB → stops… → DEST → HUB each cycle.
          // Falls back to the legacy point-to-point model if any airport in the path is unknown.
          const pathAirports = resolveRoutePathAirports(route);
          const economics = pathAirports
            ? previewLoopEconomics(pathAirports, aircraftType, route.frequency, fuelPricePerKg, {
                weeksActive: weeksSoFar, // ramp-up based on how long the route has been operating so far
                competitionShare,
                reputation: airline.reputation ?? 50,
              })
            : previewRouteEconomics(originAirport, destAirport, aircraftType, route.frequency, fuelPricePerKg, {
                weeksActive: weeksSoFar, // ramp-up based on how long the route has been operating so far
                competitionShare,
                reputation: airline.reputation ?? 50,
              });

          // If this type's fleet is over-committed across routes, scale operations down.
          const utilization = utilizationFactor(route.aircraftId);
          const revenue = Math.round(economics.weeklyRevenue * utilization);
          const costs = Math.round(economics.weeklyCosts * utilization);
          totalRevenue += revenue;
          totalCosts += costs;
          settledRoutes++;

          // Mid-week refresh: keep the card's projected numbers current without touching the ramp.
          if (!boundary) {
            return { ...route, revenue, cost: costs, profitability: revenue - costs };
          }

          // Week boundary: smooth the load factor toward the engine estimate and advance the ramp.
          const prevLoadFactor = route.avgLoadFactor || 0;
          const avgLoadFactor =
            prevLoadFactor === 0 ? economics.estLoadFactor : prevLoadFactor * 0.7 + economics.estLoadFactor * 0.3;

          return {
            ...route,
            revenue,
            cost: costs,
            profitability: revenue - costs,
            avgLoadFactor,
            weeksActive: Math.min(weeksSoFar + 1, 104), // cap so the ramp-up saturates
          };
        });

        // Fixed fleet costs: every owned aircraft incurs maintenance/depreciation/insurance each week,
        // whether or not it is assigned to a route.
        for (const ac of airline.fleet ?? []) {
          const type = findAircraftById(ac.typeId);
          if (type) totalCosts += getAircraftWeeklyFixedCosts(type);
        }

        const totalProfit = totalRevenue - totalCosts;

        // Store the plan so accrueFinances() can stream this week's economics into cash.
        // No lump-sum cash change happens here — cash now moves continuously per tick.
        set({
          airline: {
            ...airline,
            routes: updatedRoutes,
            finances: {
              ...airline.finances,
              weeklyPlan: { revenue: totalRevenue, costs: totalCosts },
            },
          },
        });

        if (boundary && state.settings.notificationsEnabled && settledRoutes > 0) {
          get().addNotification({
            type: totalProfit >= 0 ? 'success' : 'warning',
            title: 'Weekly operations plan',
            message: `${settledRoutes} route${settledRoutes === 1 ? '' : 's'} in operation — projected weekly revenue ${formatCurrency(totalRevenue, currency)}, costs (incl. fleet fixed costs) ${formatCurrency(totalCosts, currency)}, net ${totalProfit >= 0 ? 'profit' : 'loss'} of ${formatCurrency(Math.abs(totalProfit), currency)}. Cash accrues continuously as time passes.`,
          });
        }

        return { settledRoutes, totalRevenue, totalCosts, totalProfit };
      },

      // Continuous cash accrual (Phase 4b) — called by the game loop every tick with the in-game
      // milliseconds that elapsed since the last tick. Applies that fraction of the current weekly
      // plan to cash/revenue/expenses so they move as days pass instead of jumping at week boundaries.
      accrueFinances: (gameMsAdvanced) => {
        if (!(gameMsAdvanced > 0)) return;
        let airline = get().airline;
        if (!airline) return;

        // Lazy initialization: fresh saves have no plan yet — compute one without boundary side effects.
        let plan = airline.finances.weeklyPlan;
        if (!plan) {
          get().settleWeeklyRoutes({ boundary: false });
          airline = get().airline;
          if (!airline) return;
          plan = airline.finances.weeklyPlan;
          if (!plan) return;
        }
        if (plan.revenue === 0 && plan.costs === 0) return;

        const fraction = Math.min(gameMsAdvanced, WEEK_MS) / WEEK_MS; // clamp so a huge tick can't accrue more than one week
        const revenue = plan.revenue * fraction;
        const costs = plan.costs * fraction;
        const net = revenue - costs;

        set({
          airline: {
            ...airline,
            finances: {
              ...airline.finances,
              cash: airline.finances.cash + net,
              totalRevenue: airline.finances.totalRevenue + revenue,
              totalExpenses: airline.finances.totalExpenses + costs,
              profit: airline.finances.profit + net,
              netWorth: airline.finances.netWorth + net,
            },
          },
        });
      },

      // Monthly loan servicing (Phase 4c) — deducts each active loan's monthly payment.
      settleMonthlyLoans: () => {
        const state = get();
        const airline = state.airline;
        if (!airline) return null;

        const loans = airline.finances.loans ?? [];
        const activeCount = loans.filter((l) => l.remainingBalance > 0).length;
        if (activeCount === 0) return { settledPayments: 0, totalPaid: 0 };

        const currency = state.settings.currencyFormat;
        let totalPaid = 0;
        let settledPayments = 0;
        const updatedLoans = loans.map((loan) => {
          if (loan.remainingBalance <= 0) return loan;
          const payment = Math.min(loan.monthlyPayment, loan.remainingBalance);
          totalPaid += payment;
          settledPayments++;
          return { ...loan, remainingBalance: Math.max(0, loan.remainingBalance - payment) };
        });

        set({
          airline: {
            ...airline,
            finances: {
              ...airline.finances,
              cash: airline.finances.cash - totalPaid,
              liabilities: Math.max(0, airline.finances.liabilities - totalPaid),
              loans: updatedLoans,
            },
          },
        });

        if (state.settings.notificationsEnabled && settledPayments > 0) {
          get().addNotification({
            type: 'info',
            title: 'Monthly loan payments processed',
            message: `${settledPayments} payment${settledPayments === 1 ? '' : 's'} totaling ${formatCurrency(totalPaid, currency)} deducted from your cash balance.`,
          });
        }

        // Insolvency warning when the cash balance goes negative.
        if (airline.finances.cash - totalPaid < 0) {
          get().addNotification({
            type: 'error',
            title: 'Cash balance is negative!',
            message: `Your airline is out of money (${formatCurrency(airline.finances.cash - totalPaid, currency)}). Sell aircraft or cut routes before you go bankrupt.`,
          });
        }

        return { settledPayments, totalPaid };
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
      // Old saves predate route timetables: regenerate any missing/stale ones after rehydration.
      onRehydrateStorage: () => (state) => {
        if (state?.airline?.routes?.length) {
          setTimeout(regenerateMissingTimetables, 0);
        }
      },
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

// Lazy timetable migration: older saves predate route timetables. Regenerates any
// missing/stale timetables once, after the persisted state has been rehydrated.
function regenerateMissingTimetables(): void {
  const state = useGameStore.getState();
  const airline = state.airline;
  if (!airline || airline.routes.length === 0) return;

  let changed = false;
  const routes = airline.routes.map((route, index) => {
    const type = findAircraftById(route.aircraftId);
    const path = resolveRoutePathAirports(route);
    if (type && path && needsTimetableRegeneration(route, path, type)) {
      changed = true;
      return {
        ...route,
        timetable: generateTimetable(route.id, index + 1, route.frequency, path, type, airline.iataCode),
      };
    }
    return route;
  });

  if (changed) {
    useGameStore.setState({ airline: { ...airline, routes } });
  }
}