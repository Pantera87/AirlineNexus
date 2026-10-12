import { Airport, AircraftType, AircraftCategory, BusinessModel } from '@/types/game';
import { getAircraftById } from '@/data/aircraft';
import { maxLoopsPerDay } from './crewRegulations';
import { getBusinessModelConfig } from './businessModels';

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
 * Crew limits (FDP per day of duty) can further reduce the count for short cycles.
 */
export function maxCyclesPerDay(distanceNm: number, aircraft: AircraftType): number {
  const cycleMin = getRouteCycleMinutes(distanceNm, aircraft);
  if (cycleMin > 1440) return 1;
  const clockCap = Math.floor(1440 / cycleMin);
  // A 2-sector day of duty (out + back) — the flight-duty period caps short cycles.
  const crewCap = maxLoopsPerDay(2, cycleMin);
  return Math.max(1, Math.min(clockCap, crewCap));
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
 * `distanceNm` is the great-circle distance the caller has already computed —
 * the discovery loops scan thousands of candidates and must not pay for the
 * trigonometry twice.
 */
function scoreRouteDemandAtDistance(origin: Airport, destination: Airport, distanceNm: number): number {
  const pairPopularity = Math.min(origin.popularity, destination.popularity) / 100;
  const crossPopularity = ((origin.popularity + destination.popularity) / 2) / 100;
  const avgPopularity = pairPopularity * 0.35 + crossPopularity * 0.65;

  // Short-haul routes carry more frequent flyers; long-haul fewer but premium.
  const distanceFactor = 1 / (1 + (distanceNm / 2500) ** 2);

  return Math.round(avgPopularity * distanceFactor * 100);
}

/** Same as above, computing the great-circle distance itself. */
export function scoreRouteDemand(origin: Airport, destination: Airport): number {
  return scoreRouteDemandAtDistance(origin, destination, calculateRouteDistanceNm(origin, destination));
}

// ============================================================
// Destination discovery & suggestions
// ============================================================

export interface ReachableDestination {
  airport: Airport;
  distanceNm: number;
  demandScore: number;
}

// The candidate scan below is over the static airport database, so repeated
// screen opens (routes panel, charter panel) reuse the previous result instead
// of re-scanning. Keyed first by the candidate array identity, so a caller that
// passes a different list can never borrow another list's results.
const reachableCache = new WeakMap<Airport[], Map<string, ReachableDestination[]>>();

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
  const byKey = reachableCache.get(allAirports) ?? (() => {
    const created = new Map<string, ReachableDestination[]>();
    reachableCache.set(allAirports, created);
    return created;
  })();
  const cacheKey = `${origin.iata}|${aircraft.id}|${maxResults}`;
  const cached = byKey.get(cacheKey);
  if (cached) return cached;

  const effective = getEffectiveRangeNm(aircraft);
  // A great-circle distance is never smaller than the latitude separation
  // (1° of latitude is 60 nm), so candidates further apart in latitude than the
  // range allows are unreachable — drop them before paying for the trigonometry.
  const maxLatitudeDeltaDeg = effective / 60;
  const results: ReachableDestination[] = [];

  for (const dest of allAirports) {
    if (dest.iata === origin.iata) continue;
    if (Math.abs(dest.latitude - origin.latitude) > maxLatitudeDeltaDeg) continue;
    const distanceNm = calculateRouteDistanceNm(origin, dest);
    if (distanceNm > effective) continue;
    results.push({
      airport: dest,
      distanceNm,
      demandScore: scoreRouteDemandAtDistance(origin, dest, distanceNm),
    });
  }

  results.sort((a, b) => b.demandScore - a.demandScore);
  const limited = results.slice(0, maxResults);
  if (byKey.size > 64) byKey.clear();
  byKey.set(cacheKey, limited);
  return limited;
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
  /** Average ticket price per passenger (onboard/in-flight revenue excluded). */
  ticketPrice: number;
  weeklyPassengers: number;
  /** Total weekly revenue: ticket sales + in-flight ancillary sales. */
  weeklyRevenue: number;
  /** Weekly revenue from in-flight purchases (part of weeklyRevenue, excluded from ticketPrice). */
  weeklyOnboardRevenue: number;
  weeklyCosts: number;
  weeklyFuelCost: number;
  weeklyProfit: number;
}

