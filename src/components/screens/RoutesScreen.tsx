import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@store/gameStore';
import type { Route, AircraftType, Airport, Aircraft } from '@/types/game';
import { getAirportByIata, AIRPORT_DATABASE } from '@data/airports';
import { AIRCRAFT_DATABASE } from '@data/aircraft';
import { formatCurrency, formatPercentage } from '@utils/helpers';
import { Map, Plus, X, Plane, ArrowRight, Lightbulb, CheckCircle2, AlertTriangle, Pencil, Trash2, Pause, Play, Clock, Repeat } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AirportPicker } from '@/components/AirportPicker';
import {
  calculateRouteDistanceNm,
  estimateFlightTimeMinutes,
  formatFlightTime,
  suggestDestinations,
  getEffectiveRangeNm,
  getRoutePath,
  getLoopLegs,
  calculateLoopDistanceNm,
  checkLoopRange,
  scoreLoopDemand,
  previewLoopEconomics,
  maxLoopCyclesPerDay,
  getLoopCycleMinutes,
} from '@/utils/routeEngine';
import { getRequiredAircraftCount, getPoolStats, getRouteStaffing } from '@/utils/fleetDispatcher';

/** Fallback frequency options when no aircraft type / distance is known yet (up to 4x/day). */
const FALLBACK_FREQUENCY_OPTIONS: { value: number; label: string }[] = [1, 2, 3, 4].map((d) => ({
  value: d * 7,
  label: `${d}×/day (${d * 7}/wk)`,
}));

/** Max intermediate stops allowed on a hub loop (HUB → S1…Sn → DEST → HUB). */
export const MAX_ROUTE_STOPS = 3;

/**
 * Frequency options (full loop cycles per week) limited by the aircraft's physical availability:
 * one option per possible cycles/day, but never more than 4×/day — the store hard-caps weekly
 * frequency at 28, so offering values above that would produce selections that can't be saved.
 */
function buildFrequencyOptions(
  pathAirports: Airport[] | null,
  aircraftType: AircraftType | undefined
): { value: number; label: string }[] {
  if (!pathAirports || !aircraftType) return FALLBACK_FREQUENCY_OPTIONS;
  const maxDaily = Math.min(maxLoopCyclesPerDay(pathAirports, aircraftType), 4);
  const options: { value: number; label: string }[] = [];
  for (let d = 1; d <= maxDaily; d++) {
    options.push({ value: d * 7, label: `${d}×/day (${d * 7}/wk)` });
  }
  return options;
}

/** Weekly frequency cap (loop cycles/wk) for this loop + aircraft. */
function maxWeeklyFrequency(pathAirports: Airport[] | null, aircraftType: AircraftType | undefined): number {
  if (!pathAirports || !aircraftType) return 28; // legacy hard cap when unknown
  return 7 * maxLoopCyclesPerDay(pathAirports, aircraftType);
}

/** Availability breakdown line, e.g. "Full loop ≈ 9h 30m incl. turnarounds → max 2×/day". */
function availabilitySummary(pathAirports: Airport[] | null, aircraftType: AircraftType | undefined): string | null {
  if (!pathAirports || !aircraftType) return null;
  const cycleMin = getLoopCycleMinutes(pathAirports, aircraftType);
  const maxDaily = maxLoopCyclesPerDay(pathAirports, aircraftType);
  return `Full loop ≈ ${formatFlightTime(cycleMin)} incl. turnarounds → max ${maxDaily}×/day`;
}

/** Resolve a route's full loop path (HUB → stops… → DEST) to airport objects, or null if any IATA is unknown. */
function resolvePathAirports(iatas: string[]): Airport[] | null {
  const airports = iatas.map((iata) => getAirportByIata(iata));
  return airports.every((a) => !!a) ? (airports as Airport[]) : null;
}

function formatFrequency(frequencyPerWeek: number): string {
  if (frequencyPerWeek === 7) return 'Daily';
  if (frequencyPerWeek > 7 && frequencyPerWeek % 7 === 0) return `${frequencyPerWeek / 7}x/day`;
  return `${frequencyPerWeek}/wk`;
}

