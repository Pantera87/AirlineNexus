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
  StaffMember,
  MonthlyReport,
  FinanceHistoryPoint,
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
  DAILY_DUTY_HOURS,
  getRoutePath,
  calculateLoopDistanceNm,
  scoreLoopDemand,
  checkLoopRange,
  maxLoopFrequencyPerWeek,
  getLoopLegs,
  previewLoopEconomics,
} from '@/utils/routeEngine';
import { computeDispatchPlan } from '@/utils/fleetDispatcher';
import type { RouteStaffing } from '@/utils/fleetDispatcher';
import { computeCrewPlan, getCrewCoverageFactor, typeWeeklyCycleHours } from '@/utils/crewDispatcher';
import { appendDutyWeek, isFlyingCrewRole, weekStartIsoOf } from '@/utils/crewRegulations';
import {
  applyPromotion,
  convertTypeRating as applyTypeConversion,
  settleMonthlyPayroll,
  accrueWeeklyFlyingHours,
  getPromotionEligibility,
  backfillMissingStaffProfiles,
} from '@/utils/staffEngine';
import { generateTimetable, needsTimetableRegeneration } from '@/utils/timetable';
import { GameTimeRepository } from '@/database/repositories/gameTime.repository';

// In-game milliseconds per week (one in-game day is 24 hours of simulated time).
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Average number of weeks in an in-game month (52 weeks / 12 months). */
export const WEEKS_PER_MONTH = 52 / 12;

/** Max points kept in the weekly finance history log. */
const FINANCE_HISTORY_CAP = 52;