/**
 * Distance-based ticket price heuristic (realistic one-way average fares).
 * `model` scales the result by the business model's base fare (e.g. low-cost 0.65×,
 * luxury 1.5×). Omitted → full-service baseline, so existing callers are unchanged.
 */
export function estimateTicketPrice(distanceNm: number, model?: BusinessModel): number {
  const base = 40; // fixed booking/airport surcharge component
  const perNm = distanceNm < 1500 ? 0.22 : 0.16; // long-haul fares grow more slowly per mile
  const longHaulPremium = distanceNm > 4000 ? 90 : 0; // intercontinental premium
  const distanceBase = Math.round(base + distanceNm * perNm + longHaulPremium);
  return Math.max(1, Math.round(distanceBase * getBusinessModelConfig(model).fareMultiplier));
}

/**
 * Load-factor adjustment from the ticket price relative to the RECOMMENDED (revenue-
 * maximizing) price. The recommended price is the structural revenue maximum:
 *   - price ratio ≤ 1 (discount): passengers are price-attracted, LF rises with a
 *     slope of 0.5 — at 50% of recommended the LF is +25% (capped at ~97%).
 *   - price ratio > 1 (premium): price-sensitive passengers drop off quadratically,
 *     LF decays as ratio^-2 (floored at 5%).
 * `baseLoadFactor` is the demand/competition/reputation estimate at the recommended price.
 */
export function priceLoadFactor(baseLoadFactor: number, priceRatio: number): number {
  const r = Math.max(0.05, priceRatio); // guard against zero/negative ratios
  if (r <= 1) {
    return Math.min(0.97, baseLoadFactor * (1 + 0.5 * (1 - r)));
  }
  return Math.max(0.05, baseLoadFactor / (r * r));
}

/** Options that shape the load-factor model (all optional for backward compatibility) */
export interface RouteEconomicsOptions {
  /** Weeks this route has been operating — drives the new-route ramp-up. Defaults to 0 (brand-new route). */
  weeksActive?: number;
  /** Combined competitor market share on this route, 0-1. Defaults to 0 (no competition). */
  competitionShare?: number;
  /** Airline reputation 0-100. Defaults to 50 (neutral). */
  reputation?: number;
  /** Airline business model — shapes the recommended fare, load factor, in-flight revenue and hourly costs. Defaults to 'full-service'. */
  model?: BusinessModel;
  /** Player-set ticket price as a multiple of the model's recommended (revenue-maximizing) price. Defaults to 1.0 (recommended). */
  fareMultiplier?: number;
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
 * `options.model` applies the airline's business model (recommended fare, in-flight
 * ancillary revenue, load-factor and hourly-cost modifiers), and `options.fareMultiplier`
 * is the player-set price as a multiple of that model's recommended (revenue-maximizing) price.
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
  const model = getBusinessModelConfig(options.model);
  const priceRatio = Math.max(0.05, options.fareMultiplier ?? 1);

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

  // Business-model appeal (e.g. low-cost carriers fill seats more easily).
  estLoadFactor *= model.loadFactorModifier;
  estLoadFactor = Math.min(0.95, Math.max(0.1, estLoadFactor));

  // Price elasticity: the model's recommended price is the revenue-maximizing one.
  estLoadFactor = priceLoadFactor(estLoadFactor, priceRatio);

  // Recommended price (model-scaled distance heuristic); the player's price is a multiple of it.
  const recommendedPrice = estimateTicketPrice(distanceNm, options.model);
  const ticketPrice = Math.max(1, Math.round(recommendedPrice * priceRatio));

  // Each scheduled unit is a round trip: two revenue-generating legs (outbound + return).
  const legsPerWeek = 2 * frequencyPerWeek;
  const weeklyPassengers = Math.round(seatsPerFlight * estLoadFactor * legsPerWeek);
  const weeklyOnboardRevenue = Math.round(weeklyPassengers * model.onboardRevenuePerPax);
  const weeklyRevenue = weeklyPassengers * ticketPrice + weeklyOnboardRevenue;
  // Block time uses average speed (cruise minus taxi/climb/descent losses)
  const blockTimeHr = distanceNm / Math.max(aircraft.cruiseSpeed - 40, 120);
  // Hourly cost: fuel at the live market price + crew/cabin/other costs that scale with cabin size
  // (scaled by the business model — full-service and luxury crews cost more per hour).
  const hourlyCrewAndOther = Math.max(400, aircraft.maxPassengers * 3) * model.hourlyCostModifier;
  const weeklyFuelCost = Math.round(aircraft.fuelBurnPerHour * fuelPricePerKg * blockTimeHr * legsPerWeek);
  // Blended landing/handling fees at BOTH ends. Airport data stores per-landing list prices;
  // we charge a blended share covering landing, handling and terminal fees.
  const airportFees = (origin.landingFee + destination.landingFee) * frequencyPerWeek * 0.15;
  const weeklyCosts = Math.round(
    (aircraft.fuelBurnPerHour * fuelPricePerKg + hourlyCrewAndOther) * blockTimeHr * legsPerWeek + airportFees
  );
  const weeklyProfit = weeklyRevenue - weeklyCosts;

  return { estLoadFactor, ticketPrice, weeklyPassengers, weeklyRevenue, weeklyOnboardRevenue, weeklyCosts, weeklyFuelCost, weeklyProfit };
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

