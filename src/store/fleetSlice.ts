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
import {
  refreshUsedMarketplace,
  getActiveListings as getActiveUsedListings
} from '../data/market-generator';
import { useGameStore } from './gameStore';
import { AIRCRAFT_DATABASE } from '../data/aircraft';

// Map marketplace aircraftTypeId to game AIRCRAFT_DATABASE id
function mapMarketplaceIdToGameId(marketplaceId: string): string | null {
  const mapping: Record<string, string> = {
    // Boeing Narrowbody
    'boeing-737-max-8': 'b737-max8',
    'boeing-737-max-9': 'b737-max8', // No exact match, use closest
    'boeing-737-max-10': 'b737-max8',
    'boeing-737-classic': 'b737-800',
    'boeing-737-ng': 'b737-800',

    // Airbus Narrowbody
    'airbus-a220-100': 'embraer-175', // Regional equivalent
    'airbus-a220-300': 'embraer-175',
    'airbus-a319neo': 'a320neo',
    'airbus-a320neo': 'a320neo',
    'airbus-a321neo': 'a321neo',
    'airbus-a321xlr': 'a321neo',
    'airbus-a320ceo': 'a320neo',
    'airbus-a318': 'a320neo',
    'airbus-a319': 'a320neo',

    // Boeing Widebody
    'boeing-767-300er': 'b777-300er',
    'boeing-767-f': 'b777-f',
    'boeing-777-200er': 'b777-300er',
    'boeing-777-300er': 'b777-300er',
    'boeing-777-8': 'b777-300er',
    'boeing-777-9': 'b777-300er',
    'boeing-787-8': 'b787-9',
    'boeing-787-9': 'b787-9',
    'boeing-787-10': 'b787-9',
    'boeing-747-400': 'b747-8',
    'boeing-747-8f': 'b747-8',

    // Airbus Widebody
    'airbus-a330-200': 'a330-300',
    'airbus-a330-300': 'a330-300',
    'airbus-a330-800neo': 'a330-300',
    'airbus-a330-900neo': 'a330-300',
    'airbus-a350-900': 'a350-900',
    'airbus-a350-1000': 'a350-900',
    'airbus-a380-800': 'a380',
    'airbus-a340-300': 'a330-300',
    'airbus-a340-600': 'a330-300',

    // Regional Jets
    'embraer-e175-e2': 'embraer-175',
    'embraer-e190-e2': 'embraer-175',
    'embraer-e195-e2': 'embraer-175',
    'embraer-e175': 'embraer-175',
    'embraer-e190': 'embraer-175',
    'embraer-e195': 'embraer-175',

    // Turboprops
    'atr-42-600': 'at7-600',
    'atr-42-600s': 'at7-600',
    'atr-72-600': 'at7-600',
    'atr-72-600f': 'at7-600',

    // Legacy / Other (map to closest equivalents)
    'md-80': 'b737-800',
    'md-90': 'b737-800',
    'md-11f': 'b777-f',
    'dc-9': 'crj-200',
    'f-27': 'at7-600',
    'f-28': 'crj-200',
    'il-86': 'a330-300',
    'il-96': 'b747-8',
    'tu-204': 'a330-300',
    'tu-204c': 'b777-f',
    'tu-214': 'a330-300',
    'tu-214c': 'b777-f',
    'a300b4': 'a330-300',
  };

  return mapping[marketplaceId] || null;
}

interface PurchaseConfig {
  type: PurchaseType;
  totalPriceUsd: number;
  downPaymentPercent?: number;
  loanTermMonths?: number;
  interestRatePercent?: number;
}

interface PurchaseResult {
  success: boolean;
  message: string;
  aircraftId?: string;
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
    set({ activeTab: tab });
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

      // Calculate costs based on purchase type
      let cashRequired = 0;
      let loanId: string | undefined;

      if (config.type === 'Cash') {
        cashRequired = totalPrice;
      } else if (config.type === 'Loan') {
        const downPaymentPercent = config.downPaymentPercent ?? 20;
        cashRequired = Math.round(totalPrice * downPaymentPercent / 100);

        // Create loan for the remainder
        const loanAmount = totalPrice - cashRequired;
        const loanTermMonths = config.loanTermMonths ?? 60;
        const interestRate = (config.interestRatePercent ?? 5.5) / 100;

        // Calculate monthly payment using standard amortization formula
        const monthlyRate = interestRate / 12;
        let monthlyPayment: number;
        if (monthlyRate === 0) {
          monthlyPayment = loanAmount / loanTermMonths;
        } else {
          monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, loanTermMonths)) / (Math.pow(1 + monthlyRate, loanTermMonths) - 1);
        }

        const startDate = new Date(gameState.currentDate);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + loanTermMonths);

        const newLoan: Loan = {
          id: `loan-${Date.now()}`,
          amount: loanAmount,
          interestRate: (config.interestRatePercent ?? 5.5),
          monthlyPayment: Math.round(monthlyPayment),
          remainingBalance: loanAmount,
          startDate,
          endDate
        };

        // Update gameStore with new loan and reduced cash
        useGameStore.setState((state) => {
          if (!state.airline) return state;
          return {
            airline: {
              ...state.airline,
              finances: {
                ...state.airline.finances,
                loans: [...state.airline.finances.loans, newLoan],
                liabilities: state.airline.finances.liabilities + loanAmount
              }
            }
          };
        });

        loanId = newLoan.id;
      }

      // Check if player has enough cash for the required payment
      if (playerCash < cashRequired) {
        return {
          success: false,
          message: config.type === 'Cash'
            ? 'Insufficient funds for cash purchase'
            : 'Insufficient funds for down payment'
        };
      }

      // Generate registration number using airline's IATA code
      const regNumber = `${airline.iataCode}${Math.floor(1000 + Math.random() * 9000)}`;

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

      // Map marketplace aircraftTypeId to game AIRCRAFT_DATABASE id so FleetScreen can find it
      const gameId = mapMarketplaceIdToGameId(listing.aircraftTypeId);
      if (!gameId) {
        return {
          success: false,
          message: 'Unable to process this aircraft type. Please try a different one.'
        };
      }

      // Create the new Aircraft record matching gameStore's expected format
      const now = gameState.currentDate;
      const maintenanceDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      const newAircraft: Aircraft = {
        id: `aircraft-${Date.now()}`,
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
      };

      // Update gameStore: add aircraft to fleet and deduct cash
      useGameStore.setState((state) => {
        if (!state.airline) return state;
        const newCash = state.airline.finances.cash - cashRequired;
        return {
          airline: {
            ...state.airline,
            fleet: [...state.airline.fleet, newAircraft],
            finances: {
              ...state.airline.finances,
              cash: newCash,
              assets: state.airline.finances.assets + totalPrice - cashRequired
            }
          }
        };
      });

      // Mark listing as purchased in fleetStore
      set((state) => ({
        newAircraftListings: state.newAircraftListings.map(l =>
          l.id === listingId ? { ...l, purchased: true } : l
        ),
        usedAircraftListings: state.usedAircraftListings.map(l =>
          l.id === listingId ? { ...l, purchased: true } : l
        )
      }));

      return {
        success: true,
        message: `Purchase successful! ${listing.isNew ? 'New' : 'Used'} aircraft acquired (${regNumber}).`,
        aircraftId: newAircraft.id,
        loanId
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