/** Append a point to the weekly finance history log, keeping the cap (most recent last). */
function pushFinanceHistory(
  history: FinanceHistoryPoint[] | undefined,
  point: FinanceHistoryPoint
): FinanceHistoryPoint[] {
  return [...(history ?? []), point].slice(-FINANCE_HISTORY_CAP);
}

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
  units: 'imperial',
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

  // Staff management (My Staff / Hiring screens)
  hireStaff: (candidate: Omit<StaffMember, 'id' | 'startDate'>) => { success: boolean; message: string };
  fireStaff: (staffId: string) => { success: boolean; message: string };
  promoteStaff: (staffId: string) => { success: boolean; message: string };
  convertTypeRating: (staffId: string, newTypeId: string) => { success: boolean; message: string };
  /** Apply the pure crew plan (utils/crewDispatcher) to staff assignments. */
  dispatchCrew: () => { staffed: number; released: number } | null;
  /** Monthly payroll + morale update + reduced-wage reversion (game loop, month boundaries). */
  settleMonthlySalaries: () => { totalSalary: number; headCount: number; reversionCount: number } | null;

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
    fareMultiplier?: number; // player-set fare as a multiple of the model's recommended price (clamped 0.5–2.0)
  }) => boolean;
  updateRoute: (
    routeId: string,
    updates: { frequency?: number; aircraftType?: string; isActive?: boolean; fareMultiplier?: number }
  ) => boolean;
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

  // Monthly report (Phase 4d) — called by the game loop on month boundaries. Builds a
  // MonthlyReport from the revenue/expenses accrued during the month that just ended
  // (finances.monthlyAccrual) and appends it to finances.monthlyReports.
  generateMonthlyReport: () => MonthlyReport | null;

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
          businessModel: airline.businessModel,
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

      // --- Staff management ----------------------------------------------------
      // Pure planning logic lives in utils/staffEngine.ts + utils/crewDispatcher.ts;
      // these actions validate against game state, apply the results, and notify.

      hireStaff: (candidate) => {
        const state = get();
        const airline = state.airline;
        if (!airline) return { success: false, message: 'No active airline' };

        const member: StaffMember = {
          ...candidate,
          id: generateId('staff'),
          startDate: new Date(state.currentDate),
        };

        set({
          airline: {
            ...airline,
            staff: [...(airline.staff ?? []), member],
          },
        });

        // A new hire may immediately fill a crew gap — re-dispatch crew.
        get().dispatchCrew();

        return { success: true, message: `${member.name} joined as ${member.role}.` };
      },

      fireStaff: (staffId) => {
        const state = get();
        const currency = state.settings.currencyFormat;
        const airline = state.airline;
        if (!airline) return { success: false, message: 'No active airline' };

        const staff = airline.staff ?? [];
        const member = staff.find((m) => m.id === staffId);
        if (!member) return { success: false, message: 'Staff member not found' };

        // Severance: one month's salary, only if we can pay it out of cash.
        const severance = member.salary;
        if (airline.finances.cash < severance) {
          return {
            success: false,
            message: `Insufficient funds for severance (${formatCurrency(severance, currency)}). Cash: ${formatCurrency(airline.finances.cash, currency)}.`,
          };
        }

        set({
          airline: {
            ...airline,
            staff: staff.filter((m) => m.id !== staffId),
            finances: {
              ...airline.finances,
              cash: airline.finances.cash - severance,
              totalExpenses: airline.finances.totalExpenses + severance,
              netWorth: airline.finances.netWorth - severance,
            },
          },
        });

        get().dispatchCrew(); // freed slots may be re-staffed

        return { success: true, message: `${member.name} was let go (severance ${formatCurrency(severance, currency)}).` };
      },

      promoteStaff: (staffId) => {
        const state = get();
        const currency = state.settings.currencyFormat;
        const airline = state.airline;
        if (!airline) return { success: false, message: 'No active airline' };

        const staff = airline.staff ?? [];
        const member = staff.find((m) => m.id === staffId);
        if (!member) return { success: false, message: 'Staff member not found' };

        const eligibility = getPromotionEligibility(member);
        if (!eligibility) return { success: false, message: 'No promotion path for this role.' };
        if (!eligibility.eligible) return { success: false, message: `Not eligible: ${eligibility.reasons.join('; ')}.` };
        if (airline.finances.cash < eligibility.cost) {
          return {
            success: false,
            message: `Insufficient funds for the promotion fee (${formatCurrency(eligibility.cost, currency)}).`,
          };
        }

        const promoted = applyPromotion(member, eligibility.newRole);
        set({
          airline: {
            ...airline,
            staff: staff.map((m) => (m.id === staffId ? promoted : m)),
            finances: {
              ...airline.finances,
              cash: airline.finances.cash - eligibility.cost,
              totalExpenses: airline.finances.totalExpenses + eligibility.cost,
              netWorth: airline.finances.netWorth - eligibility.cost,
            },
          },
        });

        // A promoted pilot's old crew slot is now vacant — re-dispatch.
        get().dispatchCrew();

        if (state.settings.notificationsEnabled) {
          get().addNotification({
            type: 'success',
            title: 'Promotion',
            message: `${promoted.name} was promoted to ${eligibility.newRole} (fee ${formatCurrency(eligibility.cost, currency)}).`,
          });
        }

        return { success: true, message: `${promoted.name} promoted to ${eligibility.newRole}.` };
      },

      convertTypeRating: (staffId, newTypeId) => {
        const state = get();
        const currency = state.settings.currencyFormat;
        const airline = state.airline;
        if (!airline) return { success: false, message: 'No active airline' };

        const staff = airline.staff ?? [];
        const member = staff.find((m) => m.id === staffId);
        if (!member) return { success: false, message: 'Staff member not found' };

        const result = applyTypeConversion(member, newTypeId);
        if (!result.ok) return { success: false, message: result.reason };
        if (airline.finances.cash < result.cost) {
          return {
            success: false,
            message: `Insufficient funds for the type rating (${formatCurrency(result.cost, currency)}).`,
          };
        }

        const updated = result.updated!;
        set({
          airline: {
            ...airline,
            staff: staff.map((m) => (m.id === staffId ? updated : m)),
            finances: {
              ...airline.finances,
              cash: airline.finances.cash - result.cost,
              totalExpenses: airline.finances.totalExpenses + result.cost,
              netWorth: airline.finances.netWorth - result.cost,
            },
          },
        });

        // The rating changed — re-run the crew plan so the pilot is matched to
        // aircraft they can (now) fly.
        get().dispatchCrew();

        const typeName = AIRCRAFT_DATABASE.find((t) => t.id === newTypeId)?.name ?? newTypeId;
        if (state.settings.notificationsEnabled) {
          get().addNotification({
            type: 'success',
            title: 'Type rating acquired',
            message: `${updated.name} is now rated for the ${typeName} (${formatCurrency(result.cost, currency)}).`,
          });
        }

        return { success: true, message: `${updated.name} rated for ${typeName}.` };
      },

      dispatchCrew: () => {
        const state = get();
        const airline = state.airline;
        if (!airline) return null;

        const staff = airline.staff ?? [];
        const plan = computeCrewPlan(staff, airline.fleet ?? [], airline.routes ?? []);
        if (!plan.changed) return { staffed: 0, released: 0 };

        const nextStaff = staff.map((m) => {
          if (!plan.assignments.has(m.id)) return m;
          return { ...m, assignedAircraft: plan.assignments.get(m.id)! };
        });

        set({
          airline: {
            ...airline,
            staff: nextStaff,
          },
        });

        // Manning changed → route economics (coverage factor) must be refreshed.
        get().settleWeeklyRoutes({ boundary: false });

        return { staffed: plan.totalStaffed, released: plan.totalReleased };
      },

      settleMonthlySalaries: () => {
        const state = get();
        const currency = state.settings.currencyFormat;
        const airline = state.airline;
        if (!airline) return null;

        const staff = airline.staff ?? [];
        if (staff.length === 0) return { totalSalary: 0, headCount: 0, reversionCount: 0 };

        const { staff: nextStaff, totalSalary, reversionCount } = settleMonthlyPayroll(staff, state.currentDate);

        set({
          airline: {
            ...airline,
            staff: nextStaff,
            finances: {
              ...airline.finances,
              cash: airline.finances.cash - totalSalary,
              totalExpenses: airline.finances.totalExpenses + totalSalary,
              netWorth: airline.finances.netWorth - totalSalary,
            },
          },
        });

        if (state.settings.notificationsEnabled) {
          const parts = [
            `${staff.length} staff member${staff.length === 1 ? '' : 's'} paid ${formatCurrency(totalSalary, currency)}`,
          ];
          if (reversionCount > 0) {
            parts.push(`${reversionCount} reduced-wage period${reversionCount === 1 ? '' : 's'} reverted to full market wage`);
          }
          get().addNotification({
            type: airline.finances.cash - totalSalary < 0 ? 'warning' : 'info',
            title: 'Monthly salaries paid',
            message: `${parts.join('. ')}.`,
          });
        }

        return { totalSalary, headCount: staff.length, reversionCount };
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
      createRoute: ({ origin, destination, stops = [], aircraftType, frequencyPerWeek, fareMultiplier }) => {
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

        // Per-route ticket price: the player prices fares as a multiple of the airline's
        // business-model recommended (revenue-maximizing) price — clamped to 50%–200%.
        const fareMult =
          fareMultiplier !== undefined
            ? Math.min(2, Math.max(0.5, Number.isFinite(fareMultiplier) ? fareMultiplier : 1))
            : 1;

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
          fareMultiplier: fareMult,
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

      updateRoute: (routeId, { frequency, aircraftType, isActive, fareMultiplier }) => {
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

        // Per-route ticket price: clamped to 50%–200% of the model's recommended price.
        if (fareMultiplier !== undefined) {
          const m = Number.isFinite(fareMultiplier) ? fareMultiplier : 1;
          next.fareMultiplier = Math.min(2, Math.max(0.5, m));
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
          set({
            airline: {
              ...airline,
              finances: {
                ...airline.finances,
                weeklyPlan: { revenue: 0, costs: 0 },
                ...(boundary
                  ? { history: pushFinanceHistory(airline.finances.history, { date: state.currentDate.toISOString(), cash: airline.finances.cash, revenue: 0, costs: 0 }) }
                  : {}),
              },
            },
          });
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
        // Weekly CYCLE-hours each type's routes demand — shared with the Staff
        // screen's workload-sized crew requirements (utils/crewDispatcher).
        const neededHoursByType = typeWeeklyCycleHours(airline.routes);
        // Crew manning: under-crewed types can't fly — their operations scale down by the
        // coverage factor: pilot-pair coverage (pilots are type-specific) × the fleet-wide
        // purser/cabin-crew pool coverage (cabin crew can fly any type).
        const crewPlan = computeCrewPlan(airline.staff ?? [], airline.fleet ?? [], airline.routes ?? []);
        const utilizationFactor = (typeId: string): number => {
          const needed = neededHoursByType.get(typeId) ?? 0;
          if (needed <= 0) return 1;
          // The shared pool of usable airframes must cover the combined workload of all
          // routes of this type; when it can't, operations scale down proportionally —
          // and with zero usable aircraft the type simply doesn't operate.
          const usable = usableCountByType.get(typeId) ?? 0;
          if (usable === 0) return 0;
          const capacity = usable * DAILY_DUTY_HOURS * 7;
          const fleetFactor = Math.min(1, capacity / needed);
          return fleetFactor * getCrewCoverageFactor(crewPlan, typeId);
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
                model: airline.businessModel,
                fareMultiplier: route.fareMultiplier,
              })
            : previewRouteEconomics(originAirport, destAirport, aircraftType, route.frequency, fuelPricePerKg, {
                weeksActive: weeksSoFar, // ramp-up based on how long the route has been operating so far
                competitionShare,
                reputation: airline.reputation ?? 50,
                model: airline.businessModel,
                fareMultiplier: route.fareMultiplier,
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
        // whether or not it is assigned to a route. An engineer staffing shortfall raises
        // maintenance costs (each missing engineer adds up to 10%, capped at +50%).
        const engineerPenalty = 1 + Math.min(0.5, crewPlan.engineerShortfall * 0.1);
        for (const ac of airline.fleet ?? []) {
          const type = findAircraftById(ac.typeId);
          if (type) totalCosts += getAircraftWeeklyFixedCosts(type) * engineerPenalty;
        }

        const totalProfit = totalRevenue - totalCosts;

        // Weekly flying-hours accrual (real week boundaries only): each aircraft
        // type's flying crew (pilots + cabin crew) share that type's required
        // cycle hours, capped per person by the weekly crew-time regulation limit.
        let staffWithHours: StaffMember[] | null = null;
        if (boundary) {
          const staff = airline.staff ?? [];
          const weekStartIso = weekStartIsoOf(state.currentDate);
          const staffedIdsByType = new Map<string, Set<string>>();
          for (const m of staff) {
            if (!isFlyingCrewRole(m.role)) continue;
            const ac = (airline.fleet ?? []).find((a) => a.id === m.assignedAircraft);
            if (!ac) continue;
            const ids = staffedIdsByType.get(ac.typeId) ?? new Set<string>();
            ids.add(m.id);
            staffedIdsByType.set(ac.typeId, ids);
          }
          const updatedById = new Map<string, StaffMember>();
          for (const [typeId, hours] of neededHoursByType) {
            const ids = staffedIdsByType.get(typeId);
            if (!ids || hours <= 0) continue;
            const crew = staff.filter((m) => ids.has(m.id));
            for (const u of accrueWeeklyFlyingHours(crew, hours, weekStartIso)) updatedById.set(u.id, u);
          }
          // Record the week (0 h) for every other flying crew member so their rolling
          // 7/14/28-day and 12-month windows slide forward over rest weeks — otherwise
          // a crew member who maxed a limit would stay on mandatory rest forever.
          for (const m of staff) {
            if (!isFlyingCrewRole(m.role) || updatedById.has(m.id)) continue;
            updatedById.set(m.id, appendDutyWeek(m, 0, weekStartIso));
          }
          staffWithHours = staff.map((m) => updatedById.get(m.id) ?? m);
        }

        // Store the plan so accrueFinances() can stream this week's economics into cash.
        // No lump-sum cash change happens here — cash now moves continuously per tick.
        // At real boundaries, also append the weekly finance history point (cash + plan).
        set({
          airline: {
            ...airline,
            routes: updatedRoutes,
            ...(staffWithHours ? { staff: staffWithHours } : {}),
            finances: {
              ...airline.finances,
              weeklyPlan: { revenue: totalRevenue, costs: totalCosts },
              ...(boundary
                ? { history: pushFinanceHistory(airline.finances.history, { date: state.currentDate.toISOString(), cash: airline.finances.cash, revenue: totalRevenue, costs: totalCosts }) }
                : {}),
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
        const monthlyAccrual = airline.finances.monthlyAccrual ?? { revenue: 0, expenses: 0 };

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
              // Running month totals (Phase 4d) — consumed by generateMonthlyReport() at month boundaries.
              monthlyAccrual: { revenue: monthlyAccrual.revenue + revenue, expenses: monthlyAccrual.expenses + costs },
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

      // Monthly report (Phase 4d) — called by the game loop on month boundaries. Builds a
      // MonthlyReport from the revenue/expenses accrued during the month that just ended
      // (finances.monthlyAccrual, maintained by accrueFinances) plus route-level load factor
      // and passenger estimates, then appends it to finances.monthlyReports (capped at 24).
      generateMonthlyReport: () => {
        const state = get();
        const airline = state.airline;
        if (!airline) return null;

        const accrual = airline.finances.monthlyAccrual ?? { revenue: 0, expenses: 0 };
        // Nothing accrued this month (no routes operating): skip rather than log a zero report.
        if (accrual.revenue <= 0 && accrual.expenses <= 0) return null;

        const activeRoutes = airline.routes.filter((r) => r.isActive);
        const routeRevenueTotal = activeRoutes.reduce((sum, r) => sum + r.revenue, 0);
        const loadFactor =
          routeRevenueTotal > 0
            ? activeRoutes.reduce((sum, r) => sum + (r.avgLoadFactor || 0) * r.revenue, 0) / routeRevenueTotal
            : activeRoutes.length > 0
              ? activeRoutes.reduce((sum, r) => sum + (r.avgLoadFactor || 0), 0) / activeRoutes.length
              : 0;

        // Monthly passenger estimate: seats × load factor × legs × frequency, scaled to a month.
        let weeklyPassengers = 0;
        for (const r of activeRoutes) {
          const type = findAircraftById(r.aircraftId);
          if (!type) continue;
          const legs = (r.stops?.length ?? 0) + 2; // hub→…→dest→hub: one return leg per outward leg
          weeklyPassengers += type.maxPassengers * (r.avgLoadFactor || 0) * legs * r.frequency;
        }

        // The boundary date is the first moment of the NEW month — the report covers the month just ended.
        const now = new Date(state.currentDate);
        const month = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const report: MonthlyReport = {
          month,
          revenue: Math.round(accrual.revenue),
          expenses: Math.round(accrual.expenses),
          profit: Math.round(accrual.revenue - accrual.expenses),
          passengerCount: Math.round(weeklyPassengers * WEEKS_PER_MONTH),
          loadFactor,
          // No per-flight punctuality simulation exists yet — proxy with the airline's reputation.
          onTimePerformance: Math.round(Math.min(99, Math.max(50, airline.reputation ?? 75))),
        };

        set({
          airline: {
            ...airline,
            finances: {
              ...airline.finances,
              monthlyReports: [...(airline.finances.monthlyReports ?? []), report].slice(-24),
              monthlyAccrual: { revenue: 0, expenses: 0 },
            },
          },
        });

        if (state.settings.notificationsEnabled) {
          get().addNotification({
            type: report.profit >= 0 ? 'success' : 'warning',
            title: 'Monthly report generated',
            message: `${month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}: revenue ${formatCurrency(report.revenue, state.settings.currencyFormat)}, expenses ${formatCurrency(report.expenses, state.settings.currencyFormat)}, net ${report.profit >= 0 ? 'profit' : 'loss'} of ${formatCurrency(Math.abs(report.profit), state.settings.currencyFormat)}.`,
          });
        }

        return report;
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
      // zustand persist round-trips the store through JSON, so every Date field
      // comes back as an ISO string after a reload. Revive them to real Date
      // objects here, otherwise screens that call Date methods on rehydrated
      // state (e.g. StaffScreen's reduced-wage check calling
      // currentDate.getTime()) crash before the first game tick can repair it.
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...(persistedState as Partial<GameState> | undefined) };
        // Old saves predate new settings keys (e.g. `units`): fill any missing
        // fields with defaults so rehydrated settings are always complete.
        if (merged.settings) {
          merged.settings = { ...defaultSettings, ...merged.settings };
        }
        revivePersistedDates(merged);
        return merged;
      },
      // Old saves predate route timetables: regenerate any missing/stale ones after rehydration.
      onRehydrateStorage: () => (state) => {
        if (state?.airline?.routes?.length) {
          setTimeout(regenerateMissingTimetables, 0);
        }
        if (state?.airline?.staff?.length) {
          setTimeout(seedMissingDutyHistory, 0);
          // After the duty seed: backfill decorative profile fields (age, bio,
          // languages) on saves written before they existed.
          setTimeout(backfillStaffProfiles, 0);
          // After the duty seed: reconcile crew assignments written by older
          // dispatcher versions (see reconcileCrewAssignments below).
          setTimeout(reconcileCrewAssignments, 0);
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

// Date fields are typed as Date in the store but come back as ISO strings after
// JSON rehydration (see the persist merge above). Revive every one of them.
// String-typed dates (finance history, fuel price history) and numeric
// timestamps (reducedWageUntil) are intentionally left untouched.
export function revivePersistedDates(merged: Partial<GameState>): void {
  if (typeof merged.currentDate === 'string') {
    merged.currentDate = new Date(merged.currentDate);
  }

  const airline = merged.airline;
  if (airline) {
    if (typeof airline.founded === 'string') airline.founded = new Date(airline.founded);
    for (const member of airline.staff ?? []) {
      if (member && typeof member.startDate === 'string') member.startDate = new Date(member.startDate);
    }
    for (const aircraft of airline.fleet ?? []) {
      if (typeof aircraft.lastMaintenance === 'string') aircraft.lastMaintenance = new Date(aircraft.lastMaintenance);
      if (typeof aircraft.nextMaintenance === 'string') aircraft.nextMaintenance = new Date(aircraft.nextMaintenance);
    }
    const finances = airline.finances;
    if (finances) {
      for (const report of finances.monthlyReports ?? []) {
        if (typeof report.month === 'string') report.month = new Date(report.month);
      }
      for (const loan of finances.loans ?? []) {
        if (typeof loan.startDate === 'string') loan.startDate = new Date(loan.startDate);
        if (typeof loan.endDate === 'string') loan.endDate = new Date(loan.endDate);
      }
      for (const investment of finances.investments ?? []) {
        if (typeof investment.dateAcquired === 'string') investment.dateAcquired = new Date(investment.dateAcquired);
      }
    }
  }

  const world = merged.world;
  if (world) {
    for (const regulation of world.regulations ?? []) {
      if (typeof regulation.effectiveDate === 'string') regulation.effectiveDate = new Date(regulation.effectiveDate);
    }
    for (const event of world.activeEvents ?? []) {
      if (typeof event.date === 'string') event.date = new Date(event.date);
    }
  }
}

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

// Lazy crew-regulation migration: saves created before EU-OSL rolling duty tracking
// have no dutyHistory, so the roster's monthly/yearly usage bars stay hidden until
// the next week boundary settlement. Seed a zero-hour record for the current
// (Monday) week so the bars appear immediately; the next boundary settlement then
// merges real flying hours into that same week record.
function seedMissingDutyHistory(): void {
  const state = useGameStore.getState();
  const airline = state.airline;
  if (!airline?.staff?.length || !(state.currentDate instanceof Date)) return;
  const missing = airline.staff.filter(
    (m) => isFlyingCrewRole(m.role) && (!m.dutyHistory || m.dutyHistory.length === 0),
  );
  if (missing.length === 0) return;
  const weekStartIso = weekStartIsoOf(state.currentDate);
  const staff = airline.staff.map((m) => (missing.includes(m) ? appendDutyWeek(m, 0, weekStartIso) : m));
  useGameStore.setState({ airline: { ...airline, staff } });
}

// Lazy staff-profile migration: saves written before the decorative profile
// fields (age, bio, languages) lack them. Generates them once for every member
// missing any of the fields; the result persists, so this runs exactly once
// per old save (no-op afterwards).
function backfillStaffProfiles(): void {
  const state = useGameStore.getState();
  const airline = state.airline;
  if (!airline?.staff?.length) return;
  const { staff, changed } = backfillMissingStaffProfiles(airline.staff);
  if (changed) useGameStore.setState({ airline: { ...airline, staff } });
}

// Lazy crew-dispatch migration: saves written before the workload-based rotation caps can
// still carry the old dispatcher's releases — cabin crew sitting unassigned while the
// staffing report requires them. The dispatcher is otherwise only triggered by HR actions
// (hire/fire/promote/convert), so re-run it once after rehydration to reconcile existing
// rosters immediately. Idempotent: a no-op when the current assignments already match.
export function reconcileCrewAssignments(): void {
  useGameStore.getState().dispatchCrew();
}