/**
 * Max full loop cycles per day given the cycle time (min 1). Cycles longer than
 * 24h still operate once per day (overnight stay); the flight-duty-period cap
 * (maxLoopsPerDay) limits short cycles the same way crew limits do in real ops.
 */
export function maxLoopCyclesPerDay(path: Airport[], aircraft: AircraftType): number {
  const cycleMin = getLoopCycleMinutes(path, aircraft);
  if (cycleMin > 1440) return 1;
  const clockCap = Math.floor(1440 / cycleMin);
  const crewCap = maxLoopsPerDay(getLoopLegs(path).length, cycleMin);
  return Math.max(1, Math.min(clockCap, crewCap));
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
  const model = getBusinessModelConfig(options.model);
  const priceRatio = Math.max(0.05, options.fareMultiplier ?? 1);

  // --- Load factor model (same ramp/competition/reputation as point-to-point) ---
  const seatsPerFlight = aircraft.maxPassengers;
  const weeksActive = Math.max(0, options.weeksActive ?? 0);
  const rampFactor = 0.45 + 0.55 * (1 - Math.exp(-weeksActive / 6));
  const competitionShare = Math.min(Math.max(options.competitionShare ?? 0, 0), 1);
  const reputation = options.reputation ?? 50;

  let weeklyPassengers = 0;
  let weeklyTicketRevenue = 0;
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
    estLf *= model.loadFactorModifier;
    estLf = Math.min(0.95, Math.max(0.1, estLf));
    // Price elasticity is applied per leg at the player's price ratio (same ratio on every leg).
    estLf = priceLoadFactor(estLf, priceRatio);

    const passengersPerWeek = seatsPerFlight * estLf * frequencyPerWeek; // one pass per cycle
    weeklyPassengers += passengersPerWeek;
    // Model-scaled recommended fare for THIS leg, priced at the player's ratio.
    const legPrice = Math.max(1, Math.round(estimateTicketPrice(distanceNm, options.model) * priceRatio));
    weeklyTicketRevenue += passengersPerWeek * legPrice;
    totalBlockTimeHr += distanceNm / Math.max(aircraft.cruiseSpeed - 40, 120);
    lfWeightedSum += estLf * passengersPerWeek;
  }

  const estLoadFactor = weeklyPassengers > 0 ? lfWeightedSum / weeklyPassengers : 0.35;
  // Blended average TICKET fare across all legs (passenger-volume weighted, in-flight revenue excluded).
  const ticketPrice =
    weeklyPassengers > 0 ? Math.round(weeklyTicketRevenue / weeklyPassengers) : estimateTicketPrice(calculateLoopDistanceNm(path), options.model);

  weeklyPassengers = Math.round(weeklyPassengers);
  const weeklyOnboardRevenue = Math.round(weeklyPassengers * model.onboardRevenuePerPax);
  const weeklyRevenue = Math.round(weeklyTicketRevenue) + weeklyOnboardRevenue;

  // Hourly cost: fuel at the live market price + crew/cabin/other costs that scale with cabin size
  // (scaled by the business model — full-service and luxury crews cost more per hour).
  const hourlyCrewAndOther = Math.max(400, aircraft.maxPassengers * 3) * model.hourlyCostModifier;
  const weeklyFuelCost = Math.round(aircraft.fuelBurnPerHour * fuelPricePerKg * totalBlockTimeHr * frequencyPerWeek);
  // Blended landing/handling fees at EVERY airport touched once per cycle (incl. the hub turnaround).
  const airportFees = path.reduce((sum, a) => sum + a.landingFee, 0) * frequencyPerWeek * 0.15;
  const weeklyCosts = Math.round(
    (aircraft.fuelBurnPerHour * fuelPricePerKg + hourlyCrewAndOther) * totalBlockTimeHr * frequencyPerWeek + airportFees
  );
  const weeklyProfit = weeklyRevenue - weeklyCosts;

  return { estLoadFactor, ticketPrice, weeklyPassengers, weeklyRevenue, weeklyOnboardRevenue, weeklyCosts, weeklyFuelCost, weeklyProfit };
}

