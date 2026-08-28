import { create } from 'zustand';
import {
  type AircraftListing,
  PurchaseType,
  ConditionGrade,
  type GameDate,
  type Aircraft,
  type Loan
} from '../types/game';
import { getNewProductionAircraft, getLegacyAircraft } from '../data/aircraft-types';
import { generateRegistrationForHub } from '../data/registrationPrefixes';
import {
  refreshUsedMarketplace,
  getActiveListings as getActiveUsedListings
} from '../data/market-generator';
import { useGameStore } from './gameStore';
import { gameIdForMarketplaceType } from '../data/aircraft';

interface PurchaseConfig {
  type: PurchaseType;
  totalPriceUsd: number; // Price per aircraft
  quantity?: number;     // Number of identical aircraft to purchase (default 1)
  downPaymentPercent?: number;
  loanTermMonths?: number;
  interestRatePercent?: number;
}

interface PurchaseResult {
  success: boolean;
  message: string;
  aircraftId?: string;
  aircraftIds?: string[];
  loanId?: string;
}

interface FleetMarketplaceState {
  // Listings
  newAircraftListings: AircraftListing[];
  usedAircraftListings: AircraftListing[];

  // Filters
  activeFilters: {
    category?: string[];
    manufacturer?: string[];
    priceRange?: [number, number];
    capacityMin?: number;
    rangeMin?: number;

    // Used-specific filters
    conditionGrade?: ConditionGrade[];
    yearBuiltFrom?: number;
    flightHoursMax?: number;
  };

  // UI State
  selectedListingId: string | null;
  activeTab: 'new' | 'used';

  // Actions
  setFilters: (filters: Partial<FleetMarketplaceState['activeFilters']>) => void;
  clearAllFilters: () => void;

  selectListing: (listingId: string) => void;
  closeDetailModal: () => void;

  switchTab: (tab: 'new' | 'used') => void;
  resetMarketplace: () => void;

  purchaseAircraft: (listingId: string, config: PurchaseConfig) => Promise<PurchaseResult>;

  refreshUsedMarketplace: () => void;
}

