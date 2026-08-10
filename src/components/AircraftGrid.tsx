import { useEffect, useMemo } from 'react';
import useFleetStore from '../store/fleetSlice';
import AircraftCard from './AircraftCard';
import { getNewProductionAircraft, getLegacyAircraft } from '../data/aircraft-types';

interface AircraftGridProps {
  activeTab: 'new' | 'used';
}

export default function AircraftGrid({ activeTab }: AircraftGridProps) {
  const {
    newAircraftListings,
    usedAircraftListings,
    refreshUsedMarketplace,
    activeFilters
  } = useFleetStore();

  // Refresh used marketplace on component mount and tab switch
  useEffect(() => {
    if (activeTab === 'used') {
      refreshUsedMarketplace();
    }
  }, [activeTab, refreshUsedMarketplace]);

  const allListings = activeTab === 'new' ? newAircraftListings : usedAircraftListings;

  // Get all aircraft types for filtering
  const allAircraftTypes = useMemo(() => {
    return [...getNewProductionAircraft(), ...getLegacyAircraft()];
  }, []);

  // Apply filters to the listings
  const filteredListings = useMemo(() => {
    return allListings.filter(listing => {
      // Get aircraft type data for this listing
      const aircraftType = allAircraftTypes.find(type => type.id === listing.aircraftTypeId);

      if (!aircraftType) {
        return false;
      }

      // Price range filter
      if (activeFilters.priceRange) {
        const [minPrice, maxPrice] = activeFilters.priceRange;
        if (listing.price < minPrice || listing.price > maxPrice) {
          return false;
        }
      }

      // Capacity minimum filter
      if (activeFilters.capacityMin !== undefined) {
        const totalSeats = aircraftType.seatsEconomy + aircraftType.seatsBusiness;
        if (totalSeats < activeFilters.capacityMin) {
          return false;
        }
      }

      // Range minimum filter
      if (activeFilters.rangeMin !== undefined) {
        if (aircraftType.rangeKm < activeFilters.rangeMin) {
          return false;
        }
      }

      // Category filter
      if (activeFilters.category && activeFilters.category.length > 0) {
        if (!activeFilters.category.includes(aircraftType.category)) {
          return false;
        }
      }

      // Manufacturer filter
      if (activeFilters.manufacturer && activeFilters.manufacturer.length > 0) {
        if (!activeFilters.manufacturer.includes(aircraftType.manufacturer)) {
          return false;
        }
      }

      // Condition grade filter (used only)
      if (activeTab === 'used' && activeFilters.conditionGrade && activeFilters.conditionGrade.length > 0) {
        if (!listing.condition || !activeFilters.conditionGrade.includes(listing.condition)) {
          return false;
        }
      }

      // Year built filter (used only)
      if (activeTab === 'used' && activeFilters.yearBuiltFrom !== undefined) {
        if (listing.manufactureYear && listing.manufactureYear < activeFilters.yearBuiltFrom) {
          return false;
        }
      }

      // Flight hours filter (used only)
      if (activeTab === 'used' && activeFilters.flightHoursMax !== undefined) {
        if (listing.totalFlightHours && listing.totalFlightHours > activeFilters.flightHoursMax) {
          return false;
        }
      }

      return true;
    });
  }, [allListings, allAircraftTypes, activeTab, activeFilters]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto scrollbar-hide">
      {filteredListings.length > 0 ? (
        filteredListings.map(listing => (
          <AircraftCard key={listing.id} listing={listing} />
        ))
      ) : (
        <div className="col-span-full flex items-center justify-center h-64 text-gray-400">
          {activeTab === 'new' ? (
            <p>No new aircraft available. Check back later or try the Used Fleet tab.</p>
          ) : (
            <>
              <p>No used aircraft listings available at the moment.</p>
              <button
                onClick={refreshUsedMarketplace}
                className="ml-4 text-blue-400 hover:text-blue-300 underline"
              >
                Refresh Market
              </button>
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