// ============================================================
// Charter / corporate point-to-point missions
// ------------------------------------------------------------
// A charter mission is NOT a hub loop: an airframe is positioned to the
// mission origin, flies ONE revenue leg with passengers, then deadheads
// (empty) back to its mission base to be ready for the next call-out.
// `frequency` therefore counts REVENUE trips per week, and the empty leg
// carries every operating cost (fuel, block time, fees, crew time) but no
// revenue. Charter traffic is also point-to-point: it does not compete with
// scheduled airlines for a market share and it decays far more slowly with
// distance, because business pairs fly direct by definition.
// ============================================================

/** Weekly cap on missions offered per route — charterers book a limited schedule. */
export const CHARTER_MAX_TRIPS_PER_WEEK = 14;

/** Mission-frequency options (revenue trips per week) — charters are booked per trip, not per day. */
export const CHARTER_TRIP_OPTIONS: number[] = [1, 2, 3, 4, 5, 6, 7, 10, 14];

/** Full mission cycle minutes: revenue leg + turnaround + empty return leg + turnaround at base. */
export function charterCycleMinutes(origin: Airport, destination: Airport, aircraft: AircraftType): number {
  return getRouteCycleMinutes(calculateRouteDistanceNm(origin, destination), aircraft);
}

/** Missions per week one airframe can complete on this pair (cycle-time + crew-duty limited). */
export function maxCharterTripsPerWeek(origin: Airport, destination: Airport, aircraft: AircraftType): number {
  return 7 * maxCyclesPerDay(calculateRouteDistanceNm(origin, destination), aircraft);
}

/** Weekly mission cap clamped to the offered options — what the store hard-caps saves at. */
export function maxCharterFrequencyPerWeek(origin: Airport, destination: Airport, aircraft?: AircraftType): number {
  if (!aircraft) return CHARTER_TRIP_OPTIONS[CHARTER_TRIP_OPTIONS.length - 1];
  return Math.min(maxCharterTripsPerWeek(origin, destination, aircraft), CHARTER_TRIP_OPTIONS[CHARTER_TRIP_OPTIONS.length - 1]);
}

