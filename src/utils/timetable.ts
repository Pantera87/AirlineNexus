import type { Airport, Route, AircraftType, RouteSchedule, TimetableLeg } from '@/types/game';
import {
  calculateRouteDistanceNm,
  estimateFlightTimeMinutes,
  getLoopCycleMinutes,
  getLoopLegs,
  getTurnaroundMinutes,
} from './routeEngine';

/** ISO weekday labels: index 0 = Monday … 6 = Sunday. */
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** First scheduled departure each day (hub-local): 06:30. */
export const FIRST_DEPARTURE_MIN = 6 * 60 + 30;

/**
 * Per-day cycle plan for a weekly frequency: how many full loop cycles fly on
 * each day (Mon–Sun) and at which hub-local minutes each one departs.
 *
 * Departures start at 06:30 and are spread across the day without overlap —
 * the frequency cap (maxLoopFrequencyPerWeek) guarantees `count × cycle ≤ 1440`
 * for every day, so a same-day cycle always completes before the next starts.
 */
export function buildDayCyclePlan(
  cycleMinutes: number,
  frequencyPerWeek: number
): { dayIndex: number; departureMins: number[] }[] {
  const cycle = Math.max(1, Math.round(cycleMinutes));
  const base = Math.floor(frequencyPerWeek / 7);
  const extraDays = frequencyPerWeek % 7;

  return DAY_LABELS.map((_, dayIndex) => {
    const count = base + (dayIndex < extraDays ? 1 : 0);
    const departureMins: number[] = [];
    if (count > 0) {
      const spacing = Math.min(1440, Math.max(cycle, Math.floor(1440 / count)));
      for (let i = 0; i < count; i++) {
        departureMins.push((FIRST_DEPARTURE_MIN + i * spacing) % 1440);
      }
    }
    return { dayIndex, departureMins };
  });
}

/**
 * Generate the full weekly timetable for a route: one TimetableLeg per flight
 * leg of every scheduled cycle, with hub-local departure/arrival times.
 *
 * Flight numbers follow `<routeSeq><cycle>` — route 1 → 101/102/…/1n,
 * route 2 → 201/202/… — and the airline's IATA code is prefixed for display.
 */
export function generateTimetable(
  routeId: string,
  routeSeq: number,
  frequency: number,
  path: Airport[],
  aircraft: AircraftType,
  _airlineIata: string
): RouteSchedule {
  const cycleMinutes = getLoopCycleMinutes(path, aircraft);
  const plan = buildDayCyclePlan(cycleMinutes, frequency);
  const legs = getLoopLegs(path);
  const legDurations = legs.map(([a, b]) => estimateFlightTimeMinutes(calculateRouteDistanceNm(a, b), aircraft));
  const legDistances = legs.map(([a, b]) => calculateRouteDistanceNm(a, b));
  const turnaround = getTurnaroundMinutes(aircraft);

  const result: TimetableLeg[] = [];
  let cycleNum = 0;
  for (const { dayIndex, departureMins } of plan) {
    for (const depMin of departureMins) {
      cycleNum += 1;
      const flightNumber = `${routeSeq * 100 + cycleNum}`;
      let t = depMin;
      for (let i = 0; i < legs.length; i++) {
        const duration = legDurations[i];
        result.push({
          flightNumber,
          dayIndex,
          fromIata: legs[i][0].iata,
          toIata: legs[i][1].iata,
          departureMin: t % 1440,
          arrivalMin: (t + duration) % 1440,
          durationMin: duration,
          distanceNm: legDistances[i],
        });
        t = (t + duration + turnaround) % 1440;
      }
    }
  }

  return {
    routeId,
    routeSeq,
    frequency,
    cycleMinutes,
    aircraftId: aircraft.id,
    firstDepartureMin: FIRST_DEPARTURE_MIN,
    generatedAt: Date.now(),
    legs: result,
  };
}

/** Format hub-local minutes past midnight as "HH:MM". */
export function formatMinutes(minutesPastMidnight: number): string {
  const m = ((Math.round(minutesPastMidnight) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * True when a route's stored timetable is missing or stale (frequency or
 * aircraft changed, or the loop cycle time no longer matches).
 */
export function needsTimetableRegeneration(
  route: Route,
  path: Airport[] | null,
  aircraft: AircraftType | null
): boolean {
  const tb = route.timetable;
  if (!tb) return true;
  if (tb.frequency !== route.frequency) return true;
  if (tb.aircraftId !== route.aircraftId) return true;
  if (path && aircraft) {
    if (Math.round(getLoopCycleMinutes(path, aircraft)) !== tb.cycleMinutes) return true;
  }
  return false;
}