export function RoutesScreen() {
  const airline = useGameStore((state) => state.airline);
  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);
  const addNotification = useGameStore((state) => state.addNotification);
  const createRoute = useGameStore((state) => state.createRoute);
  const updateRoute = useGameStore((state) => state.updateRoute);
  const cancelRoute = useGameStore((state) => state.cancelRoute);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  // Hub policy: every route originates from (and returns to) the airline's headquarters.
  const hubIata = airline?.headquarters ?? '';
  const [destination, setDestination] = useState('');
  const [stops, setStops] = useState<string[]>([]);
  const [aircraftTypeId, setAircraftTypeId] = useState('');
  const [frequency, setFrequency] = useState(7);

  if (!airline) return null;

  const ownedTypeIds = new Set(airline.fleet.map((a) => a.typeId));

  const handleCreateRoute = () => {
    if (!destination || destination === hubIata) {
      addNotification({
        type: 'error',
        title: 'Invalid Route',
        message: `Please select a destination airport (different from your hub ${hubIata}).`,
      });
      return;
    }

    const ok = createRoute({
      origin: hubIata,
      destination,
      stops,
      aircraftType: aircraftTypeId || undefined,
      frequencyPerWeek: frequency,
    });

    if (ok) {
      addNotification({
        type: 'success',
        title: 'Route Created',
        message: `Loop ${getRoutePath({ origin: hubIata, stops, destination }).join(' → ')} has been created.`,
      });
      setShowCreateModal(false);
      setDestination('');
      setStops([]);
    } else {
      addNotification({
        type: 'error',
        title: 'Invalid Route',
        message: 'Could not create the route. Check that every leg fits within your aircraft\'s range and no airport is repeated.',
      });
    }
  };

  const selectedRoute = airline.routes.find((r) => r.id === selectedRouteId) ?? null;

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Route Management</h1>
          <p className="text-sm text-runway-400">{airline.routes.length} routes total</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Route
        </button>
      </div>

      {airline.routes.length === 0 ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center text-center">
          <Map className="w-12 h-12 text-runway-500 mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No routes yet</h2>
          <p className="text-sm text-runway-400 mb-4">Create your first route to start generating revenue.</p>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create First Route
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {airline.routes.map((route) => {
            const pathIatas = getRoutePath(route);
            const stopCount = route.stops?.length ?? 0;
            const distanceNm = route.distanceNm ?? 0;
            // Live staffing from the shared fleet pool (see utils/fleetDispatcher).
            const routeType = AIRCRAFT_DATABASE.find((t) => t.id === route.aircraftId);
            const staffedCount = getRouteStaffing(airline.fleet, route.id);
            const requiredCount = getRequiredAircraftCount(resolvePathAirports(pathIatas), routeType, route.frequency);
            return (
              <div
                key={route.id}
                className="glass-panel p-5 cursor-pointer transition-colors hover:border-white/20"
                onClick={() => setSelectedRouteId(route.id)}
                title="Click to manage this route"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                      <Plane className="w-5 h-5 text-sky-400" />
                    </div>
                    <div>
                      <p className="font-bold text-white">
                        {pathIatas.join(' → ')}
                      </p>
                      <p className="text-xs text-runway-400">
                        Hub loop · {stopCount > 0 ? `${stopCount} intermediate stop${stopCount > 1 ? 's' : ''}` : 'direct'} · returns to {route.origin}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {routeType && (
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          !route.isActive
                            ? 'bg-white/5 text-runway-400'
                            : requiredCount > 0 && staffedCount >= requiredCount
                              ? 'bg-green-500/10 text-green-400'
                              : staffedCount > 0
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-red-500/10 text-red-400'
                        }`}
                        title="Aircraft from your shared fleet pool assigned to this route. Same-type aircraft can also be shared across routes within their weekly workload."
                      >
                        {staffedCount}/{requiredCount} aircraft
                      </span>
                    )}
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        route.isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {route.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRouteId(route.id);
                      }}
                      className="p-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-runway-400 hover:text-white hover:border-white/25 transition-colors"
                      title="Manage route"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  {pathIatas.map((iata, i) => (
                    <span key={iata} className="flex items-center gap-2">
                      {i > 0 && <ArrowRight className="w-3 h-3 text-runway-500" />}
                      <span className={`text-xs font-bold ${i === 0 ? 'text-sky-400' : 'text-white'}`}>{iata}</span>
                    </span>
                  ))}
                  <ArrowRight className="w-3 h-3 text-runway-500" />
                  <span title={`Returns to hub ${route.origin}`} className="inline-flex items-center">
                    <Repeat className="w-3.5 h-3.5 text-sky-400" />
                  </span>
                  <span className="text-xs font-bold text-sky-400">{route.origin}</span>
                  <span className="text-xs text-runway-400 flex-1 truncate">
                    {distanceNm > 0 ? `${distanceNm.toLocaleString()} nm loop` : ''}
                    {route.flightTimeMin ? ` · ${formatFlightTime(route.flightTimeMin)}` : ''}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div>
                    <p className="text-xs text-runway-500">Frequency</p>
                    <p className="text-sm font-medium text-white">{formatFrequency(route.frequency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-runway-500">Demand</p>
                    <p className="text-sm font-medium text-sky-400">
                      {route.demandScore !== undefined ? route.demandScore : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-runway-500">Load Factor</p>
                    <p className="text-sm font-medium text-white">{formatPercentage(route.avgLoadFactor)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-runway-500">Profit</p>
                    <p className={`text-sm font-medium ${route.profitability >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(route.revenue - route.cost, currencyFormat, true)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}


      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-2xl max-h-[85vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <h2 className="text-xl font-bold text-white">Create New Route</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-runway-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <RouteCreationForm
                hubIata={hubIata}
                destination={destination}
                stops={stops}
                aircraftTypeId={aircraftTypeId}
                frequency={frequency}
                ownedTypeIds={ownedTypeIds}
                currencyFormat={currencyFormat}
                onDestinationChange={(iata) => {
                  setDestination(iata);
                  // Keep the chain valid: a destination can't also be an intermediate stop.
                  if (stops.includes(iata)) setStops(stops.filter((s) => s !== iata));
                }}
                onStopsChange={setStops}
                fleet={airline.fleet}
                onAircraftTypeChange={setAircraftTypeId}
                onFrequencyChange={setFrequency}
                onCreate={handleCreateRoute}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedRoute && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedRouteId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-2xl max-h-[85vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <RouteDetailModal
                route={selectedRoute}
                ownedTypeIds={ownedTypeIds}
                currencyFormat={currencyFormat}
                onClose={() => setSelectedRouteId(null)}
                onSave={(frequency, aircraftTypeId) => {
                  const ok = updateRoute(selectedRoute.id, {
                    frequency,
                    ...(aircraftTypeId ? { aircraftType: aircraftTypeId } : {}),
                  });
                  if (ok) {
                    addNotification({
                      type: 'success',
                      title: 'Route Updated',
                      message: `Route ${selectedRoute.origin} → ${selectedRoute.destination} has been updated.`,
                    });
                    setSelectedRouteId(null); // close the modal after a successful save
                  } else {
                    addNotification({
                      type: 'error',
                      title: 'Update Failed',
                      message: 'Could not update the route. Check your selections.',
                    });
                  }
                }}
                onToggleActive={() => {
                  const ok = updateRoute(selectedRoute.id, { isActive: !selectedRoute.isActive });
                  if (ok) {
                    addNotification({
                      type: selectedRoute.isActive ? 'warning' : 'success',
                      title: selectedRoute.isActive ? 'Route Paused' : 'Route Resumed',
                      message: `Route ${selectedRoute.origin} → ${selectedRoute.destination} is now ${
                        selectedRoute.isActive ? 'paused' : 'active'
                      }.`,
                    });
                  }
                }}
                onCancel={() => {
                  const ok = cancelRoute(selectedRoute.id);
                  if (ok) {
                    addNotification({
                      type: 'warning',
                      title: 'Route Cancelled',
                      message: `Route ${selectedRoute.origin} → ${selectedRoute.destination} has been cancelled and removed.`,
                    });
                    setSelectedRouteId(null);
                  }
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface RouteCreationFormProps {
  hubIata: string;
  destination: string;
  stops: string[];
  aircraftTypeId: string;
  frequency: number;
  ownedTypeIds: Set<string>;
  /** Full fleet — used for the live pool-availability check. */
  fleet: Aircraft[];
  currencyFormat: 'USD' | 'EUR' | 'GBP';
  onDestinationChange: (iata: string) => void;
  onStopsChange: (stops: string[]) => void;
  onAircraftTypeChange: (id: string) => void;
  onFrequencyChange: (freq: number) => void;
  onCreate: () => void;
}

function RouteCreationForm({
  hubIata,
  destination,
  stops,
  aircraftTypeId,
  frequency,
  ownedTypeIds,
  currencyFormat,
  onDestinationChange,
  onStopsChange,
  onAircraftTypeChange,
  onFrequencyChange,
  onCreate,
  fleet,
}: RouteCreationFormProps) {
  const [suggestionIata, setSuggestionIata] = useState<string | null>(null);
  const [showStopPicker, setShowStopPicker] = useState(false);
  // Live market fuel price — route costs track the dynamic fuel market.
  const fuelPricePerKg = useGameStore((state) => state.world.fuelPrice);

  const hubAirport = useMemo(() => (hubIata ? getAirportByIata(hubIata) : undefined), [hubIata]);
  // Full loop path: HUB → stops… → DEST. The return leg to the hub is implicit in all loop math.
  const pathAirports = useMemo(
    () => (destination && hubAirport ? resolvePathAirports([hubIata, ...stops, destination]) : null),
    [hubIata, hubAirport, stops, destination]
  );

  const aircraftType = useMemo(
    () => AIRCRAFT_DATABASE.find((t) => t.id === aircraftTypeId),
    [aircraftTypeId]
  );

  // Display distance: one-way for direct routes (legacy behavior), full loop total for multi-hop.
  const isMultiHop = stops.length > 0;
  const distanceNm = pathAirports
    ? isMultiHop
      ? calculateLoopDistanceNm(pathAirports)
      : calculateRouteDistanceNm(pathAirports[0]!, pathAirports[pathAirports.length - 1]!)
    : null;
  // Range must hold for EVERY leg of the loop, including the return to hub.
  const rangeCheck = aircraftType && pathAirports ? checkLoopRange(aircraftType, pathAirports) : null;
  const flightTimeMin =
    pathAirports && aircraftType
      ? isMultiHop
        ? getLoopLegs(pathAirports).reduce(
            (sum, [a, b]) => sum + estimateFlightTimeMinutes(calculateRouteDistanceNm(a, b), aircraftType),
            0
          )
        : estimateFlightTimeMinutes(distanceNm ?? 0, aircraftType)
      : null;

  // Frequency options & cap are driven by the full loop cycle time of the selected aircraft.
  const frequencyOptions = buildFrequencyOptions(pathAirports, aircraftType);
  const maxWeekly = maxWeeklyFrequency(pathAirports, aircraftType);
  const availability = availabilitySummary(pathAirports, aircraftType);
  // Auto-clamp if the chosen frequency exceeds what this aircraft can physically fly per week.
  useEffect(() => {
    if (frequency > maxWeekly) onFrequencyChange(maxWeekly);
  }, [maxWeekly, frequency]);

  const suggestions = useMemo(() => {
    if (!hubAirport || !aircraftType) return [];
    return suggestDestinations(hubAirport, aircraftType, AIRPORT_DATABASE);
  }, [hubAirport, aircraftType]);

  const demandScore = hubAirport && pathAirports ? scoreLoopDemand(hubAirport, pathAirports) : null;
  const economics =
    pathAirports && aircraftType
      ? previewLoopEconomics(pathAirports, aircraftType, frequency, fuelPricePerKg)
      : null;

  // Airports already used in the chain (hub + destination + stops) can't be picked again.
  const usedIatas = [hubIata, destination, ...stops].filter(Boolean);

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-runway-300 mb-1.5 block">Origin Airport (Hub)</label>
          <div className="flex items-center justify-between p-3 rounded-lg bg-sky-500/10 border border-sky-500/30" title="All routes start and end at your hub">
            <span className="flex items-center gap-2 min-w-0">
              <Repeat className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="font-bold text-white">{hubIata}</span>
              {hubAirport && (
                <span className="text-xs text-runway-400 truncate">
                  {hubAirport.city}, {hubAirport.country}
                </span>
              )}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-sky-400/80 shrink-0 ml-2">Locked</span>
          </div>
        </div>
        <AirportPicker label="Destination Airport" value={destination || null} onChange={onDestinationChange} excludeIatas={usedIatas} />
      </div>

      {/* Intermediate stops (optional, max 3) */}
      <div>
        <label className="text-xs font-medium text-runway-300 mb-1.5 block">
          Intermediate Stops <span className="text-runway-500">(optional · up to {MAX_ROUTE_STOPS})</span>
        </label>
        {stops.length === 0 ? (
          <p className="text-xs text-runway-400 mb-2">No stops — this is a direct hub loop.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-2">
            {stops.map((iata, i) => (
              <span key={iata} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/10 text-xs">
                <span className="text-runway-500">{i + 1}.</span>
                <span className="font-semibold text-white">{iata}</span>
                <button onClick={() => onStopsChange(stops.filter((s) => s !== iata))} className="text-runway-400 hover:text-red-400" title={`Remove stop ${iata}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {stops.length < MAX_ROUTE_STOPS ? (
          showStopPicker ? (
            <AirportPicker
              label="Add intermediate stop"
              value={null}
              onChange={(iata) => {
                if (iata && !usedIatas.includes(iata)) onStopsChange([...stops, iata]);
                setShowStopPicker(false);
              }}
              excludeIatas={usedIatas}
            />
          ) : (
            <button onClick={() => setShowStopPicker(true)} className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add stop
            </button>
          )
        ) : (
          <p className="text-xs text-runway-500">Maximum of {MAX_ROUTE_STOPS} intermediate stops reached.</p>
        )}
      </div>

      {distanceNm !== null && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-runway-400">{isMultiHop ? 'Loop distance:' : 'Distance:'}</span>
          <span className="font-semibold text-white">{distanceNm.toLocaleString()} nm</span>
          {flightTimeMin !== null && (
            <>
              <span className="text-runway-500">·</span>
              <span className="text-runway-300">Flight time ≈ {formatFlightTime(flightTimeMin)}</span>
            </>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-runway-300 mb-1.5 block">Aircraft Type</label>
        <select value={aircraftTypeId} onChange={(e) => onAircraftTypeChange(e.target.value)} className="input-field w-full">
          <option value="">— Select aircraft type —</option>
          {AIRCRAFT_DATABASE.filter((t) => ownedTypeIds.has(t.id)).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.maxPassengers} seats)
            </option>
          ))}
        </select>

        {ownedTypeIds.size === 0 && (
          <p className="mt-2 text-xs text-runway-400">You don't own any aircraft yet. Purchase one in the Fleet screen first.</p>
        )}

        {aircraftType && pathAirports && rangeCheck && (
          <div className="mt-3 rounded-lg bg-white/[0.03] border border-white/5 p-3">
            <div className="flex items-center gap-2 text-sm mb-2 flex-wrap">
              {rangeCheck.feasible ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 font-medium">All legs within range</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 font-medium">Some legs out of range</span>
                </>
              )}
              <span className="text-runway-500 text-xs ml-auto">
                {rangeCheck.totalDistanceNm.toLocaleString()} nm loop · {getEffectiveRangeNm(aircraftType).toLocaleString()} nm usable per leg
              </span>
            </div>
            <div className="space-y-1">
              {rangeCheck.legs.map((leg) => (
                <div key={`${leg.from}-${leg.to}`} className="flex items-center gap-2 text-xs">
                  {leg.feasible ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className={leg.feasible ? 'text-runway-300' : 'text-red-400'}>
                    {leg.from} → {leg.to} · {leg.distanceNm.toLocaleString()} nm
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {availability && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-sky-400" />
            <span className="text-runway-300">{availability}</span>
          </div>
        )}

        {aircraftType && pathAirports && rangeCheck?.feasible && (() => {
          const stats = getPoolStats(fleet, aircraftTypeId);
          const requiredCount = getRequiredAircraftCount(pathAirports, aircraftType, frequency);
          if (requiredCount === 0) return null;
          const enough = stats.usable >= requiredCount;
          return (
            <div className={`mt-2 flex items-start gap-2 text-sm ${enough ? '' : 'text-amber-400'}`}>
              {enough ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <span className={enough ? 'text-runway-300' : 'text-amber-300'}>
                Fleet check: this frequency needs {requiredCount}× {aircraftType.name} — pool has {stats.usable} usable
                ({stats.free} free · {stats.deployed} deployed).
                {enough ? '' : ` Aircraft are shared, so a shortfall trims weekly capacity — consider buying more of this type.`}
              </span>
            </div>
          );
        })()}
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-runway-300 mb-1.5 block">Frequency (loop cycles)</label>
          <select value={frequency} onChange={(e) => onFrequencyChange(Number(e.target.value))} className="input-field w-full">
            {frequencyOptions.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {economics && (
          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
            <p className="text-xs font-medium text-runway-300 mb-2">Route Economics Preview</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-runway-400">Demand score</span>
              <span className="font-medium text-sky-400">{demandScore}</span>
              <span className="text-runway-400">Est. load factor</span>
              <span className="font-medium text-white">{formatPercentage(economics.estLoadFactor)}</span>
              <span className="text-runway-400">Ticket price</span>
              <span className="font-medium text-white">{formatCurrency(economics.ticketPrice, currencyFormat)}</span>
              <span className="text-runway-400">Weekly fuel cost</span>
              <span className="font-medium text-amber-400" title={`At the current market price of $${fuelPricePerKg.toFixed(2)}/kg`}>
                {formatCurrency(economics.weeklyFuelCost, currencyFormat)}
              </span>
              <span className="text-runway-400">Weekly P&L</span>
              <span className={`font-medium ${economics.weeklyProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(economics.weeklyProfit, currencyFormat)}
              </span>
            </div>
          </div>
        )}
      </div>


      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-runway-300 mb-2 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
            Suggested destinations from your hub ({hubIata}) — within range
          </p>
          <div className="flex flex-wrap gap-2 max-h-36 overflow-auto pr-1">
            {suggestions.map((s) => {
              const isSelected = suggestionIata === s.airport.iata;
              return (
                <button
                  key={s.airport.iata}
                  onClick={() => setSuggestionIata(isSelected ? null : s.airport.iata)}
                  onDoubleClick={() => onDestinationChange(s.airport.iata)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    isSelected
                      ? 'bg-sky-500/20 border-sky-400/50 text-white'
                      : 'bg-white/[0.03] border-white/10 text-runway-300 hover:border-white/25 hover:text-white'
                  }`}
                >
                  <span className="font-semibold">{s.airport.iata}</span>
                  <span className="text-runway-400"> · {s.airport.city}</span>
                  <span className="text-runway-500"> · {s.distanceNm.toLocaleString()} nm</span>
                  <span className="text-sky-400"> · demand {s.demandScore}</span>
                </button>
              );
            })}
          </div>
          {suggestionIata && (
            <button onClick={() => onDestinationChange(suggestionIata)} className="btn-secondary mt-2 text-xs px-3 py-1.5">
              Use {suggestionIata} as destination
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
        <button onClick={onCreate} disabled={!destination || (rangeCheck !== null && !rangeCheck.feasible)} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
          Create Route
        </button>
      </div>
    </div>
  );
}

interface RouteDetailModalProps {
  route: Route;
  ownedTypeIds: Set<string>;
  currencyFormat: 'USD' | 'EUR' | 'GBP';
  onClose: () => void;
  onSave: (frequency: number, aircraftTypeId: string) => void;
  onToggleActive: () => void;
  onCancel: () => void;
}

function RouteDetailModal({ route, ownedTypeIds, currencyFormat, onClose, onSave, onToggleActive, onCancel }: RouteDetailModalProps) {
  const fuelPricePerKg = useGameStore((state) => state.world.fuelPrice);
  const fleet = useGameStore((state) => state.airline?.fleet);
  const [frequency, setFrequency] = useState(route.frequency);
  const [aircraftTypeId, setAircraftTypeId] = useState(route.aircraftId || '');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const pathIatas = getRoutePath(route);
  const pathAirports = resolvePathAirports(pathIatas);
  const aircraftType = AIRCRAFT_DATABASE.find((t) => t.id === aircraftTypeId);
  // Stored distanceNm: one-way for legacy direct routes, full loop total for multi-hop.
  const distanceNm = route.distanceNm ?? (pathAirports && pathAirports.length >= 2 ? calculateLoopDistanceNm(pathAirports) : 0);

  // Live staffing of this route's CURRENT aircraft type from the shared fleet pool.
  const currentType = AIRCRAFT_DATABASE.find((t) => t.id === route.aircraftId);
  const staffedCount = getRouteStaffing(fleet ?? [], route.id);
  const requiredCount = getRequiredAircraftCount(pathAirports, currentType, route.frequency);
  const poolStats = currentType ? getPoolStats(fleet ?? [], currentType.id) : null;

  const rangeCheck = aircraftType && pathAirports && pathAirports.length >= 2 ? checkLoopRange(aircraftType, pathAirports) : null;
  // Frequency options & cap are driven by the full loop cycle time of the selected aircraft.
  const effectivePath = pathAirports && pathAirports.length >= 2 ? pathAirports : null;
  const frequencyOptions = buildFrequencyOptions(effectivePath, aircraftType);
  const maxWeekly = maxWeeklyFrequency(effectivePath, aircraftType);
  const availability = availabilitySummary(effectivePath, aircraftType);
  // Auto-clamp if the chosen frequency exceeds what this aircraft can physically fly per week.
  useEffect(() => {
    if (frequency > maxWeekly) setFrequency(maxWeekly);
  }, [maxWeekly, frequency]);
  const economics =
    effectivePath && aircraftType
      ? previewLoopEconomics(effectivePath, aircraftType, frequency, fuelPricePerKg, {
          weeksActive: route.weeksActive ?? 0,
        })
      : null;

  const hasChanges = frequency !== route.frequency || aircraftTypeId !== (route.aircraftId || '');

  return (
    <div>
      <div className="flex items-center justify-between p-6 border-b border-white/5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Pencil className="w-4 h-4 text-sky-400" />
            Manage Route
          </h2>
          <p className="text-sm text-runway-400 mt-1">
            {pathIatas.join(' → ')} ↺ {route.origin}
          </p>
          {currentType && (
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <span
                className={`px-2 py-0.5 rounded-full font-medium ${
                  !route.isActive
                    ? 'bg-white/5 text-runway-400'
                    : requiredCount > 0 && staffedCount >= requiredCount
                      ? 'bg-green-500/10 text-green-400'
                      : staffedCount > 0
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-red-500/10 text-red-400'
                }`}
              >
                {staffedCount}/{requiredCount} aircraft staffed
              </span>
              {poolStats && (
                <span className="text-runway-500">Pool: {poolStats.usable} usable · {poolStats.free} free</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              route.isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}
          >
            {route.isActive ? 'Active' : 'Inactive'}
          </span>
          <button onClick={onClose} className="text-runway-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* --- Edit section --- */}
        <div>
          <p className="text-xs font-medium text-runway-300 mb-2">Route Settings</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-runway-300 mb-1.5 block">Aircraft Type</label>
              <select value={aircraftTypeId} onChange={(e) => setAircraftTypeId(e.target.value)} className="input-field w-full">
                <option value="">— Select aircraft type —</option>
                {AIRCRAFT_DATABASE.filter((t) => ownedTypeIds.has(t.id)).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.maxPassengers} seats)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-runway-300 mb-1.5 block">Frequency (round trips)</label>
              <select value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} className="input-field w-full">
                {frequencyOptions.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {aircraftType && rangeCheck && (
            <div className="mt-3 rounded-lg bg-white/[0.03] border border-white/5 p-3">
              <div className="flex items-center gap-2 text-sm mb-2 flex-wrap">
                {rangeCheck.feasible ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 font-medium">All legs within range</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 font-medium">Some legs out of range</span>
                  </>
                )}
                <span className="text-runway-500 text-xs ml-auto">
                  {rangeCheck.totalDistanceNm.toLocaleString()} nm loop · {getEffectiveRangeNm(aircraftType).toLocaleString()} nm usable per leg
                </span>
              </div>
              <div className="space-y-1">
                {rangeCheck.legs.map((leg) => (
                  <div key={`${leg.from}-${leg.to}`} className="flex items-center gap-2 text-xs">
                    {leg.feasible ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <span className={leg.feasible ? 'text-runway-300' : 'text-red-400'}>
                      {leg.from} → {leg.to} · {leg.distanceNm.toLocaleString()} nm
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {availability && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-sky-400" />
              <span className="text-runway-300">{availability}</span>
            </div>
          )}
        </div>

        {/* --- Route stats --- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
            <p className="text-xs text-runway-500">{(route.stops?.length ?? 0) > 0 ? 'Loop Distance' : 'Distance'}</p>
            <p className="text-sm font-medium text-white">{distanceNm > 0 ? `${distanceNm.toLocaleString()} nm` : '—'}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
            <p className="text-xs text-runway-500">Flight Time</p>
            <p className="text-sm font-medium text-white">{route.flightTimeMin ? formatFlightTime(route.flightTimeMin) : '—'}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
            <p className="text-xs text-runway-500">Demand Score</p>
            <p className="text-sm font-medium text-sky-400">{route.demandScore !== undefined ? route.demandScore : '—'}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
            <p className="text-xs text-runway-500">Weeks in Service</p>
            <p className="text-sm font-medium text-white">{route.weeksActive ?? 0}</p>
          </div>
        </div>

        {/* --- Financial data --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-4">
            <p className="text-xs font-medium text-runway-300 mb-3">Current Weekly P&amp;L</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-runway-400">Revenue</span>
              <span className="font-medium text-white">{formatCurrency(route.revenue, currencyFormat)}</span>
              <span className="text-runway-400">Costs</span>
              <span className="font-medium text-amber-400">{formatCurrency(route.cost, currencyFormat)}</span>
              <span className="text-runway-400">Profit</span>
              <span className={`font-medium ${route.profitability >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(route.revenue - route.cost, currencyFormat, true)}
              </span>
              <span className="text-runway-400">Load Factor</span>
              <span className="font-medium text-white">{formatPercentage(route.avgLoadFactor)}</span>
            </div>
          </div>

          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-4">
            <p className="text-xs font-medium text-runway-300 mb-3">Current Projection</p>
            {economics ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <span className="text-runway-400">Est. load factor</span>
                <span className="font-medium text-white">{formatPercentage(economics.estLoadFactor)}</span>
                <span className="text-runway-400">Ticket price</span>
                <span className="font-medium text-white">{formatCurrency(economics.ticketPrice, currencyFormat)}</span>
                <span className="text-runway-400">Weekly passengers</span>
                <span className="font-medium text-white">{economics.weeklyPassengers.toLocaleString()}</span>
                <span className="text-runway-400">Weekly fuel cost</span>
                <span className="font-medium text-amber-400" title={`At the current market price of $${fuelPricePerKg.toFixed(2)}/kg`}>
                  {formatCurrency(economics.weeklyFuelCost, currencyFormat)}
                </span>
                <span className="text-runway-400">Projected P&L</span>
                <span className={`font-medium ${economics.weeklyProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(economics.weeklyProfit, currencyFormat)}
                </span>
              </div>
            ) : (
              <p className="text-xs text-runway-500">Select an aircraft type to see a projection.</p>
            )}
          </div>
        </div>

        {/* --- Cancel confirmation --- */}
        {confirmCancel && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-red-300">
              Cancel this route permanently? Its history and load-factor progress will be lost.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setConfirmCancel(false)} className="btn-secondary text-xs px-3 py-1.5">
                Keep Route
              </button>
              <button onClick={onCancel} className="bg-red-600 hover:bg-red-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                Confirm Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- Footer actions --- */}
      <div className="flex items-center justify-between gap-3 p-6 border-t border-white/5">
        {!confirmCancel ? (
          <button onClick={() => setConfirmCancel(true)} className="btn-secondary flex items-center gap-2 text-red-400 hover:text-red-300">
            <Trash2 className="w-4 h-4" />
            Cancel Route
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <button onClick={onToggleActive} className={`btn-secondary flex items-center gap-2 ${route.isActive ? '' : 'text-green-400'}`}>
            {route.isActive ? (
              <>
                <Pause className="w-4 h-4" />
                Pause Route
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Resume Route
              </>
            )}
          </button>
          <button onClick={() => onSave(frequency, aircraftTypeId)} disabled={!hasChanges} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