/** Mission-frequency options limited to what this aircraft can physically fly on this pair. */
export function buildCharterTripOptions(
  origin: Airport,
  destination: Airport,
  aircraft?: AircraftType
): { value: number; label: string }[] {
  const cap = aircraft ? maxCharterTripsPerWeek(origin, destination, aircraft) : CHARTER_MAX_TRIPS_PER_WEEK;
  const options = CHARTER_TRIP_OPTIONS
    .filter((n) => n <= cap)
    .map((n) => ({ value: n, label: n === 1 ? '1 mission/wk' : `${n} missions/wk` }));
  return options.length > 0 ? options : [{ value: 1, label: '1 mission/wk' }];
}

/**
 * Charter mission demand (0–100). Corporate traffic needs business traffic at
 * BOTH ends (the smaller market dominates), and distance decays far more gently
 * than scheduled traffic because missions are point-to-point by definition.
 * `distanceNm` is the great-circle distance the caller already computed.
 */
function scoreCharterDemandAtDistance(
  origin: Airport,
  destination: Airport,
  distanceNm: number,
  model?: BusinessModel
): number {
  const pairPopularity = Math.min(origin.popularity, destination.popularity) / 100;
  const crossPopularity = ((origin.popularity + destination.popularity) / 2) / 100;
  const corporateBase = pairPopularity * 0.75 + crossPopularity * 0.25;

  const distanceFactor = 1 / (1 + (distanceNm / 5000) ** 2);

  const factor = getBusinessModelConfig(model).charterDemandFactor ?? 1;
  return Math.round(Math.min(1, Math.max(0, corporateBase * distanceFactor * factor)) * 100);
}

/** Same as above, computing the great-circle distance itself. */
export function scoreCharterDemand(origin: Airport, destination: Airport, model?: BusinessModel): number {
  return scoreCharterDemandAtDistance(origin, destination, calculateRouteDistanceNm(origin, destination), model);
}

export interface CharterMission {
  airport: Airport;
  distanceNm: number;
  demandScore: number;
}

/** Candidate discovery for charter missions — see the note on findReachableDestinations. */
const charterCache = new WeakMap<Airport[], Map<string, CharterMission[]>>();

/** All airports within this aircraft's range of `origin`, best charter missions first. */
export function findCharterMissions(
  origin: Airport,
  aircraft: AircraftType,
  allAirports: Airport[],
  maxResults = 50,
  model?: BusinessModel
): CharterMission[] {
  const byKey = charterCache.get(allAirports) ?? (() => {
    const created = new Map<string, CharterMission[]>();
    charterCache.set(allAirports, created);
    return created;
  })();
  const cacheKey = `${origin.iata}|${aircraft.id}|${maxResults}|${model ?? ''}`;
  const cached = byKey.get(cacheKey);
  if (cached) return cached;

  const effective = getEffectiveRangeNm(aircraft);
  const maxLatitudeDeltaDeg = effective / 60;
  const results: CharterMission[] = [];
  for (const dest of allAirports) {
    if (dest.iata === origin.iata) continue;
    if (Math.abs(dest.latitude - origin.latitude) > maxLatitudeDeltaDeg) continue;
    const distanceNm = calculateRouteDistanceNm(origin, dest);
    if (distanceNm > effective) continue;
    results.push({ airport: dest, distanceNm, demandScore: scoreCharterDemandAtDistance(origin, dest, distanceNm, model) });
  }
  results.sort((a, b) => b.demandScore - a.demandScore);
  const limited = results.slice(0, maxResults);
  if (byKey.size > 64) byKey.clear();
  byKey.set(cacheKey, limited);
  return limited;
}

/** Top N charter mission suggestions from `origin` for this aircraft type. */
export function suggestCharterMissions(
  origin: Airport,
  aircraft: AircraftType,
  allAirports: Airport[],
  count = 6,
  model?: BusinessModel
): CharterMission[] {
  return findCharterMissions(origin, aircraft, allAirports, count, model);
}

/**
 * Share (0–1) of a charter mission's operating cost that belongs to the EMPTY
 * repositioning leg — used by the finance insights to report the deadhead cost
 * as its own category instead of hiding it inside crew costs.
 */
