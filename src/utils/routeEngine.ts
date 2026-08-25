import { Airport, AircraftType, AircraftCategory } from '@/types/game';
import { AIRCRAFT_DATABASE } from '@/data/aircraft';

// ============================================================
// Unit conversion
// ============================================================

export const KM_TO_NM = 1 / 1.852;
export const NM_TO_KM = 1.852;

/** Convert a distance in kilometers to nautical miles */
export function kmToNm(km: number): number {
  return km * KM_TO_NM;
}

/** Convert a distance in nautical miles to kilometers */
export function nmToKm(nm: number): number {
  return nm * NM_TO_KM;
}

// ============================================================
// Distance calculation (haversine, great-circle)
// ============================================================

const EARTH_RADIUS_NM = 3440.065; // Earth's mean radius in nautical miles

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two airports in **nautical miles** (rounded).
 */
export function calculateRouteDistanceNm(origin: Airport, destination: Airport): number {
  const dLat = toRadians(destination.latitude - origin.latitude);
  const dLon = toRadians(destination.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(destination.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_NM * c);
}

/** Same as above but returns kilometers */
export function calculateRouteDistanceKm(origin: Airport, destination: Airport): number {
  return Math.round(calculateRouteDistanceNm(origin, destination) * NM_TO_KM);
}

// ============================================================
// Aircraft range & feasibility
// ============================================================

/**
 * Usable (effective) range of an aircraft.
 * Reserves a safety fraction of the rated max range so that the last few
 * flights never run on fumes — 5% for wide-bodies, 8% for regional jets.
 */
export function getEffectiveRangeNm(aircraft: AircraftType): number {
  const reserveFactor = aircraft.category === 'regional' ? 0.92 : 0.95;
  return Math.round(aircraft.range * reserveFactor);
}

export interface RangeCheck {
  feasible: boolean;
  /** How much of the effective range this route consumes (0–1+) */
  utilization: number;
  /** Nautical miles left after flying the route (negative when infeasible) */
  remainingNm: number;
  /** True if the route fits but uses more than 95% of effective range */
  tight: boolean;
}

/**
 * Check whether an aircraft can serve a route of `distanceNm` nautical miles.
 */
export function checkRange(aircraft: AircraftType, distanceNm: number): RangeCheck {
  const effective = getEffectiveRangeNm(aircraft);
  const utilization = distanceNm / effective;
  return {
    feasible: utilization <= 1,
    utilization,
    remainingNm: Math.round(effective - distanceNm),
    tight: utilization > 0.95 && utilization <= 1,
  };
}

// ============================================================
// Flight time estimation
// ============================================================

/**
 * Estimated block time for a non-stop flight in **minutes**.
 * Takes the longer of (a) pure cruise time and (b) minimum turnaround
 * overhead (taxi + climb + descent ≈ 35 min).
 */
export function estimateFlightTimeMinutes(distanceNm: number, aircraft: AircraftType): number {
  const cruiseKt = Math.max(aircraft.cruiseSpeed - 40, 120); // average incl. taxi/climb/descent
  const cruiseMin = (distanceNm / cruiseKt) * 60;
  return Math.round(Math.max(cruiseMin, 35));
}

/** Format minutes as "Xh Ym" or "Ym" */
export function formatFlightTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ============================================================
// Round-trip cycle & per-route aircraft availability
// ============================================================

/**
 * Minimum ground turnaround time (minutes) at each stop, by aircraft category.
 * Quick turns for regionals/turboprops, longer servicing for wide-bodies.
 */
const TURNAROUND_MINUTES_BY_CATEGORY: Record<AircraftCategory, number> = {
  regional: 30,
  turboprop: 30,
  'business-jet': 30,
  'narrow-body': 45,
  cargo: 60,
  'wide-body': 75,
};

/** Ground turnaround time (minutes) at each end of a round trip for this aircraft. */
export function getTurnaroundMinutes(aircraft: AircraftType): number {
  return TURNAROUND_MINUTES_BY_CATEGORY[aircraft.category] ?? 45;
}

/**
 * Total duration in **minutes** of one full round-trip cycle back to the origin:
 * outbound leg + destination turnaround + return leg + origin turnaround.
 */
export function getRouteCycleMinutes(distanceNm: number, aircraft: AircraftType): number {
  const legMin = estimateFlightTimeMinutes(distanceNm, aircraft);
  return 2 * legMin + 2 * getTurnaroundMinutes(aircraft);
}

/**
 * Maximum round-trip cycles a single aircraft can complete on this route in one day.
 * Cycles longer than 24h (very long-haul) still operate once per day with an overnight stay.
 */
export function maxCyclesPerDay(distanceNm: number, aircraft: AircraftType): number {
  return Math.max(1, Math.floor(1440 / getRouteCycleMinutes(distanceNm, aircraft)));
}

/** Weekly frequency cap (round trips/week) for this route served by this aircraft. */
export function maxFrequencyPerWeek(distanceNm: number, aircraft: AircraftType): number {
  return 7 * maxCyclesPerDay(distanceNm, aircraft);
}

/**
 * Realistic maximum duty hours per day (cycle time incl. turnarounds) one aircraft can work
 * across ALL of its assigned routes combined — the rest is crew/aircraft rest time.
 */
export const DAILY_DUTY_HOURS = 16;

// ============================================================
// Route demand scoring
// ============================================================

/**
 * Score a potential route's attractiveness (0–100) from the two airports'
 * popularity and distance decay. Higher = more passengers expected.
 */
export function scoreRouteDemand(origin: Airport, destination: Airport): number {
  const pairPopularity = Math.min(origin.popularity, destination.popularity) / 100;
  const crossPopularity = ((origin.popularity + destination.popularity) / 2) / 100;
  const avgPopularity = pairPopularity * 0.35 + crossPopularity * 0.65;

  const distanceNm = calculateRouteDistanceNm(origin, destination);
  // Short-haul routes carry more frequent flyers; long-haul fewer but premium.
  const distanceFactor = 1 / (1 + (distanceNm / 2500) ** 2);

  return Math.round(avgPopularity * distanceFactor * 100);
}

// ============================================================
// Destination discovery & suggestions
// ============================================================

export interface ReachableDestination {
  airport: Airport;
  distanceNm: number;
  demandScore: number;
}

/**
 * All airports within the aircraft's effective range of `origin`,
 * sorted by demand score (descending). Capped to keep UI snappy.
 */
export function findReachableDestinations(
  origin: Airport,
  aircraft: AircraftType,
  allAirports: Airport[],
  maxResults = 50
): ReachableDestination[] {
  const effective = getEffectiveRangeNm(aircraft);
  const results: ReachableDestination[] = [];

  for (const dest of allAirports) {
    if (dest.iata === origin.iata) continue;
    const distanceNm = calculateRouteDistanceNm(origin, dest);
    if (distanceNm > effective) continue;
    results.push({
      airport: dest,
      distanceNm,
      demandScore: scoreRouteDemand(origin, dest),
    });
  }

  results.sort((a, b) => b.demandScore - a.demandScore);
  return results.slice(0, maxResults);
}

/**
 * Top N suggested destinations for an aircraft type departing from origin.
 */
export function suggestDestinations(
  origin: Airport,
  aircraft: AircraftType,
  allAirports: Airport[],
  count = 6
): ReachableDestination[] {
  return findReachableDestinations(origin, aircraft, allAirports, count);
}

// ============================================================
// Economics preview (pre-assignment estimate)
// ============================================================

export interface RouteEconomicsPreview {
  estLoadFactor: number;
  ticketPrice: number;
  weeklyPassengers: number;
  weeklyRevenue: number;
  weeklyCosts: number;
  weeklyFuelCost: number;
  weeklyProfit: number;
}

/** Distance-based ticket price heuristic (realistic one-way average fares) */
export function estimateTicketPrice(distanceNm: number): number {
  const base = 40; // fixed booking/airport surcharge component
  const perNm = distanceNm < 1500 ? 0.22 : 0.16; // long-haul fares grow more slowly per mile
  const longHaulPremium = distanceNm > 4000 ? 90 : 0; // intercontinental premium
  return Math.round(base + distanceNm * perNm + longHaulPremium);
}

/** Options that shape the load-factor model (all optional for backward compatibility) */
export interface RouteEconomicsOptions {
  /** Weeks this route has been operating — drives the new-route ramp-up. Defaults to 0 (brand-new route). */
  weeksActive?: number;
  /** Combined competitor market share on this route, 0-1. Defaults to 0 (no competition). */
  competitionShare?: number;
  /** Airline reputation 0-100. Defaults to 50 (neutral). */
  reputation?: number;
}

/**
 * Weekly fixed costs of OWNING one aircraft of this type, regardless of how much it flies:
 * maintenance + depreciation (~5%/yr of acquisition cost) + insurance (~1.5%/yr × multiplier).
 */
export function getAircraftWeeklyFixedCosts(aircraftType: AircraftType): number {
  const maintenance = aircraftType.weeklyMaintenanceCost;
  const depreciation = (aircraftType.acquisitionCost * 0.05) / 52;
  const insurance = ((aircraftType.acquisitionCost * 0.015) / 52) * (aircraftType.insuranceMultiplier ?? 1);
  return Math.round(maintenance + depreciation + insurance);
}

/** Fallback jet-fuel price (USD/kg) when the live market price is unavailable */
export const DEFAULT_FUEL_PRICE_PER_KG = 0.85;

/**
 * Rough economics estimate for a route served by `aircraft` at `frequencyPerWeek`.
 * Pure function — useful for the "what if" preview in the UI before committing.
 * Each scheduled unit is a full ROUND TRIP back to the origin (outbound + return),
 * so fuel, block time and passengers are charged for BOTH legs; landing fees cover
 * one landing at each end per cycle.
 * `fuelPricePerKg` is the live market fuel price (USD/kg) so costs track the
 * dynamic fuel market; defaults to DEFAULT_FUEL_PRICE_PER_KG when omitted.
 * `options` shapes the load-factor model: new routes ramp up from ~45% of their
 * demand-based ceiling, competitors shave share off it, and reputation nudges ±10%.
 */
export function previewRouteEconomics(
  origin: Airport,
  destination: Airport,
  aircraft: AircraftType,
  frequencyPerWeek: number,
  fuelPricePerKg: number = DEFAULT_FUEL_PRICE_PER_KG,
  options: RouteEconomicsOptions = {}
): RouteEconomicsPreview {
  const distanceNm = calculateRouteDistanceNm(origin, destination);
  const demand = scoreRouteDemand(origin, destination) / 100;

  // --- Load factor model (realistic) ---
  const seatsPerFlight = aircraft.maxPassengers;
  // Mature ceiling: even the best hub pair tops out around ~90% load factor.
  const ceilingLoadFactor = 0.35 + demand * 0.55;

  // New routes ramp up from ~45% of their ceiling toward it over several weeks.
  const weeksActive = Math.max(0, options.weeksActive ?? 0);
  const rampFactor = 0.45 + 0.55 * (1 - Math.exp(-weeksActive / 6));

  let estLoadFactor = ceilingLoadFactor * rampFactor;

  // Competitors take a share of the market on this route.
  const competitionShare = Math.min(Math.max(options.competitionShare ?? 0, 0), 1);
  estLoadFactor *= 1 - competitionShare * 0.35;

  // Reputation: ±10% around neutral (50).
  const reputation = options.reputation ?? 50;
  estLoadFactor *= 1 + ((reputation - 50) / 50) * 0.1;

  estLoadFactor = Math.min(0.95, Math.max(0.1, estLoadFactor));

  const ticketPrice = estimateTicketPrice(distanceNm);
  // Each scheduled unit is a round trip: two revenue-generating legs (outbound + return).
  const legsPerWeek = 2 * frequencyPerWeek;
  const weeklyPassengers = Math.round(seatsPerFlight * estLoadFactor * legsPerWeek);
  const weeklyRevenue = weeklyPassengers * ticketPrice;
  // Block time uses average speed (cruise minus taxi/climb/descent losses)
  const blockTimeHr = distanceNm / Math.max(aircraft.cruiseSpeed - 40, 120);
  // Hourly cost: fuel at the live market price + crew/cabin/other costs that scale with cabin size.
  const hourlyCrewAndOther = Math.max(400, aircraft.maxPassengers * 3);
  const weeklyFuelCost = Math.round(aircraft.fuelBurnPerHour * fuelPricePerKg * blockTimeHr * legsPerWeek);
  // Blended landing/handling fees at BOTH ends. Airport data stores per-landing list prices;
  // we charge a blended share covering landing, handling and terminal fees.
  const airportFees = (origin.landingFee + destination.landingFee) * frequencyPerWeek * 0.15;
  const weeklyCosts = Math.round(
    (aircraft.fuelBurnPerHour * fuelPricePerKg + hourlyCrewAndOther) * blockTimeHr * legsPerWeek + airportFees
  );
  const weeklyProfit = weeklyRevenue - weeklyCosts;

  return { estLoadFactor, ticketPrice, weeklyPassengers, weeklyRevenue, weeklyCosts, weeklyFuelCost, weeklyProfit };
}

// ============================================================
// Hub & closed-loop routes (multi-hop)
// ============================================================

/**
 * Full flight order of a hub loop as IATA codes: origin (hub) → stops… → destination.
 * The final leg always returns to the origin/hub, so every route starts and ends at the hub.
 */
export function getRoutePath(route: { origin: string; stops?: string[]; destination: string }): string[] {
  return [route.origin, ...(route.stops ?? []), route.destination];
}

/** All legs of a closed loop as consecutive airport pairs (final leg returns to the hub). */
export function getLoopLegs(path: Airport[]): [Airport, Airport][] {
  const legs: [Airport, Airport][] = [];
  for (let i = 0; i < path.length - 1; i++) legs.push([path[i], path[i + 1]]);
  if (path.length > 1) legs.push([path[path.length - 1], path[0]]);
  return legs;
}

/** Total distance flown in one full loop cycle (all legs incl. the return to hub). */
export function calculateLoopDistanceNm(path: Airport[]): number {
  return getLoopLegs(path).reduce((sum, [a, b]) => sum + calculateRouteDistanceNm(a, b), 0);
}

/** Total block time of one full loop cycle in minutes (flight legs + turnaround at every airport visited). */
export function getLoopCycleMinutes(path: Airport[], aircraft: AircraftType): number {
  let total = 0;
  for (const [a, b] of getLoopLegs(path)) {
    total += estimateFlightTimeMinutes(calculateRouteDistanceNm(a, b), aircraft);
  }
  return total + path.length * getTurnaroundMinutes(aircraft);
}

/** Max full loop cycles per day given the cycle time (min 1). */
export function maxLoopCyclesPerDay(path: Airport[], aircraft: AircraftType): number {
  return Math.max(1, Math.floor(1440 / getLoopCycleMinutes(path, aircraft)));
}

/** Standard weekly frequency schedule options (full loop cycles per week). */
export const FREQUENCY_OPTIONS: { value: number; label: string }[] = [1, 2, 3, 4].map((d) => ({
  value: d * 7,
  label: `${d}×/day (${d * 7}/wk)`,
}));

/** Frequency options for a loop — same labels as point-to-point but driven by the full cycle time. */
export function buildLoopFrequencyOptions(path: Airport[], aircraft?: AircraftType): { value: number; label: string }[] {
  if (!aircraft) return FREQUENCY_OPTIONS;
  // Weekly values (d*7) must be compared against a weekly cap, not raw cycles/day.
  const maxWeekly = 7 * maxLoopCyclesPerDay(path, aircraft);
  return FREQUENCY_OPTIONS.filter((f) => f.value <= maxWeekly);
}

/** Max weekly frequency for a loop (capped by the available schedule options). */
export function maxLoopFrequencyPerWeek(path: Airport[], aircraft?: AircraftType): number {
  if (!aircraft) return FREQUENCY_OPTIONS[FREQUENCY_OPTIONS.length - 1].value;
  // Weekly cap = cycles/day × 7 (previously returned raw cycles/day, which silently
  // clamped saved weekly frequencies down to a fraction of the selected value).
  return Math.min(7 * maxLoopCyclesPerDay(path, aircraft), FREQUENCY_OPTIONS[FREQUENCY_OPTIONS.length - 1].value);
}

export interface LegRangeCheck {
  from: string;
  to: string;
  distanceNm: number;
  feasible: boolean;
}

export interface LoopRangeCheck {
  feasible: boolean;
  legs: LegRangeCheck[];
  totalDistanceNm: number;
  effectiveRangeNm: number;
}

/**
 * Range check for a closed loop: EVERY leg must fit within the aircraft's effective range,
 * since the aircraft refuels at each stop (including the hub).
 */
export function checkLoopRange(aircraft: AircraftType, path: Airport[]): LoopRangeCheck {
  const effective = getEffectiveRangeNm(aircraft);
  const legs: LegRangeCheck[] = getLoopLegs(path).map(([a, b]) => {
    const distanceNm = calculateRouteDistanceNm(a, b);
    return { from: a.iata, to: b.iata, distanceNm, feasible: distanceNm <= effective };
  });
  return {
    feasible: legs.every((l) => l.feasible),
    legs,
    totalDistanceNm: calculateLoopDistanceNm(path),
    effectiveRangeNm: effective,
  };
}

/** Connection friction applied to non-hub→non-hub legs (transfer traffic converts worse). */
const CONNECTION_FRICTION = 0.85;

/** Per-leg demand score for a loop leg; transfer legs (neither end is the hub) are penalized. */
export function scoreLoopLegDemand(hub: Airport, from: Airport, to: Airport): number {
  const base = scoreRouteDemand(from, to);
  return from.iata !== hub.iata && to.iata !== hub.iata ? Math.round(base * CONNECTION_FRICTION) : base;
}

/** Aggregate demand score for a loop (average per leg), used for display & route cards. */
export function scoreLoopDemand(hub: Airport, path: Airport[]): number {
  const legs = getLoopLegs(path);
  if (legs.length === 0) return 0;
  const total = legs.reduce((sum, [a, b]) => sum + scoreLoopLegDemand(hub, a, b), 0);
  return Math.round(total / legs.length);
}

/**
 * Weekly economics for a closed hub loop. Each scheduled cycle flies EVERY leg once
 * (hub → stops… → destination → back to hub). For a direct route (no stops) this is
 * mathematically identical to previewRouteEconomics: two revenue legs per round trip,
 * landing fees at both ends, fuel over the full block time.
 */
export function previewLoopEconomics(
  path: Airport[], // [hub, ...stops, destination] — loop closes back to path[0]
  aircraft: AircraftType,
  frequencyPerWeek: number,
  fuelPricePerKg: number = DEFAULT_FUEL_PRICE_PER_KG,
  options: RouteEconomicsOptions = {}
): RouteEconomicsPreview {
  const hub = path[0];
  const legs = getLoopLegs(path);

  // --- Load factor model (same ramp/competition/reputation as point-to-point) ---
  const seatsPerFlight = aircraft.maxPassengers;
  const weeksActive = Math.max(0, options.weeksActive ?? 0);
  const rampFactor = 0.45 + 0.55 * (1 - Math.exp(-weeksActive / 6));
  const competitionShare = Math.min(Math.max(options.competitionShare ?? 0, 0), 1);
  const reputation = options.reputation ?? 50;

  let weeklyPassengers = 0;
  let weeklyRevenue = 0;
  let totalBlockTimeHr = 0;
  let lfWeightedSum = 0;

  for (const [a, b] of legs) {
    const distanceNm = calculateRouteDistanceNm(a, b);
    const demand = scoreLoopLegDemand(hub, a, b) / 100;
    // Mature ceiling: even the best hub pair tops out around ~90% load factor.
    const ceilingLoadFactor = 0.35 + demand * 0.55;
    let estLf = ceilingLoadFactor * rampFactor;
    estLf *= 1 - competitionShare * 0.35;
    estLf *= 1 + ((reputation - 50) / 50) * 0.1;
    estLf = Math.min(0.95, Math.max(0.1, estLf));

    const passengersPerWeek = seatsPerFlight * estLf * frequencyPerWeek; // one pass per cycle
    weeklyPassengers += passengersPerWeek;
    weeklyRevenue += passengersPerWeek * estimateTicketPrice(distanceNm);
    totalBlockTimeHr += distanceNm / Math.max(aircraft.cruiseSpeed - 40, 120);
    lfWeightedSum += estLf * passengersPerWeek;
  }

  const estLoadFactor = weeklyPassengers > 0 ? lfWeightedSum / weeklyPassengers : 0.35;
  // Blended average fare across all legs (distance-weighted by passenger volume).
  const ticketPrice =
    weeklyPassengers > 0 ? Math.round(weeklyRevenue / weeklyPassengers) : estimateTicketPrice(calculateLoopDistanceNm(path));

  weeklyPassengers = Math.round(weeklyPassengers);
  weeklyRevenue = Math.round(weeklyRevenue);

  // Hourly cost: fuel at the live market price + crew/cabin/other costs that scale with cabin size.
  const hourlyCrewAndOther = Math.max(400, aircraft.maxPassengers * 3);
  const weeklyFuelCost = Math.round(aircraft.fuelBurnPerHour * fuelPricePerKg * totalBlockTimeHr * frequencyPerWeek);
  // Blended landing/handling fees at EVERY airport touched once per cycle (incl. the hub turnaround).
  const airportFees = path.reduce((sum, a) => sum + a.landingFee, 0) * frequencyPerWeek * 0.15;
  const weeklyCosts = Math.round(
    (aircraft.fuelBurnPerHour * fuelPricePerKg + hourlyCrewAndOther) * totalBlockTimeHr * frequencyPerWeek + airportFees
  );
  const weeklyProfit = weeklyRevenue - weeklyCosts;

  return { estLoadFactor, ticketPrice, weeklyPassengers, weeklyRevenue, weeklyCosts, weeklyFuelCost, weeklyProfit };
}

// ============================================================
// Fleet compatibility helpers
// ============================================================

/**
 * Resolve a legacy AIRCRAFT_DATABASE entry by its id.
 */
export function findAircraftById(id: string): AircraftType | undefined {
  return AIRCRAFT_DATABASE.find((a) => a.id === id);
}


