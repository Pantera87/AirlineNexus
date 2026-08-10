import { type AircraftType } from "./aircraft-types";
import {
  type AircraftListing,
  ConditionGrade,
  type GameDate
} from "../types/game";

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

const currentGameYear = new Date().getFullYear();

function calculateUsedPrice(
  aircraftType: AircraftType,
  yearBuilt: number,
  condition: ConditionGrade,
  flightHours: number
): number {
  const age = currentGameYear - yearBuilt;

  // Base depreciation curve (steeper early years, flattening later)
  let ageFactor = Math.max(0.15, 1 - (age * 0.035));  // ~3.5% per year minimum floor 15%

  // Flight hours penalty (above expected baseline)
  const expectedHoursForAge = age * 3000;              // Roughly 3k hrs/year typical airline use
  const hourPenaltyFactor = flightHours > expectedHoursForAge
    ? Math.max(0.85, 1 - ((flightHours - expectedHoursForAge) / expectedHoursForAge) * 0.25)
    : 1;

  // Condition multiplier table
  const conditionMultipliers: Record<ConditionGrade, number> = {
    [ConditionGrade.Excellent]: 1.0,
    [ConditionGrade.VeryGood]: 0.92,
    [ConditionGrade.Good]: 0.82,
    [ConditionGrade.Fair]: 0.70,
    [ConditionGrade.Poor]: 0.55
  };

  const price = aircraftType.msrpUsd * ageFactor * hourPenaltyFactor * conditionMultipliers[condition];

  return Math.round(price / 1000) * 1000;              // Round to nearest $1,000
}

function getRandomCondition(): ConditionGrade {
  const conditions = [
    ConditionGrade.Excellent,
    ConditionGrade.VeryGood,
    ConditionGrade.Good,
    ConditionGrade.Fair,
    ConditionGrade.Poor
  ];
  return conditions[Math.floor(Math.random() * conditions.length)];
}

function generateRandomFlightHours(yearBuilt: number): number {
  const age = currentGameYear - yearBuilt;
  // Base hours roughly proportional to age, with variance
  const baseHours = age * 3000 + Math.random() * age * 1500;
  return Math.round(baseHours);
}

function getRandomSellerName(): string {
  const sellers = [
    "Aircraft Broker",
    "Global Aviation Sales",
    "SkyTraders International",
    "Jet Capital Leasing",
    "Airline Liquidators",
    "Premier Aircraft Company"
  ];
  return sellers[Math.floor(Math.random() * sellers.length)];
}

function getRandomExpiryDays(): number {
  // Random lifespan between 2 and 8 weeks
  return Math.floor(Math.random() * 40) + 14; // 14-53 days
}

let activeUsedListings: AircraftListing[] = [];

export function generateUsedListing(aircraftType: AircraftType): AircraftListing {
  const yearBuilt = Math.max(
    aircraftType.firstDeliveryYear,
    currentGameYear - 40 + Math.floor(Math.random() * 40)
  );

  const condition = getRandomCondition();
  const flightHours = generateRandomFlightHours(yearBuilt);

  const price = calculateUsedPrice(aircraftType, yearBuilt, condition, flightHours);

  const listing: AircraftListing = {
    id: `used-${aircraftType.id}-${Date.now()}`,
    aircraftTypeId: aircraftType.id,
    isNew: false,
    price: price,
    condition: condition,
    manufactureYear: yearBuilt,
    totalFlightHours: flightHours,
    includedAccessories: [],
    sellerName: getRandomSellerName(),
    listingDate: new Date() as GameDate,
    expiresAt: new Date(Date.now() + getRandomExpiryDays() * 24 * 60 * 60 * 1000),
    purchased: false
  };

  return listing;
}

export function refreshUsedMarketplace(aircraftTypes: AircraftType[]): void {
  // Clear expired listings
  activeUsedListings = activeUsedListings.filter(listing => {
    if (listing.expiresAt && new Date() > listing.expiresAt) {
      return false; // Remove expired listing
    }
    return true;
  });

  // Generate new listings (3-8 per refresh)
  const newListingsCount = Math.floor(Math.random() * 6) + 3;

  // Filter to only legacy aircraft that are not in production
  const legacyAircraft = aircraftTypes.filter(aircraft => !aircraft.inProduction);

  for (let i = 0; i < newListingsCount && legacyAircraft.length > 0; i++) {
    // Randomly select from legacy aircraft, with some rarity weighting
    const rarityWeightedIndex = Math.floor(Math.random() * legacyAircraft.length);
    const selectedAircraft = legacyAircraft[rarityWeightedIndex];

    const newListing = generateUsedListing(selectedAircraft);
    activeUsedListings.push(newListing);
  }
}

export function getActiveListings(filter?: ListingFilter): AircraftListing[] {
  let listings = [...activeUsedListings];

  if (filter) {
    if (filter.category && filter.category.length > 0) {
      listings = listings.filter(listing =>
        filter.category!.includes(listing.aircraftTypeId)
      );
    }

    if (filter.manufacturer && filter.manufacturer.length > 0) {
      // Note: This would require accessing aircraft type data
      // For now, we'll skip manufacturer filtering in getActiveListings
    }

    if (filter.priceRange) {
      listings = listings.filter(listing =>
        filter.priceRange && listing.price >= filter.priceRange[0] && listing.price <= filter.priceRange[1]
      );
    }

    if (filter.capacityMin) {
      // Note: This would require accessing aircraft type data
      // For now, we'll skip capacity filtering in getActiveListings
    }

    if (filter.rangeMin) {
      // Note: This would require accessing aircraft type data
      // For now, we'll skip range filtering in getActiveListings
    }

    if (filter.conditionGrade?.length && filter.conditionGrade.length > 0) {
      listings = listings.filter(listing =>
        listing.condition && filter.conditionGrade!.includes(listing.condition)
      );
    }

    if (filter.yearBuiltFrom != null) {
      listings = listings.filter(listing =>
        listing.manufactureYear != null && listing.manufactureYear >= filter.yearBuiltFrom!
      );
    }

    if (filter.flightHoursMax != null) {
      listings = listings.filter(listing =>
        listing.totalFlightHours != null && listing.totalFlightHours <= filter.flightHoursMax!
      );
    }
  }

  return listings;
}

export function removeExpiredListings(currentDate: GameDate): void {
  activeUsedListings = activeUsedListings.filter(listing => {
    if (listing.expiresAt && currentDate > listing.expiresAt) {
      return false; // Remove expired listing
    }
    return true;
  });
}