export function charterDeadheadCostShare(model?: BusinessModel): number {
  const factor = getBusinessModelConfig(model).deadheadCostFactor ?? 1;
  if (factor <= 0) return 0;
  return factor / (1 + factor);
}

/**
 * Weekly economics for a charter mission pair. One scheduled unit = one revenue
 * leg with passengers PLUS one empty leg back to the mission base, so costs are
 * charged for both legs while passengers and ticket revenue come from one only.
 * Charter missions have no player-set fare (the charterer names the fare) and no
 * competitor market share (nothing else flies the mission).
 */
export function previewCharterEconomics(
  origin: Airport,
  destination: Airport,
  aircraft: AircraftType,
  tripsPerWeek: number,
  fuelPricePerKg: number = DEFAULT_FUEL_PRICE_PER_KG,
  options: RouteEconomicsOptions = {}
): RouteEconomicsPreview {
  const model = getBusinessModelConfig(options.model);
  const distanceNm = calculateRouteDistanceNm(origin, destination);
  const seatsPerFlight = aircraft.maxPassengers;

  // --- Mission load factor ---
  const demand = scoreCharterDemand(origin, destination, options.model) / 100;
  // Missions are booked whole, so they fly fuller than a scheduled flight on the same pair.
  const ceilingLoadFactor = 0.45 + demand * 0.5;
  // New corridors take a few weeks for clients to start booking them.
  const weeksActive = Math.max(0, options.weeksActive ?? 0);
  const rampFactor = 0.6 + 0.4 * (1 - Math.exp(-weeksActive / 4));
  const reputation = options.reputation ?? 50;

  let estLoadFactor = ceilingLoadFactor * rampFactor;
  estLoadFactor *= 1 + ((reputation - 50) / 50) * 0.1;
  estLoadFactor *= model.loadFactorModifier;
  estLoadFactor = Math.min(0.98, Math.max(0.1, estLoadFactor));

  // The charterer's fare: the model-scaled recommendation for this pair (no player ratio).
  const ticketPrice = Math.max(1, Math.round(estimateTicketPrice(distanceNm, options.model)));

  const weeklyPassengers = Math.round(seatsPerFlight * estLoadFactor * tripsPerWeek);
  const weeklyOnboardRevenue = Math.round(weeklyPassengers * model.onboardRevenuePerPax);
  const weeklyRevenue = Math.round(weeklyPassengers * ticketPrice) + weeklyOnboardRevenue;

  // --- Costs: BOTH legs (block time is what the airframe actually flies) ---
  const legBlockHr = distanceNm / Math.max(aircraft.cruiseSpeed - 40, 120);
  const deadheadFactor = model.deadheadCostFactor ?? 1;
  const blockTimeHr = legBlockHr * (1 + deadheadFactor);
  const hourlyCrewAndOther = Math.max(400, aircraft.maxPassengers * 3) * model.hourlyCostModifier;
  const weeklyFuelCost = Math.round(aircraft.fuelBurnPerHour * fuelPricePerKg * blockTimeHr * tripsPerWeek);
  // Blended landing/handling fees at BOTH airports once per rotation (same formula as a
  // direct point-to-point loop, so the finance split lines up with the settlement).
  const airportFees = (origin.landingFee + destination.landingFee) * tripsPerWeek * 0.15;
  const weeklyCosts = Math.round(
    (aircraft.fuelBurnPerHour * fuelPricePerKg + hourlyCrewAndOther) * blockTimeHr * tripsPerWeek + airportFees
  );
  const weeklyProfit = weeklyRevenue - weeklyCosts;

  return { estLoadFactor, ticketPrice, weeklyPassengers, weeklyRevenue, weeklyOnboardRevenue, weeklyCosts, weeklyFuelCost, weeklyProfit };
}

// ============================================================
// Fleet compatibility helpers
// ============================================================

/**
 * Resolve a legacy AIRCRAFT_DATABASE entry by its id.
 */
export function findAircraftById(id: string): AircraftType | undefined {
  return getAircraftById(id);
}


