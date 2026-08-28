import { AircraftType, type AircraftCategory } from '@/types/game';
import { AIRCRAFT_TYPES, type AircraftType as MarketplaceAircraftType } from './aircraft-types';

// Hand-authored entries. Their ids are kept as-is for save compatibility.
const LEGACY_AIRCRAFT: AircraftType[] = [
  // Regional Jets
  {
    id: 'crj-200',
    name: 'CRJ-200',
    manufacturer: 'Bombardier',
    category: 'regional',
    range: 1900,
    maxPassengers: 50,
    cruiseSpeed: 490,
    fuelBurnPerHour: 900,
    acquisitionCost: 15000000,
    weeklyMaintenanceCost: 25000,
    era: 1995,
    specs: {
      length: 26.77,
      wingspan: 19.98,
      maxTakeoffWeight: 24950,
      engines: 2,
      fuelCapacity: 7530,
    },
  },
  {
    id: 'embraer-175',
    name: 'Embraer E175',
    manufacturer: 'Embraer',
    category: 'regional',
    range: 2060,
    maxPassengers: 88,
    cruiseSpeed: 470,
    fuelBurnPerHour: 1100,
    acquisitionCost: 33000000,
    weeklyMaintenanceCost: 35000,
    era: 2004,
    specs: {
      length: 31.68,
      wingspan: 26.00,
      maxTakeoffWeight: 38800,
      engines: 2,
      fuelCapacity: 9990,
    },
  },

  // Turboprops
  {
    id: 'at7-600',
    name: 'ATR 72-600',
    manufacturer: 'ATR',
    category: 'turboprop',
    range: 1528,
    maxPassengers: 78,
    cruiseSpeed: 310,
    fuelBurnPerHour: 580,
    acquisitionCost: 26000000,
    weeklyMaintenanceCost: 20000,
    era: 2009,
    specs: {
      length: 27.17,
      wingspan: 27.05,
      maxTakeoffWeight: 23000,
      engines: 2,
      fuelCapacity: 5000,
    },
  },

  // Narrow-body
  {
    id: 'a320neo',
    name: 'Airbus A320neo',
    manufacturer: 'Airbus',
    category: 'narrow-body',
    range: 3700,
    maxPassengers: 194,
    cruiseSpeed: 487,
    fuelBurnPerHour: 2300,
    acquisitionCost: 110000000,
    weeklyMaintenanceCost: 85000,
    era: 2016,
    specs: {
      length: 37.57,
      wingspan: 35.80,
      maxTakeoffWeight: 79000,
      engines: 2,
      fuelCapacity: 27200,
    },
  },
  {
    id: 'a321neo',
    name: 'Airbus A321neo',
    manufacturer: 'Airbus',
    category: 'narrow-body',
    range: 4000,
    maxPassengers: 244,
    cruiseSpeed: 487,
    fuelBurnPerHour: 2500,
    acquisitionCost: 130000000,
    weeklyMaintenanceCost: 95000,
    era: 2017,
    specs: {
      length: 44.51,
      wingspan: 35.80,
      maxTakeoffWeight: 97000,
      engines: 2,
      fuelCapacity: 32940,
    },
  },
  {
    id: 'b737-800',
    name: 'Boeing 737-800',
    manufacturer: 'Boeing',
    category: 'narrow-body',
    range: 3115,
    maxPassengers: 189,
    cruiseSpeed: 471,
    fuelBurnPerHour: 2400,
    acquisitionCost: 105000000,
    weeklyMaintenanceCost: 80000,
    era: 1998,
    specs: {
      length: 39.50,
      wingspan: 35.80,
      maxTakeoffWeight: 79010,
      engines: 2,
      fuelCapacity: 26020,
    },
  },
  {
    id: 'b737-max8',
    name: 'Boeing 737 MAX 8',
    manufacturer: 'Boeing',
    category: 'narrow-body',
    range: 3805,
    maxPassengers: 210,
    cruiseSpeed: 471,
    fuelBurnPerHour: 2200,
    acquisitionCost: 121000000,
    weeklyMaintenanceCost: 85000,
    era: 2017,
    specs: {
      length: 39.52,
      wingspan: 35.90,
      maxTakeoffWeight: 82000,
      engines: 2,
      fuelCapacity: 26020,
    },
  },

  // Wide-body
  {
    id: 'a330-300',
    name: 'Airbus A330-300',
    manufacturer: 'Airbus',
    category: 'wide-body',
    range: 6400,
    maxPassengers: 440,
    cruiseSpeed: 495,
    fuelBurnPerHour: 5800,
    acquisitionCost: 264000000,
    weeklyMaintenanceCost: 180000,
    era: 1994,
    specs: {
      length: 63.67,
      wingspan: 60.30,
      maxTakeoffWeight: 242000,
      engines: 2,
      fuelCapacity: 139890,
    },
  },
  {
    id: 'a350-900',
    name: 'Airbus A350-900',
    manufacturer: 'Airbus',
    category: 'wide-body',
    range: 8100,
    maxPassengers: 440,
    cruiseSpeed: 513,
    fuelBurnPerHour: 4900,
    acquisitionCost: 317000000,
    weeklyMaintenanceCost: 195000,
    era: 2015,
    specs: {
      length: 66.80,
      wingspan: 64.75,
      maxTakeoffWeight: 280000,
      engines: 2,
      fuelCapacity: 138000,
    },
  },
  {
    id: 'b777-300er',
    name: 'Boeing 777-300ER',
    manufacturer: 'Boeing',
    category: 'wide-body',
    range: 7355,
    maxPassengers: 550,
    cruiseSpeed: 494,
    fuelBurnPerHour: 7200,
    acquisitionCost: 375000000,
    weeklyMaintenanceCost: 220000,
    era: 2004,
    specs: {
      length: 73.86,
      wingspan: 64.80,
      maxTakeoffWeight: 351534,
      engines: 2,
      fuelCapacity: 181283,
    },
  },
  {
    id: 'b787-9',
    name: 'Boeing 787-9 Dreamliner',
    manufacturer: 'Boeing',
    category: 'wide-body',
    range: 7635,
    maxPassengers: 406,
    cruiseSpeed: 488,
    fuelBurnPerHour: 4700,
    acquisitionCost: 292000000,
    weeklyMaintenanceCost: 185000,
    era: 2014,
    specs: {
      length: 62.80,
      wingspan: 60.10,
      maxTakeoffWeight: 254011,
      engines: 2,
      fuelCapacity: 126206,
    },
  },
  {
    id: 'a380',
    name: 'Airbus A380',
    manufacturer: 'Airbus',
    category: 'wide-body',
    range: 8000,
    maxPassengers: 853,
    cruiseSpeed: 488,
    fuelBurnPerHour: 11800,
    acquisitionCost: 445000000,
    weeklyMaintenanceCost: 350000,
    era: 2007,
    specs: {
      length: 72.70,
      wingspan: 79.75,
      maxTakeoffWeight: 575000,
      engines: 4,
      fuelCapacity: 320000,
    },
  },
  {
    id: 'b747-8',
    name: 'Boeing 747-8',
    manufacturer: 'Boeing',
    category: 'wide-body',
    range: 7430,
    maxPassengers: 467,
    cruiseSpeed: 473,
    fuelBurnPerHour: 10200,
    acquisitionCost: 418000000,
    weeklyMaintenanceCost: 310000,
    era: 2012,
    specs: {
      length: 76.25,
      wingspan: 68.40,
      maxTakeoffWeight: 447700,
      engines: 4,
      fuelCapacity: 238613,
    },
  },

  // Cargo
  {
    id: 'b777-f',
    name: 'Boeing 777F',
    manufacturer: 'Boeing',
    category: 'cargo',
    range: 4630,
    maxPassengers: 0,
    cruiseSpeed: 471,
    fuelBurnPerHour: 7100,
    acquisitionCost: 352000000,
    weeklyMaintenanceCost: 210000,
    era: 2009,
    specs: {
      length: 63.70,
      wingspan: 64.80,
      maxTakeoffWeight: 351534,
      engines: 2,
      fuelCapacity: 181283,
    },
  },
];

