import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@store/gameStore';
import type { Route, AircraftType, Airport, Aircraft, StaffMember } from '@/types/game';
import { getAirportByIata, AIRPORT_DATABASE } from '@data/airports';
import { AIRCRAFT_DATABASE, getAircraftById } from '@data/aircraft';
import { formatCurrency, formatPercentage } from '@utils/helpers';
import { Map, Plus, X, Plane, Lightbulb, CheckCircle2, AlertTriangle, Pencil, Trash2, Pause, Play, Clock, Repeat, TrendingUp, TrendingDown, CalendarClock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AirportPicker } from '@/components/AirportPicker';
import { RouteMapPreview } from '@/components/routes/RouteMapPreview';
import { StatusPill, StatusDot, MeterBar } from '@/components/icons/StatusIcons';
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
  buildCharterTripOptions,
  previewCharterEconomics,
  suggestCharterMissions,
  charterCycleMinutes,
  maxCharterFrequencyPerWeek,
  charterDeadheadCostShare,
} from '@/utils/routeEngine';
import {
  getAircraftCrewRequirements,
  computeStaffingStatus,
  computeTypeCrewRequirements,
} from '@/utils/crewDispatcher';
import { isAircraftAllowedForModel } from '@/utils/businessModels';
import { getRequiredAircraftCount, getPoolStats, getRouteStaffing } from '@/utils/fleetDispatcher';
import { formatMinutes } from '@/utils/timetable';
import { useUnits, formatDistanceNm } from '@/utils/units';

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
  const units = useUnits();
  const addNotification = useGameStore((state) => state.addNotification);
  const createRoute = useGameStore((state) => state.createRoute);
  const updateRoute = useGameStore((state) => state.updateRoute);
  const cancelRoute = useGameStore((state) => state.cancelRoute);
  const navigateTo = useGameStore((state) => state.navigateTo);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  // Hub policy: every route originates from (and returns to) the airline's headquarters.
  const hubIata = airline?.headquarters ?? '';
  const [destination, setDestination] = useState('');
  const [stops, setStops] = useState<string[]>([]);
  const [aircraftTypeId, setAircraftTypeId] = useState('');
  const [frequency, setFrequency] = useState(7);
  const [fareMultiplier, setFareMultiplier] = useState(1);

  // Charter business model: point-to-point missions from any mission base (no hub loop,
  // no fare markup) — see utils/routeEngine.ts.
  const [showCharterModal, setShowCharterModal] = useState(false);
  const [charterBase, setCharterBase] = useState('');
  const [charterDestination, setCharterDestination] = useState('');
  const [charterTypeId, setCharterTypeId] = useState('');
  const [charterFrequency, setCharterFrequency] = useState(1);

  if (!airline) return null;

  const ownedTypeIds = new Set(airline.fleet.map((a) => a.typeId));
  const businessModel = airline.businessModel ?? 'regional';
  const isCharterModel = businessModel === 'charter';

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
      fareMultiplier,
    });

    if (ok) {
      addNotification({
        type: 'success',
        title: 'Route Created',
        message: `Loop ${getRoutePath({ origin: hubIata, stops, destination }).join(' → ')} has been created - first departure at ${formatMinutes(6 * 60 + 30)} local time.`,
      });
      setShowCreateModal(false);
      setDestination('');
      setStops([]);
      setFareMultiplier(1);
    } else {
      addNotification({
        type: 'error',
        title: 'Invalid Route',
        message: 'Could not create the route. Check that every leg fits within your aircraft\'s range and no airport is repeated.',
      });
    }
  };

  const handleCreateCharterMission = () => {
    const created = createRoute({
      origin: charterBase,
      destination: charterDestination,
      aircraftType: charterTypeId,
      frequencyPerWeek: charterFrequency,
      charter: true,
    });

    if (created) {
      addNotification({
        type: 'success',
        title: 'Charter Mission Created',
        message: `Mission ${charterBase} ⇄ ${charterDestination} is now scheduled - aircraft base at ${charterBase}.`,
      });
      setShowCharterModal(false);
      setCharterBase('');
      setCharterDestination('');
      setCharterTypeId('');
      setCharterFrequency(1);
    } else {
      addNotification({
        type: 'error',
        title: 'Invalid Mission',
        message: 'Could not create the mission. Check the airports, the aircraft range and the trip schedule.',
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
        {isCharterModel && (
          <button onClick={() => setShowCharterModal(true)} className="btn-primary flex items-center gap-2">
            <Repeat className="w-4 h-4" />
            Charter Mission
          </button>
        )}
      </div>

      {airline.routes.length > 0 && (
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Map className="w-4 h-4 text-sky-400" />
              Network Map
            </h2>
            <span className="text-xs text-runway-400">
              {airline.routes.filter((r) => r.isActive).length} of {airline.routes.length} routes active
            </span>
          </div>
          <RouteMapPreview routes={airline.routes} className="h-72 md:h-96" />
        </div>
      )}

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
            const routeType = getAircraftById(route.aircraftId);
            const staffedCount = getRouteStaffing(airline.fleet, route.id);
            const requiredCount = getRequiredAircraftCount(resolvePathAirports(pathIatas), routeType, route.frequency);
            const isCharterRoute = route.operationType === 'charter';
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
                        {isCharterRoute
                          ? `Charter mission · point-to-point · aircraft base ${route.origin}`
                          : `Hub loop · ${stopCount > 0 ? `${stopCount} intermediate stop${stopCount > 1 ? 's' : ''}` : 'direct'} · returns to {route.origin}`}
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
                    <StatusPill tone={route.isActive ? 'green' : 'red'}>
                      {route.isActive ? 'Active' : 'Inactive'}
                    </StatusPill>
                    {!isCharterRoute && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateTo('timetable');
                        }}
                        className="p-1.5 rounded-lg bg-white/3 border border-white/10 text-runway-400 hover:text-sky-300 hover:border-white/25 transition-colors"
                        title="View weekly timetable"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRouteId(route.id);
                      }}
                      className="p-1.5 rounded-lg bg-white/3 border border-white/10 text-runway-400 hover:text-white hover:border-white/25 transition-colors"
                      title="Manage route"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                  {pathIatas.map((iata, i) => (
                    <span key={iata} className="flex items-center gap-1.5">
                      {i > 0 && <span className="w-6 h-px bg-linear-to-r from-sky-500/60 to-sky-400/60" />}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold border ${
                          i === 0
                            ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                            : 'bg-white/4 border-white/10 text-white'
                        }`}
                      >
                        <StatusDot tone={i === 0 ? 'sky' : 'amber'} className="w-1.5 h-1.5" />
                        {iata}
                      </span>
                    </span>
                  ))}
                  {!isCharterRoute && (
                    <>
                      <span className="w-6 h-px bg-linear-to-r from-sky-500/60 to-sky-400/60" />
                      <span
                        title={`Returns to hub ${route.origin}`}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold bg-sky-500/10 border border-sky-500/30 text-sky-300"
                  >
                          <Repeat className="w-3.5 h-3.5" />
                          {route.origin}
                        </span>
                      </>
                    )
                  }
                  <span className="text-xs text-runway-400 flex-1 truncate ml-2">
                    {distanceNm > 0 ? `${formatDistanceNm(distanceNm, units)} loop` : ''}
                    {route.flightTimeMin ? ` · ${formatFlightTime(route.flightTimeMin)}` : ''}
                    {route.timetable ? ` · 1st dep ${formatMinutes(route.timetable.firstDepartureMin ?? 6 * 60 + 30)} local` : ''}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  <div className="rounded-lg bg-white/3 border border-white/5 p-2.5">
                    <p className="text-xs text-runway-500 mb-1">Frequency</p>
                    <p className="text-sm font-medium text-white flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 text-sky-400" />
                      {formatFrequency(route.frequency)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/3 border border-white/5 p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs text-runway-500">Demand</p>
                      <p className="text-xs font-medium text-sky-400">
                        {route.demandScore !== undefined ? route.demandScore : '—'}
                      </p>
                    </div>
                    <MeterBar value={route.demandScore !== undefined ? route.demandScore / 10 : 0} tone="sky" />
                  </div>
                  <div className="rounded-lg bg-white/3 border border-white/5 p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs text-runway-500">Load Factor</p>
                      <p className="text-xs font-medium text-white">{formatPercentage(route.avgLoadFactor)}</p>
                    </div>
                    <MeterBar value={route.avgLoadFactor} />
                  </div>
                  <div className="rounded-lg bg-white/3 border border-white/5 p-2.5">
                    <p className="text-xs text-runway-500 mb-1">Profit</p>
                    <p className={`text-sm font-medium flex items-center gap-1.5 ${route.profitability >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {route.profitability >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
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
                fareMultiplier={fareMultiplier}
                onFareMultiplierChange={setFareMultiplier}
                onCreate={handleCreateRoute}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCharterModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCharterModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-2xl max-h-[85vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <h2 className="text-xl font-bold text-white">New Charter Mission</h2>
                <button onClick={() => setShowCharterModal(false)} className="text-runway-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <CharterMissionForm
                baseIata={charterBase}
                destination={charterDestination}
                aircraftTypeId={charterTypeId}
                tripsPerWeek={charterFrequency}
                ownedTypeIds={ownedTypeIds}
                fleet={airline.fleet}
                routes={airline.routes}
                staff={airline.staff}
                currencyFormat={currencyFormat}
                onBaseChange={(iata) => {
                  setCharterBase(iata);
                  // Keep the pair valid: the mission can't be the base itself.
                  if (iata === charterDestination) setCharterDestination('');
                }}
                onDestinationChange={setCharterDestination}
                onAircraftTypeChange={setCharterTypeId}
                onTripsChange={setCharterFrequency}
                onCreate={handleCreateCharterMission}
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
                onSave={(frequency, aircraftTypeId, fareMultiplier) => {
                  const ok = updateRoute(selectedRoute.id, {
                    frequency,
                    ...(aircraftTypeId ? { aircraftType: aircraftTypeId } : {}),
                    fareMultiplier,
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
  /** Player's ticket price, as a multiple (0.5–2.0) of the model's recommended (revenue-maximizing) price. */
  fareMultiplier: number;
  ownedTypeIds: Set<string>;
  /** Full fleet — used for the live pool-availability check. */
  fleet: Aircraft[];
  currencyFormat: 'USD' | 'EUR' | 'GBP';
  onDestinationChange: (iata: string) => void;
  onStopsChange: (stops: string[]) => void;
  onAircraftTypeChange: (id: string) => void;
  onFrequencyChange: (freq: number) => void;
  onFareMultiplierChange: (multiplier: number) => void;
  onCreate: () => void;
}

function RouteCreationForm({
  hubIata,
  destination,
  stops,
  aircraftTypeId,
  frequency,
  fareMultiplier,
  ownedTypeIds,
  currencyFormat,
  onDestinationChange,
  onStopsChange,
  onAircraftTypeChange,
  onFrequencyChange,
  onFareMultiplierChange,
  onCreate,
  fleet,
}: RouteCreationFormProps) {
  const [suggestionIata, setSuggestionIata] = useState<string | null>(null);
  const [showStopPicker, setShowStopPicker] = useState(false);
  // Live market fuel price — route costs track the dynamic fuel market.
  const fuelPricePerKg = useGameStore((state) => state.world.fuelPrice);
  const businessModel = useGameStore((state) => state.airline?.businessModel);
  const units = useUnits();

  const hubAirport = useMemo(() => (hubIata ? getAirportByIata(hubIata) : undefined), [hubIata]);
  // Full loop path: HUB → stops… → DEST. The return leg to the hub is implicit in all loop math.
  const pathAirports = useMemo(
    () => (destination && hubAirport ? resolvePathAirports([hubIata, ...stops, destination]) : null),
    [hubIata, hubAirport, stops, destination]
  );

  const aircraftType = useMemo(
    () => getAircraftById(aircraftTypeId),
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
  }, [maxWeekly, frequency, onFrequencyChange]);

  const suggestions = useMemo(() => {
    if (!hubAirport || !aircraftType) return [];
    return suggestDestinations(hubAirport, aircraftType, AIRPORT_DATABASE);
  }, [hubAirport, aircraftType]);

  const demandScore = hubAirport && pathAirports ? scoreLoopDemand(hubAirport, pathAirports) : null;
  const economics =
    pathAirports && aircraftType
      ? previewLoopEconomics(pathAirports, aircraftType, frequency, fuelPricePerKg, {
          model: businessModel,
          fareMultiplier,
        })
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
              <span key={iata} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/3 border border-white/10 text-xs">
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
          <span className="font-semibold text-white">{formatDistanceNm(distanceNm, units)}</span>
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
          <div className="mt-3 rounded-lg bg-white/3 border border-white/5 p-3">
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
                {formatDistanceNm(rangeCheck.totalDistanceNm, units)} loop · {formatDistanceNm(getEffectiveRangeNm(aircraftType), units)} usable per leg
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
                    {leg.from} → {leg.to} · {formatDistanceNm(leg.distanceNm, units)}
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

        {/* Ticket pricing: 50%–200% of the business model's recommended (revenue-maximizing) fare */}
        <div>
          <label className="text-xs font-medium text-runway-300 mb-1.5 block">
            Ticket Pricing · <span className="text-sky-400">{Math.round(fareMultiplier * 100)}%</span> of recommended
          </label>
          <input
            type="range"
            min={50}
            max={200}
            step={5}
            value={Math.round(fareMultiplier * 100)}
            onChange={(e) => onFareMultiplierChange(Number(e.target.value) / 100)}
            className="w-full accent-sky-500"
          />
          <div className="flex justify-between text-[10px] text-runway-500 mt-1">
            <span>50% — discount (fills seats, lower fare)</span>
            <span>100% — recommended (max revenue)</span>
            <span>200% — premium (fewer passengers)</span>
          </div>
        </div>

        {economics && (
          <div className="rounded-lg bg-white/3 border border-white/5 p-3">
            <p className="text-xs font-medium text-runway-300 mb-2">Route Economics Preview</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-runway-400">Demand score</span>
              <span className="font-medium text-sky-400">{demandScore}</span>
              <span className="text-runway-400">Est. load factor</span>
              <span className="font-medium text-white">{formatPercentage(economics.estLoadFactor)}</span>
              <span className="text-runway-400">Ticket price</span>
              <span className="font-medium text-white">{formatCurrency(economics.ticketPrice, currencyFormat)}</span>
              <span className="text-runway-400">Onboard revenue</span>
              <span className="font-medium text-white" title="In-flight ancillary revenue (shop, meals, upgrades) per week">
                {formatCurrency(economics.weeklyOnboardRevenue ?? 0, currencyFormat)}
              </span>
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
                      : 'bg-white/3 border-white/10 text-runway-300 hover:border-white/25 hover:text-white'
                  }`}
                >
                  <span className="font-semibold">{s.airport.iata}</span>
                  <span className="text-runway-400"> · {s.airport.city}</span>
                  <span className="text-runway-500"> · {formatDistanceNm(s.distanceNm, units)}</span>
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

interface CharterMissionFormProps {
  baseIata: string;
  destination: string;
  aircraftTypeId: string;
  tripsPerWeek: number;
  ownedTypeIds: Set<string>;
  /** Full fleet — used for the live pool-availability check at the mission base. */
  fleet: Aircraft[];
  /** Existing network + rosters — the mission's crew demand is measured against them. */
  routes: Route[];
  staff: StaffMember[];
  currencyFormat: 'USD' | 'EUR' | 'GBP';
  onBaseChange: (iata: string) => void;
  onDestinationChange: (iata: string) => void;
  onAircraftTypeChange: (id: string) => void;
  onTripsChange: (trips: number) => void;
  onCreate: () => void;
}

/**
 * Charter mission form — point-to-point call-out from an aircraft base.
 * ---------------------------------------------------------------
 * Mirrors RouteCreationForm but for the charter business model: instead of a
 * closed hub loop there is one revenue leg (base → mission) plus a passenger-free
 * return, so the schedule is booked per trip (CHARTER_TRIP_OPTIONS) rather than
 * per day, no intermediate stops are offered, no weekly timetable is published,
 * and the player sets no fare markup — the charterer names the fare, which the
 * economics card reports as a per-passenger charter fare.
 */
function CharterMissionForm({
  baseIata,
  destination,
  aircraftTypeId,
  tripsPerWeek,
  ownedTypeIds,
  fleet,
  routes,
  staff,
  currencyFormat,
  onBaseChange,
  onDestinationChange,
  onAircraftTypeChange,
  onTripsChange,
  onCreate,
}: CharterMissionFormProps) {
  const [suggestionIata, setSuggestionIata] = useState<string | null>(null);
  // Live market fuel price — mission costs track the dynamic fuel market.
  const fuelPricePerKg = useGameStore((state) => state.world.fuelPrice);
  const businessModel = useGameStore((state) => state.airline?.businessModel);
  const units = useUnits();

  const baseAirport = useMemo(() => (baseIata ? getAirportByIata(baseIata) : undefined), [baseIata]);
  const missionAirport = useMemo(() => (destination ? getAirportByIata(destination) : undefined), [destination]);
  const aircraftType = useMemo(
    () => getAircraftById(aircraftTypeId),
    [aircraftTypeId]
  );

  // The mission pair IS the operation: revenue leg out, empty leg back to the base.
  // Range only has to hold for the leg itself — the return is the same distance.
  const missionPair = baseAirport && missionAirport ? [baseAirport, missionAirport] : null;
  const rangeCheck = aircraftType && missionPair ? checkLoopRange(aircraftType, missionPair) : null;
  const missionDistanceNm = missionPair ? calculateRouteDistanceNm(missionPair[0]!, missionPair[1]!) : null;
  const missionCycleMin =
    aircraftType && missionPair ? charterCycleMinutes(missionPair[0]!, missionPair[1]!, aircraftType) : null;

  // Bookable mission schedules for this airframe on this pair (see routeEngine).
  const tripOptions = useMemo(() => {
    if (!baseAirport || !missionAirport) return [] as { value: number; label: string }[];
    return buildCharterTripOptions(baseAirport, missionAirport, aircraftType);
  }, [baseAirport, missionAirport, aircraftType]);

  // Auto-clamp a picked schedule this airframe physically cannot fly.
  useEffect(() => {
    if (!baseAirport || !missionAirport || !aircraftType) return;
    const maxTrips = maxCharterFrequencyPerWeek(baseAirport, missionAirport, aircraftType);
    if (tripsPerWeek > maxTrips) onTripsChange(maxTrips);
  }, [baseAirport, missionAirport, aircraftType, tripsPerWeek, onTripsChange]);

  const economics = useMemo(() => {
    if (!baseAirport || !missionAirport || !aircraftType) return null;
    return previewCharterEconomics(baseAirport, missionAirport, aircraftType, tripsPerWeek, fuelPricePerKg, {
      model: businessModel,
    });
  }, [baseAirport, missionAirport, aircraftType, tripsPerWeek, fuelPricePerKg, businessModel]);

  // Crew demand for this schedule. Charter missions are private flights, so the
  // crew engine (utils/crewDispatcher) is asked with charterOnly = true: one
  // captain + one first officer per airframe and NO purser or cabin crew.
  const missionCrew = useMemo(
    () => (aircraftType ? getAircraftCrewRequirements(aircraftTypeId, true) : null),
    [aircraftType, aircraftTypeId]
  );
  const crewDemand = useMemo(() => {
    if (!aircraftType || !missionPair || !missionDistanceNm) return null;
    // What this type would have to man once the mission is scheduled — the same
    // workload-sized rotation-set maths the weekly settlement and StaffScreen use.
    const prospective: Route = {
      id: 'charter-mission-preview',
      origin: baseIata,
      destination,
      isActive: true,
      frequency: tripsPerWeek,
      aircraftId: aircraftTypeId,
      schedule: [],
      avgLoadFactor: 0,
      revenue: 0,
      cost: 0,
      profitability: 0,
      distanceNm: missionDistanceNm,
      operationType: 'charter',
    };
    const req = computeTypeCrewRequirements([...routes, prospective])[aircraftTypeId];
    if (!req) return null;
    const pilots = computeStaffingStatus([...routes, prospective], staff, fleet).find((d) => d.key === 'pilots');
    const rated = pilots?.pilotBreakdown?.find((b) => b.typeId === aircraftTypeId);
    return { req, rated, typeName: aircraftType.name, missing: pilots?.missing ?? 0 };
  }, [aircraftType, missionPair, missionDistanceNm, baseIata, destination, aircraftTypeId, tripsPerWeek, routes, staff, fleet]);

  const suggestions = useMemo(() => {
    if (!baseAirport || !aircraftType) return [];
    return suggestCharterMissions(baseAirport, aircraftType, AIRPORT_DATABASE, 6, businessModel);
  }, [baseAirport, aircraftType, businessModel]);

  // An airport already picked as the base (or the mission) can't be picked again.
  const usedIatas = [baseIata, destination].filter(Boolean);
  // The charter model only flies mission-capable airframes (business jets, turboprops,
  // regional jets) — the same gate the store applies on create (utils/businessModels.ts).
  const flyableTypeIds = AIRCRAFT_DATABASE
    .filter((t) => ownedTypeIds.has(t.id) && isAircraftAllowedForModel(businessModel, t))
    .map((t) => t.id);

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-runway-300 mb-1.5 block">Charter Base (where the airframes stand)</label>
          <AirportPicker label="Charter base" value={baseIata || null} onChange={onBaseChange} excludeIatas={usedIatas} />
        </div>
        <div>
          <label className="text-xs font-medium text-runway-300 mb-1.5 block">Mission Destination</label>
          <AirportPicker label="Mission destination" value={destination || null} onChange={onDestinationChange} excludeIatas={usedIatas} />
        </div>
      </div>

      <p className="text-xs text-runway-400">
        Missions are point-to-point — no intermediate stops, no weekly timetable and no ticket markup: the
        charterer names the fare, so the schedule is booked per trip.
      </p>

      {missionDistanceNm !== null && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-runway-400">Mission leg:</span>
          <span className="font-semibold text-white">{formatDistanceNm(missionDistanceNm, units)}</span>
          {missionCycleMin !== null && (
            <>
              <span className="text-runway-500">·</span>
              <span className="text-runway-300">
                Full cycle incl. the empty return ≈ {formatMinutes(missionCycleMin)} block time
              </span>
            </>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-runway-300 mb-1.5 block">Aircraft Type</label>
        <select value={aircraftTypeId} onChange={(e) => onAircraftTypeChange(e.target.value)} className="input-field w-full">
          <option value="">— Select aircraft type —</option>
          {flyableTypeIds.map((id) => {
            const t = getAircraftById(id)!;
            return (
              <option key={id} value={id}>
                {t.name} ({t.maxPassengers} seats)
              </option>
            );
          })}
        </select>

        {ownedTypeIds.size === 0 && (
          <p className="mt-2 text-xs text-runway-400">You don't own any aircraft yet. Purchase one in the Fleet screen first.</p>
        )}
        {ownedTypeIds.size > 0 && flyableTypeIds.length === 0 && (
          <p className="mt-2 text-xs text-amber-300">
            None of your aircraft can fly charter missions — this business model needs mission-capable airframes
            (business jets, turboprops or regional jets).
          </p>
        )}

        {aircraftType && missionPair && rangeCheck && (
          <div className="mt-3 rounded-lg bg-white/3 border border-white/5 p-3">
            <div className="flex items-center gap-2 text-sm mb-2 flex-wrap">
              {rangeCheck.feasible ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 font-medium">Mission leg within range</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 font-medium">Mission leg out of range</span>
                </>
              )}
              <span className="text-runway-500 text-xs ml-auto">
                {formatDistanceNm(rangeCheck.totalDistanceNm, units)} mission ·{' '}
                {formatDistanceNm(getEffectiveRangeNm(aircraftType), units)} usable per leg
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
                    {leg.from} → {leg.to} · {formatDistanceNm(leg.distanceNm, units)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tripOptions.length > 0 && (
          <div className="mt-2 rounded-lg bg-white/3 border border-white/5 p-3">
            <p className="text-xs font-medium text-runway-300 mb-1.5">Bookable mission schedules</p>
            <p className="text-xs text-runway-300">
              {tripOptions.map((o) => o.value).join(' · ')} missions/wk — one airframe can fly{' '}
              {Math.floor(10080 / (missionCycleMin ?? 1))} mission cycles per week, so busier schedules need more
              airframes at the base.
            </p>
          </div>
        )}

        {aircraftType && missionPair && rangeCheck?.feasible && (() => {
          const stats = getPoolStats(fleet, aircraftTypeId);
          const requiredCount = getRequiredAircraftCount(missionPair, aircraftType, tripsPerWeek);
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
                Mission check: this schedule needs {requiredCount}× {aircraftType.name} standing at{' '}
                {baseAirport?.name ?? baseIata} — the operator has {stats.usable} usable ({stats.free} free ·{' '}
                {stats.deployed} deployed).
                {enough ? '' : ` Missions are booked per trip, so a shortfall means the schedule cannot be flown as offered.`}
              </span>
            </div>
          );
        })()}

        {/* Crew check: private flights are crewed by two pilots — no cabin crew */}
        {(() => {
          if (!missionCrew || !crewDemand) return null;
          const { req, rated, typeName, missing } = crewDemand;
          const perAirframe = missionCrew.captain + missionCrew.firstOfficer;
          const hired = (rated?.ratedCaptains ?? 0) + (rated?.ratedFirstOfficers ?? 0);
          const stillToHire = (rated?.missingCaptains ?? 0) + (rated?.missingFirstOfficers ?? 0);
          const ok = stillToHire === 0 && missing === 0;
          return (
            <div className={`mt-2 flex items-start gap-2 text-sm ${ok ? '' : 'text-amber-400'}`}>
              {ok ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <span className={ok ? 'text-runway-300' : 'text-amber-300'}>
                Crew check: missions are private flights — {perAirframe} pilots per airframe{' '}
                ({missionCrew.captain} captain + {missionCrew.firstOfficer} first officer),{' '}
                and no purser or cabin crew. This schedule needs {req.sets} rotating crew set(s),{' '}
                i.e. {req.captain} captains + {req.firstOfficer} first officers; {hired} of your{' '}
                pilots are rated for the {typeName}.{' '}
                {stillToHire === 0 ? 'Rosters cover it.' : `Hire ${stillToHire} more.`}{' '}
                {missing === 0 ? '' : `The pilot department is still ${missing} short overall.`}
              </span>
            </div>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-runway-300 mb-1.5 block">Missions per week</label>
          <select value={tripsPerWeek} onChange={(e) => onTripsChange(Number(e.target.value))} className="input-field w-full">
            {tripOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {economics && (
          <div className="rounded-lg bg-white/3 border border-white/5 p-3">
            <p className="text-xs font-medium text-runway-300 mb-2">Charter Mission Economics</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-runway-400">Est. load factor</span>
              <span className="font-medium text-sky-400">{formatPercentage(economics.estLoadFactor)}</span>
              <span className="text-runway-400">Missions / week</span>
              <span className="font-medium text-white">{tripsPerWeek}</span>
              <span className="text-runway-400">Charter fare</span>
              <span className="font-medium text-white" title="Fare the charterer names for the whole mission, per passenger">
                {formatCurrency(economics.ticketPrice, currencyFormat)}
              </span>
              <span className="text-runway-400">Weekly passengers</span>
              <span className="font-medium text-white">{economics.weeklyPassengers} pax</span>
              <span className="text-runway-400">Weekly revenue</span>
              <span className="font-medium text-white">{formatCurrency(economics.weeklyRevenue, currencyFormat)}</span>
              <span className="text-runway-400">Weekly operating cost</span>
              <span className="font-medium text-amber-400" title="Block time for the revenue leg plus the empty return to the charter base, incl. fuel, crew and handling">
                {formatCurrency(economics.weeklyCosts, currencyFormat)}
              </span>
              <span className="text-runway-400">Empty-leg cost share</span>
              <span className="font-medium text-white" title="Share of the block-time operating cost carried by the passenger-free repositioning leg back to the mission base — the charter model charges it at full cost">
                {formatPercentage(charterDeadheadCostShare(businessModel), 0)}
              </span>
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
            Best charter missions from {baseIata} — within range
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
                      : 'bg-white/3 border-white/10 text-runway-300 hover:border-white/25 hover:text-white'
                  }`}
                >
                  <span className="font-semibold">{s.airport.iata}</span>
                  <span className="text-runway-400"> · {s.airport.city}</span>
                  <span className="text-runway-500"> · {formatDistanceNm(s.distanceNm, units)}</span>
                  <span className="text-sky-400"> · demand {s.demandScore}</span>
                </button>
              );
            })}
          </div>
          {suggestionIata && (
            <button onClick={() => onDestinationChange(suggestionIata)} className="btn-secondary mt-2 text-xs px-3 py-1.5">
              Use {suggestionIata} as mission destination
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
        <button
          onClick={onCreate}
          disabled={
            !baseIata ||
            !destination ||
            !aircraftTypeId ||
            (rangeCheck !== null && !rangeCheck.feasible) ||
            !tripOptions.some((o) => o.value === tripsPerWeek)
          }
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create charter mission
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
  onSave: (frequency: number, aircraftTypeId: string, fareMultiplier: number) => void;
  onToggleActive: () => void;
  onCancel: () => void;
}

function RouteDetailModal({ route, ownedTypeIds, currencyFormat, onClose, onSave, onToggleActive, onCancel }: RouteDetailModalProps) {
  const fuelPricePerKg = useGameStore((state) => state.world.fuelPrice);
  const businessModel = useGameStore((state) => state.airline?.businessModel);
  const units = useUnits();
  const fleet = useGameStore((state) => state.airline?.fleet);
  const [frequency, setFrequency] = useState(route.frequency);
  const [aircraftTypeId, setAircraftTypeId] = useState(route.aircraftId || '');
  const [fareMultiplier, setFareMultiplier] = useState(route.fareMultiplier ?? 1);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const pathIatas = getRoutePath(route);
  const pathAirports = resolvePathAirports(pathIatas);
  const aircraftType = getAircraftById(aircraftTypeId);
  // Stored distanceNm: one-way for legacy direct routes, full loop total for multi-hop.
  const distanceNm = route.distanceNm ?? (pathAirports && pathAirports.length >= 2 ? calculateLoopDistanceNm(pathAirports) : 0);

  // Live staffing of this route's CURRENT aircraft type from the shared fleet pool.
  const currentType = getAircraftById(route.aircraftId);
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
          model: businessModel,
          fareMultiplier,
        })
      : null;

  const hasChanges =
    frequency !== route.frequency ||
    aircraftTypeId !== (route.aircraftId || '') ||
    fareMultiplier !== (route.fareMultiplier ?? 1);

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
            {/* Ticket pricing: 50%–200% of the business model's recommended (revenue-maximizing) fare */}
            <div>
              <label className="text-xs font-medium text-runway-300 mb-1.5 block">
                Ticket Pricing · <span className="text-sky-400">{Math.round(fareMultiplier * 100)}%</span> of recommended
              </label>
              <input
                type="range"
                min={50}
                max={200}
                step={5}
                value={Math.round(fareMultiplier * 100)}
                onChange={(e) => setFareMultiplier(Number(e.target.value) / 100)}
                className="w-full accent-sky-500"
              />
              <div className="flex justify-between text-[10px] text-runway-500 mt-1">
                <span>50% — discount (fills seats, lower fare)</span>
                <span>100% — recommended (max revenue)</span>
                <span>200% — premium (fewer passengers)</span>
              </div>
            </div>
          </div>

          {aircraftType && rangeCheck && (
            <div className="mt-3 rounded-lg bg-white/3 border border-white/5 p-3">
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
                  {formatDistanceNm(rangeCheck.totalDistanceNm, units)} loop · {formatDistanceNm(getEffectiveRangeNm(aircraftType), units)} usable per leg
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
                      {leg.from} → {leg.to} · {formatDistanceNm(leg.distanceNm, units)}
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
          <div className="rounded-lg bg-white/3 border border-white/5 p-3">
            <p className="text-xs text-runway-500">{(route.stops?.length ?? 0) > 0 ? 'Loop Distance' : 'Distance'}</p>
            <p className="text-sm font-medium text-white">{distanceNm > 0 ? formatDistanceNm(distanceNm, units) : '—'}</p>
          </div>
          <div className="rounded-lg bg-white/3 border border-white/5 p-3">
            <p className="text-xs text-runway-500">Flight Time</p>
            <p className="text-sm font-medium text-white">{route.flightTimeMin ? formatFlightTime(route.flightTimeMin) : '—'}</p>
          </div>
          <div className="rounded-lg bg-white/3 border border-white/5 p-3">
            <p className="text-xs text-runway-500">Demand Score</p>
            <p className="text-sm font-medium text-sky-400">{route.demandScore !== undefined ? route.demandScore : '—'}</p>
          </div>
          <div className="rounded-lg bg-white/3 border border-white/5 p-3">
            <p className="text-xs text-runway-500">Weeks in Service</p>
            <p className="text-sm font-medium text-white">{route.weeksActive ?? 0}</p>
          </div>
        </div>

        {/* --- Financial data --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg bg-white/3 border border-white/5 p-4">
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

          <div className="rounded-lg bg-white/3 border border-white/5 p-4">
            <p className="text-xs font-medium text-runway-300 mb-3">Current Projection</p>
            {economics ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <span className="text-runway-400">Est. load factor</span>
                <span className="font-medium text-white">{formatPercentage(economics.estLoadFactor)}</span>
                <span className="text-runway-400">Ticket price</span>
                <span className="font-medium text-white">{formatCurrency(economics.ticketPrice, currencyFormat)}</span>
                <span className="text-runway-400">Onboard revenue</span>
                <span className="font-medium text-white" title="In-flight ancillary revenue (shop, meals, upgrades) per week">
                  {formatCurrency(economics.weeklyOnboardRevenue ?? 0, currencyFormat)}
                </span>
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
          <button onClick={() => onSave(frequency, aircraftTypeId, fareMultiplier)} disabled={!hasChanges} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

