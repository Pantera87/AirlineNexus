import { create } from 'zustand';
import {
  type AircraftListing,
  type PurchaseType,
  ConditionGrade,
  type GameDate
} from '../types/game';
import { type AircraftType, getNewProductionAircraft, getLegacyAircraft } from '../data/aircraft-types';
import {
  refreshUsedMarketplace,
  generateUsedListing,
  getActiveListings as getActiveUsedListings,
  removeExpiredListings
} from '../data/market-generator';

interface ListingFilter {
  category?: string[];
  manufacturer?: string[];
  priceRange?: [number, number];
  capacityMin?: number;
  rangeMin?: number;
  conditionGrade?: ConditionGrade[];
  yearBuiltFrom?: number;
  flightHoursMax?: number;
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

      // Validate player funds (placeholder - would integrate with actual game finances)
      // This is a mock implementation
      const mockPlayerCash = 1000000000; // $1B for testing

      if (config.type === 'Cash') {
        if (mockPlayerCash < config.totalPriceUsd) {
          return {
            success: false,
            message: 'Insufficient funds for cash purchase'
          };
        }
      } else if (config.type === 'Loan') {
        const downPayment = config.downPaymentPercent
          ? Math.round(config.totalPriceUsd * config.downPaymentPercent / 100)
          : Math.round(config.totalPriceUsd * 20 / 100); // Default 20% down payment

        if (mockPlayerCash < downPayment) {
          return {
            success: false,
            message: 'Insufficient funds for down payment'
          };
        }
      }

      // Mark listing as purchased
      set((state) => ({
        newAircraftListings: state.newAircraftListings.map(l =>
          l.id === listingId ? { ...l, purchased: true } : l
        ),
        usedAircraftListings: state.usedAircraftListings.map(l =>
          l.id === listingId ? { ...l, purchased: true } : l
        )
      }));

      // In a real implementation, this would:
      // 1. Create Aircraft record in database
      // 2. Deduct funds from player's cash
      // 3. If loan, create AircraftLoan record and add to finances
      // 4. Add aircraft to fleet

      return {
        success: true,
        message: `Purchase successful! ${listing.isNew ? 'New' : 'Used'} ${listing.aircraftTypeId} acquired.`,
        aircraftId: `aircraft-${Date.now()}`
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