export const useFleetStore = create<FleetMarketplaceState>((set, get) => ({
  // Initialize listings
  newAircraftListings: [],
  usedAircraftListings: [],

  activeFilters: {
    category: undefined,
    manufacturer: undefined,
    priceRange: undefined,
    capacityMin: undefined,
    rangeMin: undefined,
    conditionGrade: undefined,
    yearBuiltFrom: undefined,
    flightHoursMax: undefined
  },

  selectedListingId: null,
  activeTab: 'new',

  setFilters: (filters) => {
    set((state) => ({
      activeFilters: { ...state.activeFilters, ...filters }
    }));
  },

  clearAllFilters: () => {
    set({
      activeFilters: {
        category: undefined,
        manufacturer: undefined,
        priceRange: undefined,
        capacityMin: undefined,
        rangeMin: undefined,
        conditionGrade: undefined,
        yearBuiltFrom: undefined,
        flightHoursMax: undefined
      }
    });
  },

  selectListing: (listingId) => {
    set({ selectedListingId: listingId });
  },

  closeDetailModal: () => {
    set({ selectedListingId: null });
  },

  switchTab: (tab) => {
    // Switching tabs also dismisses any open detail modal so the grid is
    // never blocked or left showing a listing from the other tab.
    set({ activeTab: tab, selectedListingId: null });
  },

  resetMarketplace: () => {
    // Called when the player enters the marketplace so it always starts
    // on the "Buy New" tab with no stale selection from a previous visit.
    set({ activeTab: 'new', selectedListingId: null });
  },

  purchaseAircraft: async (listingId, config): Promise<PurchaseResult> => {
    try {
      // Find the listing
      const allListings = [...get().newAircraftListings, ...get().usedAircraftListings];
      const listing = allListings.find(l => l.id === listingId);

      if (!listing) {
        return {
          success: false,
          message: 'Listing not found'
        };
      }

      // Check if already purchased
      if (listing.purchased) {
        return {
          success: false,
          message: 'This aircraft has already been purchased'
        };
      }

      // Get game state from gameStore
      const gameState = useGameStore.getState();
      const airline = gameState.airline;

      if (!airline) {
        return {
          success: false,
          message: 'You must start a game before purchasing aircraft'
        };
      }

      const playerCash = airline.finances.cash;
      const totalPrice = config.totalPriceUsd || listing.price;

      // Quantity of identical aircraft to buy. Used listings are single
      // airframes (unique year/hours/condition), so they can only be
      // purchased one at a time; new listings allow up to 20 per order.
      const quantity = Math.max(1, Math.min(Math.round(config.quantity ?? 1), listing.isNew ? 20 : 1));

      // Calculate upfront cash required per aircraft based on purchase type
      let cashRequiredPerAircraft = 0;
      if (config.type === 'Cash') {
        cashRequiredPerAircraft = totalPrice;
      } else if (config.type === 'Loan') {
        const downPaymentPercent = config.downPaymentPercent ?? 20;
        cashRequiredPerAircraft = Math.round(totalPrice * downPaymentPercent / 100);
      }

      // Validate affordability BEFORE creating any loan, so a failed
      // purchase never leaves an orphaned loan inflating liabilities.
      if (playerCash < cashRequiredPerAircraft * quantity) {
        return {
          success: false,
          message: config.type === 'Cash'
            ? 'Insufficient funds for cash purchase'
            : 'Insufficient funds for down payment'
        };
      }

      // Map marketplace aircraftTypeId to the exact AIRCRAFT_DATABASE entry for
      // that airframe (the database covers every marketplace type, so no
      // "closest match" substitution ever changes the aircraft identity).
      const gameId = gameIdForMarketplaceType(listing.aircraftTypeId);
      if (!gameId) {
        return {
          success: false,
          message: 'Unable to process this aircraft type. Please try a different one.'
        };
      }

      // Determine manufacture year and flight hours based on listing type
      const currentYear = gameState.currentDate.getFullYear();
      const manufactureYear = listing.manufactureYear ?? (listing.isNew ? currentYear : undefined);
      const initialFlightHours = listing.totalFlightHours ?? 0;

      // Calculate condition based on listing data
      let condition = 100;
      if (!listing.isNew) {
        // For used aircraft, calculate condition from grade or age/hours
        if (listing.condition) {
          const conditionMap: Record<ConditionGrade, number> = {
            [ConditionGrade.Excellent]: 95,
            [ConditionGrade.VeryGood]: 85,
            [ConditionGrade.Good]: 70,
            [ConditionGrade.Fair]: 55,
            [ConditionGrade.Poor]: 40
          };
          condition = conditionMap[listing.condition] ?? 70;
        } else {
          // Estimate from age and hours
          const age = currentYear - (manufactureYear || currentYear);
          condition = Math.max(30, 100 - age * 2 - initialFlightHours / 500);
        }
      }

      // Create the aircraft records matching gameStore's expected format
      const now = gameState.currentDate;
      const maintenanceDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      const loanAmountPerAircraft = totalPrice - cashRequiredPerAircraft;
      const newAircrafts: Aircraft[] = [];
      const newLoans: Loan[] = [];
      const registrations: string[] = [];

      for (let i = 0; i < quantity; i++) {
        // Generate unique IDs so each aircraft can be linked to its own loan
        const newAircraftId = `aircraft-${Date.now()}-${i}`;

        // Create the loan (only after all validation has passed)
        if (config.type === 'Loan') {
          const loanTermMonths = config.loanTermMonths ?? 60;
          const interestRate = (config.interestRatePercent ?? 5.5) / 100;

          // Calculate monthly payment using standard amortization formula
          const monthlyRate = interestRate / 12;
          let monthlyPayment: number;
          if (monthlyRate === 0) {
            monthlyPayment = loanAmountPerAircraft / loanTermMonths;
          } else {
            monthlyPayment = loanAmountPerAircraft * (monthlyRate * Math.pow(1 + monthlyRate, loanTermMonths)) / (Math.pow(1 + monthlyRate, loanTermMonths) - 1);
          }

          const startDate = new Date(gameState.currentDate);
          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + loanTermMonths);

          newLoans.push({
            id: `loan-${Date.now()}-${i}`,
            amount: loanAmountPerAircraft,
            interestRate: (config.interestRatePercent ?? 5.5),
            monthlyPayment: Math.round(monthlyPayment),
            remainingBalance: loanAmountPerAircraft,
            startDate,
            endDate,
            aircraftId: newAircraftId // Link loan to this specific aircraft
          });
        }

        // Generate registration number based on the hub country's prefix scheme
        const regNumber = generateRegistrationForHub(airline.headquarters, registrations);
        registrations.push(regNumber);

        newAircrafts.push({
          id: newAircraftId, // Use the pre-generated ID so loan link matches
          typeId: gameId,
          registration: regNumber,
          age: currentYear - (manufactureYear || currentYear),
          condition,
          manufactureYear: manufactureYear || currentYear,
          status: 'available',
          currentLocation: airline.headquarters,
          assignedRoute: null,
          totalFlightHours: initialFlightHours,
          lastMaintenance: now,
          nextMaintenance: maintenanceDate,
          liveries: [],
          currentLiveryIndex: 0
        });
      }

      // Update gameStore: add all aircraft to fleet and deduct cash
      useGameStore.setState((state) => {
        if (!state.airline) return state;
        const newCash = state.airline.finances.cash - cashRequiredPerAircraft * quantity;
        return {
          airline: {
            ...state.airline,
            fleet: [...state.airline.fleet, ...newAircrafts],
            finances: {
              ...state.airline.finances,
              cash: newCash,
              // The aircraft's full value is a new asset regardless of how it was paid for.
              // (For loans the offsetting entry is the liability added below.)
              assets: state.airline.finances.assets + totalPrice * quantity,
              ...(newLoans.length > 0 ? {
                loans: [...state.airline.finances.loans, ...newLoans],
                liabilities: state.airline.finances.liabilities + loanAmountPerAircraft * newLoans.length
              } : {})
            }
          }
        };
      });

      // New airframe joins the shared pool → re-dispatch (it may cover a short-staffed
      // route) and refresh the continuous accrual plan immediately.
      useGameStore.getState().dispatchFleet();

      // Mark the listing as purchased in fleetStore. New listings stay
      // available for repeat purchases (they represent a type, not a single
      // airframe); only used listings are consumed by a purchase.
      set((state) => ({
        usedAircraftListings: state.usedAircraftListings.map(l =>
          l.id === listingId ? { ...l, purchased: true } : l
        )
      }));

      const aircraftIds = newAircrafts.map(a => a.id);
      return {
        success: true,
        message: `Purchase successful! ${quantity} ${listing.isNew ? 'new' : 'used'} aircraft acquired (${registrations.join(', ')}).`,
        aircraftId: aircraftIds[0],
        aircraftIds,
        loanId: newLoans[0]?.id
      };
    } catch (error) {
      console.error('Purchase failed:', error);
      return {
        success: false,
        message: 'Purchase failed due to an error'
      };
    }
  },

  refreshUsedMarketplace: () => {
    // Get all aircraft types
    const allAircraft = [...getNewProductionAircraft(), ...getLegacyAircraft()];

    // Refresh the used marketplace
    refreshUsedMarketplace(allAircraft);

    // Update state with active listings
    set({ usedAircraftListings: getActiveUsedListings() });
  }
}));

// Initialize new aircraft listings on store creation
const initializeNewListings = () => {
  const newAircraft = getNewProductionAircraft();

  const newListings: AircraftListing[] = newAircraft.map(aircraft => ({
    id: `new-${aircraft.id}`,
    aircraftTypeId: aircraft.id,
    isNew: true,
    price: aircraft.msrpUsd,
    includedAccessories: [],
    listingDate: new Date() as GameDate,
    expiresAt: null, // Permanent for new listings
    purchased: false
  }));

  useFleetStore.setState({ newAircraftListings: newListings });
};

// Initialize used marketplace on store creation
const initializeUsedMarketplace = () => {
  const allAircraft = [...getNewProductionAircraft(), ...getLegacyAircraft()];
  refreshUsedMarketplace(allAircraft);
  useFleetStore.setState({ usedAircraftListings: getActiveUsedListings() });
};

// Initialize both listing types
initializeNewListings();
initializeUsedMarketplace();

export default useFleetStore;