// ============================================================
// Full marketplace coverage
// ============================================================
// The marketplace (data/aircraft-types.ts) sells ~68 airframes but the legacy
// list above only has 14. Purchases used to fall back to a hand-maintained
// "closest match" table (e.g. buying a used A318 put an A320neo in the fleet).
// Instead, derive one entry per marketplace type so every listing resolves to
// its real airframe. Marketplace types that are the exact same airframe as a
// legacy entry keep the legacy id (save compatibility, no duplicate rows).
export const MARKETPLACE_ID_ALIASES: Record<string, string> = {
  'airbus-a320neo': 'a320neo',
  'airbus-a321neo': 'a321neo',
  'airbus-a330-300': 'a330-300',
  'airbus-a350-900': 'a350-900',
  'airbus-a380-800': 'a380',
  'boeing-737-max-8': 'b737-max8',
  'boeing-777-300er': 'b777-300er',
  'boeing-787-9': 'b787-9',
};

const KM_PER_NM = 1.852;
const AVG_WEEKS_PER_MONTH = 52 / 12;

// Representative physical specs per category. Simulation math only uses
// range / seats / fuel burn / costs, so category-level estimates are fine.
const SPEC_ESTIMATES: Record<AircraftCategory, { length: number; wingspan: number; maxTakeoffWeight: number; engines: number; fuelCapacity: number }> = {
  'regional': { length: 32, wingspan: 26, maxTakeoffWeight: 39000, engines: 2, fuelCapacity: 12000 },
  'turboprop': { length: 27, wingspan: 27, maxTakeoffWeight: 23000, engines: 2, fuelCapacity: 5000 },
  'narrow-body': { length: 40, wingspan: 36, maxTakeoffWeight: 80000, engines: 2, fuelCapacity: 27000 },
  'wide-body': { length: 65, wingspan: 61, maxTakeoffWeight: 280000, engines: 2, fuelCapacity: 140000 },
  'cargo': { length: 64, wingspan: 65, maxTakeoffWeight: 300000, engines: 2, fuelCapacity: 150000 },
  'business-jet': { length: 18, wingspan: 16, maxTakeoffWeight: 21000, engines: 2, fuelCapacity: 7000 },
};

function deriveFromMarketplaceType(t: MarketplaceAircraftType): AircraftType {
  return {
    id: t.id,
    name: `${t.manufacturer} ${t.model}`,
    manufacturer: t.manufacturer,
    category: t.category,
    range: Math.round(t.rangeKm / KM_PER_NM),
    maxPassengers: t.seatsEconomy,
    cruiseSpeed: Math.round(t.cruiseSpeedKmh / KM_PER_NM),
    fuelBurnPerHour: t.fuelBurnPerHourKg,
    acquisitionCost: t.msrpUsd,
    msrpUsd: t.msrpUsd,
    weeklyMaintenanceCost: Math.round(t.monthlyMaintenanceUsd / AVG_WEEKS_PER_MONTH),
    monthlyMaintenanceUsd: t.monthlyMaintenanceUsd,
    era: t.firstDeliveryYear,
    firstDeliveryYear: t.firstDeliveryYear,
    inProduction: t.inProduction,
    insuranceMultiplier: t.insuranceMultiplier,
    compatibleAccessories: t.compatibleAccessories,
    specs: SPEC_ESTIMATES[t.category],
  };
}

const DERIVED_AIRCRAFT: AircraftType[] = Object.values(AIRCRAFT_TYPES)
  .filter((t) => !MARKETPLACE_ID_ALIASES[t.id])
  .map(deriveFromMarketplaceType);

// Comprehensive aircraft database for the simulation
export const AIRCRAFT_DATABASE: AircraftType[] = [...LEGACY_AIRCRAFT, ...DERIVED_AIRCRAFT];

// Resolve a marketplace listing's aircraftTypeId to the exact AIRCRAFT_DATABASE
// entry for that airframe (null only for unknown types).
export function gameIdForMarketplaceType(marketplaceId: string): string | null {
  const alias = MARKETPLACE_ID_ALIASES[marketplaceId];
  if (alias) return alias;
  return AIRCRAFT_DATABASE.some((t) => t.id === marketplaceId) ? marketplaceId : null;
}

// Helper functions
export function getAircraftById(id: string): AircraftType | undefined {
  return AIRCRAFT_DATABASE.find(ac => ac.id === id);
}

export function getAircraftByCategory(category: string): AircraftType[] {
  return AIRCRAFT_DATABASE.filter(ac => ac.category === category);
}

export function getAircraftByManufacturer(manufacturer: string): AircraftType[] {
  return AIRCRAFT_DATABASE.filter(ac => ac.manufacturer === manufacturer);
}

export function filterAircraftByRange(minRange: number, maxRange: number): AircraftType[] {
  return AIRCRAFT_DATABASE.filter(ac => ac.range >= minRange && ac.range <= maxRange);
}

export function filterAircraftByBudget(maxBudget: number): AircraftType[] {
  return AIRCRAFT_DATABASE.filter(ac => ac.acquisitionCost <= maxBudget);
}
