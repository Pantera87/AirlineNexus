// ============================================================
// RouteMapPreview — interactive 2D SVG world map of your routes
// Equirectangular projection (viewBox units): x = lon + 180, y = 90 - lat.
// Background is the real Earth photo /textures/day.jpg (equirectangular,
// 2:1, left edge = 180° meridian), so it lines up exactly with that
// projection. Interactive camera: wheel zoom at cursor, drag to pan,
// +/-/reset buttons, double-click zoom. Pin and plane sizes scale with
// the zoom level so they keep a consistent on-screen size. The camera's
// viewBox always matches the container's measured aspect ratio, so the map
// fills the element edge to edge with no blank side bars — on wide 4K+
// screens it simply zooms in a bit (the world has plenty of latitude).
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Route, TimetableLeg, GameSpeed } from '@/types/game';
import { getAirportByIata } from '@/data/airports';
import { useGameStore } from '@/store/gameStore';

const WORLD_W = 360;
const WORLD_H = 180;
const EARTH_PHOTO = '/textures/day.jpg';
const MIN_SPAN = 6; // closest zoom (world units)
const MAX_SPAN = WORLD_W; // farthest zoom = whole world

type XY = [number, number];
type Rect = { x: number; y: number; w: number; h: number };

function project([lon, lat]: XY): XY {
  return [lon + 180, 90 - lat];
}

/** Clamp a camera rectangle (width × height in world units) to the world. */
function clampCam(w: number, h: number, x: number, y: number): Rect {
  return {
    x: Math.min(WORLD_W - w, Math.max(0, x)),
    y: Math.min(WORLD_H - h, Math.max(0, y)),
    w,
    h,
  };
}

const ROUTE_COLORS = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#fb7185', '#facc15', '#22d3ee', '#f97316'];

/** One quadratic arc segment (start → control → end). */
type Leg = { start: XY; ctrl: XY; end: XY };

/** Antimeridian-safe arc between two projected points (lifted by distance). */
function makeLeg(a: XY, b: XY): Leg {
  let x2 = b[0];
  const x1 = a[0];
  const y1 = a[1];
  const y2 = b[1];
  if (x2 - x1 > WORLD_W / 2) x2 -= WORLD_W;
  else if (x1 - x2 > WORLD_W / 2) x2 += WORLD_W;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const lift = Math.min(16, Math.max(3, dist * 0.18));
  return { start: a, ctrl: [(x1 + x2) / 2, Math.min(y1, y2) - lift], end: [x2, y2] };
}

/** Full loop path for a route (legs chained, so one plane can fly it). */
function buildLoopPath(legs: Leg[]): string {
  return legs
    .map((leg, i) => {
      const head = i === 0 ? `M ${leg.start[0].toFixed(1)} ${leg.start[1].toFixed(1)}` : '';
      return `${head} Q ${leg.ctrl[0].toFixed(1)} ${leg.ctrl[1].toFixed(1)} ${leg.end[0].toFixed(1)} ${leg.end[1].toFixed(1)}`;
    })
    .join(' ');
}

const DAY_MIN = 1440;
const WEEK_MIN = 7 * DAY_MIN;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Point on a quadratic arc leg at fraction t (0..1). */
function pointOnLeg(leg: Leg, t: number): XY {
  const u = 1 - t;
  return [
    u * u * leg.start[0] + 2 * u * t * leg.ctrl[0] + t * t * leg.end[0],
    u * u * leg.start[1] + 2 * u * t * leg.ctrl[1] + t * t * leg.end[1],
  ];
}

type PlaneMarker = { x: number; y: number; angle: number };

/**
 * Position + heading on the route's drawn loop (SVG coords) for the timetable
 * cycle currently in flight at `now`. Timetable leg i maps 1:1 to drawn
 * segment i (both follow [origin, ...stops, destination] around the loop), so
 * the marker follows the real game clock: it glides with the clock while the
 * game runs and freezes in place while paused. Returns the hub point while
 * the route is on the ground between cycles.
 */
function planeMarker(route: Route, routeLegs: Leg[], hub: XY, now: Date): PlaneMarker {
  const atHub: PlaneMarker = { x: hub[0], y: hub[1], angle: 0 };
  const timetable = route.timetable;
  if (!timetable || timetable.legs.length === 0 || routeLegs.length === 0) return atHub;

  // Legs are stored flat; rebuild the cycles (each cycle shares a flight number).
  const byFlight = new Map<string, TimetableLeg[]>();
  for (const leg of timetable.legs) {
    const arr = byFlight.get(leg.flightNumber);
    if (arr) arr.push(leg);
    else byFlight.set(leg.flightNumber, [leg]);
  }
  const cycles = [...byFlight.values()];
  if (cycles.length === 0) return atHub;

  // Minutes since Monday 00:00 of the current week (ISO: Monday = 0).
  const dow = (now.getDay() + 6) % 7;
  const nowWeekMin = dow * DAY_MIN + now.getHours() * 60 + now.getMinutes();

  // Full span of a cycle: block times + turnarounds between consecutive legs
  // (times are wrapped past midnight, so gaps are taken mod 1440).
  const cycleSpan = (legs: TimetableLeg[]): number => {
    let span = legs[0].durationMin;
    for (let i = 1; i < legs.length; i++) {
      span += (legs[i].departureMin - legs[i - 1].arrivalMin + DAY_MIN) % DAY_MIN;
      span += legs[i].durationMin;
    }
    return span;
  };

  // The most recently departed cycle (a "future" one this week means last week's).
  let best: TimetableLeg[] | null = null;
  let bestStart = -Infinity;
  for (const cycle of cycles) {
    const weekStart = cycle[0].dayIndex * DAY_MIN + cycle[0].departureMin;
    const start = weekStart > nowWeekMin ? weekStart - WEEK_MIN : weekStart;
    if (start > bestStart) {
      bestStart = start;
      best = cycle;
    }
  }
  if (!best) return atHub;

  const span = cycleSpan(best);
  const elapsed = nowWeekMin - bestStart;
  if (span <= 0 || elapsed < 0 || elapsed >= span) return atHub; // on the ground

  // Walk the cycle's legs to find which segment the aircraft is on.
  let cur = 0;
  for (let i = 0; i < best.length; i++) {
    const segStart = cur;
    cur += best[i].durationMin;
    const segEnd = cur;
    if (elapsed < segEnd || i === best.length - 1) {
      const t = clamp01((elapsed - segStart) / Math.max(1, segEnd - segStart));
      const leg = routeLegs[i % routeLegs.length];
      const [x, y] = pointOnLeg(leg, t);
      // Quadratic Bézier tangent at t → heading.
      const dx = 2 * (1 - t) * (leg.ctrl[0] - leg.start[0]) + 2 * t * (leg.end[0] - leg.ctrl[0]);
      const dy = 2 * (1 - t) * (leg.ctrl[1] - leg.start[1]) + 2 * t * (leg.end[1] - leg.ctrl[1]);
      return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
    }
    cur += (best[i + 1].departureMin - best[i].arrivalMin + DAY_MIN) % DAY_MIN;
  }
  return atHub;
}

type RouteLayer = { d: string; color: string; active: boolean; start: XY; route: Route; legs: Leg[] };
type Pin = { x: number; y: number; isHub: boolean; active: boolean };

const TICK_GAME_MS: Record<GameSpeed, number> = {
  paused: 0,
  normal: 60_000, // 1 game-minute per tick
  fast: 15 * 60_000, // 15 game-minutes
  fastest: 60 * 60_000, // 1 game-hour
};

type TickAnchor = { wall: number; game: number };

/**
 * Smoothed game date for marker motion.
 *
 * The store's clock updates once per real second in a fixed step
 * (1 min / 15 min / 1 hour). Markers interpolate between the two most recent
 * store ticks, measured at their ACTUAL wall-clock spacing (so interval
 * jitter cannot produce a sawtooth) and extrapolate linearly until the next
 * tick. Because the old pair's extrapolation meets the new store value
 * exactly at the tick instant, re-anchoring never snaps the marker back and
 * forth. On speed changes the anchors are re-seeded with a slope that lands
 * exactly on the predicted first tick, and a monotonic floor keeps the
 * displayed time from ever moving backwards.
 */
function useSmoothedGameDate(currentDate: Date | null, gameSpeed: GameSpeed): Date {
  const [displayDate, setDisplayDate] = useState<Date>(() =>
    currentDate && currentDate instanceof Date ? currentDate : new Date()
  );
  const initGame = displayDate.getTime();
  // Two most recent anchors (normally the last two store ticks); seeded with
  // the current speed's nominal step so markers start moving immediately.
  const pairRef = useRef<{ a: TickAnchor; b: TickAnchor }>({
    a: { wall: performance.now() - 1000, game: initGame - TICK_GAME_MS[gameSpeed] },
    b: { wall: performance.now(), game: initGame },
  });
  const floorRef = useRef<number>(initGame); // displayed game time never drops below this
  const heldRef = useRef<number>(initGame); // last displayed game time
  const storeNowRef = useRef<number>(initGame); // last store date in game-ms
  const lastDateRef = useRef<Date | null>(currentDate);
  const mountedRef = useRef(false);

  // New store tick → shift the anchor pair, measured at the real spacing.
  useEffect(() => {
    if (currentDate === lastDateRef.current) return; // mount: keep the seeded slope
    lastDateRef.current = currentDate;
    if (!currentDate || !(currentDate instanceof Date)) return;
    const p = pairRef.current;
    const g = currentDate.getTime();
    storeNowRef.current = g;
    const wall = performance.now();
    if (g < p.b.game) {
      // Store time jumped backwards (e.g. loading an older save): reset to
      // the new truth instead of interpolating backwards.
      p.a = p.b = { wall, game: g };
      floorRef.current = g;
      heldRef.current = g;
    } else {
      p.a = p.b;
      p.b = { wall, game: g };
    }
  }, [currentDate]);

  // Speed change (play/pause, speed switch) → re-seed the anchors so the
  // displayed time blends continuously to the predicted first tick.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const wall = performance.now();
    const held = heldRef.current;
    const storeNow = storeNowRef.current;
    const s = TICK_GAME_MS[gameSpeed];
    if (gameSpeed === 'paused' || held > storeNow + s) {
      // Frozen while paused; or held is above the predicted first tick
      // (resumed at a lower speed) → settle at the honest value.
      const g = gameSpeed === 'paused' ? held : storeNow;
      pairRef.current = { a: { wall, game: g }, b: { wall, game: g } };
      floorRef.current = g;
      heldRef.current = g;
    } else {
      // Blend from the held value so that the first tick after the change
      // lands with zero discontinuity (game-ms per wall-ms).
      const rate = (storeNow + s - held) / 1000;
      pairRef.current = {
        a: { wall: wall - 1000, game: held - 1000 * rate },
        b: { wall, game: held },
      };
      floorRef.current = held;
    }
  }, [gameSpeed]);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const { a, b } = pairRef.current;
      const now = performance.now();
      let game: number;
      if (gameSpeed === 'paused' || b.wall <= a.wall) {
        game = b.game; // frozen (paused, or waiting for the first tick)
      } else {
        const rate = (b.game - a.game) / (b.wall - a.wall); // game-ms per wall-ms
        game = rate > 0 ? b.game + (now - b.wall) * rate : b.game;
      }
      if (game < floorRef.current) game = floorRef.current;
      if (game !== heldRef.current) {
        heldRef.current = game;
        setDisplayDate(new Date(game));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [gameSpeed]);

  return displayDate;
}

export function RouteMapPreview({ routes, className = '' }: { routes: Route[]; className?: string }) {
  // The map's motion must respect the game clock: markers are placed from the
  // timetable + a continuously extrapolated game date, so they glide with the
  // clock (smoothed between the store's 1s ticks) and freeze when paused.
  const gameSpeed = useGameStore((state) => state.gameSpeed);
  const currentDate = useGameStore((state) => state.currentDate);
  const paused = gameSpeed === 'paused';
  const now = useSmoothedGameDate(currentDate, gameSpeed);
  // Container aspect ratio (width / height), measured live (see the
  // ResizeObserver below). The camera's viewBox always matches it, so the map
  // fills the whole element with no letterboxed blank side bars — even on
  // very wide monitors.
  const [aspect, setAspect] = useState(2);
  const { layers, pins, fit } = useMemo(() => {
    const pins = new Map<string, Pin>();
    const addPin = (iata: string, isHub: boolean, active: boolean) => {
      const ap = getAirportByIata(iata);
      if (!ap) return;
      const [x, y] = project([ap.longitude, ap.latitude]);
      const prev = pins.get(iata);
      pins.set(iata, {
        x,
        y,
        isHub: isHub || (prev?.isHub ?? false),
        active: active || (prev?.active ?? false),
      });
    };

    const layers: RouteLayer[] = [];
    for (const [ri, route] of routes.entries()) {
      const { origin, stops, destination } = route;
      const chain = [origin, ...(stops ?? []), destination];
      if (chain.length < 2) continue;
      const pts: XY[] = [];
      for (const iata of chain) {
        const ap = getAirportByIata(iata);
        if (!ap) continue;
        pts.push(project([ap.longitude, ap.latitude]));
        addPin(iata, iata === origin, route.isActive);
      }
      if (pts.length < 2) continue;
      const legs: Leg[] = [];
      for (let i = 0; i < pts.length - 1; i++) legs.push(makeLeg(pts[i], pts[i + 1]));
      legs.push(makeLeg(pts[pts.length - 1], pts[0]));
      layers.push({ d: buildLoopPath(legs), color: ROUTE_COLORS[ri % ROUTE_COLORS.length], active: route.isActive, start: pts[0], route, legs });
    }

    // Auto-fit camera around the network. The rectangle always matches the
    // container's aspect ratio (A = width/height) so the viewBox fills the
    // element exactly — on wide screens the fit zooms in a bit instead of
    // leaving blank bars on the sides.
    const A = aspect;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x: number, y: number) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    };
    pins.forEach((p) => grow(p.x, p.y));
    layers.forEach((l) => {
      const m = /([\d.]+) ([\d.]+)/g;
      let mt: RegExpExecArray | null;
      while ((mt = m.exec(l.d))) grow(parseFloat(mt[1]), parseFloat(mt[2]));
    });
    if (!isFinite(minX)) { minX = 0; maxX = WORLD_W; minY = 0; maxY = WORLD_H; }
    const padX = (maxX - minX) * 0.14 + 3;
    const padY = (maxY - minY) * 0.14 + 3;
    let vw = Math.max(maxX - minX + 2 * padX, (maxY - minY + 2 * padY) * A);
    const minSpan = 34;
    vw = Math.max(vw, minSpan, (minSpan / 2) * A);
    vw = Math.min(vw, WORLD_W, WORLD_H * A);
    const vh = vw / A;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const vx = Math.min(WORLD_W - vw, Math.max(0, cx - vw / 2));
    const vy = Math.min(WORLD_H - vh, Math.max(0, cy - vh / 2));
    const cam = clampCam(vw, vh, vx, vy);
    return { layers, pins, fit: cam };
  }, [routes, aspect]);

  const [camera, setCamera] = useState<Rect | null>(null); // null = auto-fit
  const cam = camera ?? fit;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Container aspect changes (window resize) → re-derive the user's camera so
  // it keeps its zoom level and center but matches the new aspect exactly.
  useEffect(() => {
    setCamera((cur) => {
      if (!cur) return cur;
      const w = Math.min(cur.w, WORLD_H * aspect);
      const h = w / aspect;
      const x = Math.min(WORLD_W - w, Math.max(0, cur.x + cur.w / 2 - w / 2));
      const y = Math.min(WORLD_H - h, Math.max(0, cur.y + cur.h / 2 - h / 2));
      return clampCam(w, h, x, y);
    });
  }, [aspect]);

  const zoomAround = (cx: number, cy: number, factor: number) => {
    setCamera((cur) => {
      const c = cur ?? fit;
      const w = Math.min(MAX_SPAN, WORLD_H * aspect, Math.max(MIN_SPAN, c.w * factor));
      const k = w / c.w;
      return clampCam(w, c.h * k, cx - (cx - c.x) * k, cy - (cy - c.y) * k);
    });
  };

  const zoomCenter = (factor: number) => zoomAround(cam.x + cam.w / 2, cam.y + cam.h / 2, factor);

  // Wheel + double-click via native listeners (React makes onWheel passive)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const toWorld = (clientX: number, clientY: number): XY => {
      const r = svg.getBoundingClientRect();
      return [cam.x + ((clientX - r.left) / r.width) * cam.w, cam.y + ((clientY - r.top) / r.height) * cam.h];
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      zoomAround(wx, wy, Math.exp(e.deltaY * 0.0018));
    };
    const onDbl = (e: MouseEvent) => {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      zoomAround(wx, wy, 0.5);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('dblclick', onDbl);
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('dblclick', onDbl);
    };
  });

  // Keep `aspect` in sync with the rendered element's width/height so the
  // camera's viewBox always matches it exactly (no letterboxed blank bars).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r || r.width <= 0 || r.height <= 0) return;
      const a = Math.round(Math.min(16, Math.max(0.35, r.width / r.height)) * 100) / 100;
      setAspect((cur) => (cur === a ? cur : a));
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  const dragRef = useRef<{ px: number; py: number; cam: Rect } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, cam };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    const svg = svgRef.current;
    if (!d || !svg) return;
    const r = svg.getBoundingClientRect();
    const dx = ((e.clientX - d.px) / r.width) * d.cam.w;
    const dy = ((e.clientY - d.py) / r.height) * d.cam.h;
    setCamera(clampCam(d.cam.w, d.cam.h, d.cam.x - dx, d.cam.y - dy));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const graticule = useMemo(() => {
    const lines: string[] = [];
    for (let lon = -150; lon <= 150; lon += 30) lines.push(`M ${lon + 180} -220 V 400`);
    for (let lat = -60; lat <= 60; lat += 30) lines.push(`M -220 ${90 - lat} H 580`);
    return lines;
  }, []);

  const activeLayers = layers.filter((l) => l.active);

  // Pin/plane size scales with zoom (kept consistent on screen, smaller base)
  const pinScale = Math.min(2.2, Math.max(0.4, Math.pow(cam.w / fit.w, 0.7)));
  const planeScale = Math.min(2, Math.max(0.35, Math.pow(cam.w / fit.w, 0.85)));
  // Labels: on-screen size grows only gently with the zoom (~zoom^0.3),
  // tiny when zoomed out, and capped so they stay small when zoomed in.
  const labelScale = Math.min(1.6, Math.max(0.5, Math.pow(cam.w / fit.w, 0.7)));
  const planeD = `M ${2 * planeScale} 0 L ${-1.05 * planeScale} ${1.25 * planeScale} L ${-0.35 * planeScale} 0 L ${-1.05 * planeScale} ${-1.25 * planeScale} Z`;

  const btn =
    'flex h-7 w-7 items-center justify-center rounded-md border border-sky-500/30 bg-slate-900/70 text-sm font-bold text-sky-300 backdrop-blur-sm transition hover:bg-slate-800/80 hover:text-sky-200';

  return (
    <div className={`relative overflow-hidden rounded-xl border border-sky-900/60 bg-[#0a1220] ${paused ? 'map-paused ' : ''}${className}`}>
      <svg
        ref={svgRef}
        viewBox={`${cam.x.toFixed(2)} ${cam.y.toFixed(2)} ${cam.w.toFixed(2)} ${cam.h.toFixed(2)}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        role="img"
        aria-label="Route map preview"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <linearGradient id="mapLandDim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a1424" stopOpacity="0.08" />
            <stop offset="0.5" stopColor="#0a1424" stopOpacity="0.28" />
            <stop offset="1" stopColor="#0a1424" stopOpacity="0.08" />
          </linearGradient>
          <radialGradient id="mapFade" cx="0.5" cy="0.5" r="0.72">
            <stop offset="0.72" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="mapFadeMask">
            <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="url(#mapFade)" />
          </mask>
        </defs>

        {/* Dark backdrop beyond the world bounds */}
        <rect x="-220" y="-220" width="800" height="620" fill="#0a1220" />

        {/* Real Earth photo (equirectangular, left edge = 180°) */}
        <g mask="url(#mapFadeMask)">
          <image
            href={EARTH_PHOTO}
            x="0"
            y="0"
            width={WORLD_W}
            height={WORLD_H}
            preserveAspectRatio="none"
          />
          {/* Slight dim so colored routes pop over bright land */}
          <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="url(#mapLandDim)" />
        </g>

        {/* Faint graticule */}
        <g stroke="#7dd3fc" strokeWidth="0.12" opacity="0.12" fill="none">
          {graticule.map((d, i) => <path key={i} d={d} />)}
        </g>

        {/* Inactive routes — ghost lines */}
        {layers
          .filter((l) => !l.active)
          .map((l, i) => (
            <path
              key={`ghost-${i}`}
              d={l.d}
              stroke="#cbd5e1"
              strokeWidth="0.5"
              strokeDasharray="1.5 3"
              strokeLinecap="round"
              fill="none"
              opacity="0.4"
            />
          ))}

        {/* Active routes — animated dashes */}
        {activeLayers.map((l, i) => (
          <g key={`route-${i}`}>
            <path
              d={l.d}
              stroke={l.color}
              strokeWidth="0.8"
              strokeLinecap="round"
              fill="none"
              opacity="0.95"
              className="route-arc-dash"
            />
          </g>
        ))}

        {/* Planes: positioned on the arc from the timetable + game date (size scales with zoom).
            They follow the game clock — gliding each tick while running, frozen while paused,
            parked at the hub while the route is on the ground. */}
        {activeLayers.map((l, i) => {
          const m = planeMarker(l.route, l.legs, l.start, now);
          return (
            <path
              key={`plane-${i}`}
              d={planeD}
              fill={l.color}
              stroke="#f8fafc"
              strokeWidth={0.2 * planeScale}
              className="map-plane-marker"
              transform={`translate(${m.x.toFixed(2)} ${m.y.toFixed(2)}) rotate(${m.angle.toFixed(1)})`}
            />
          );
        })}

        {/* Airport pins (size scales with zoom) */}
        {[...pins.entries()].map(([iata, pin]) => (
          <g key={iata} opacity={pin.active ? 1 : 0.55}>
            {pin.isHub && pin.active && (
              <circle className="map-hub-pulse" cx={pin.x} cy={pin.y} r={1.8 * pinScale} fill="none" stroke="#7dd3fc" strokeWidth={0.3 * pinScale} />
            )}
            {pin.isHub && <circle cx={pin.x} cy={pin.y} r={1.7 * pinScale} fill="none" stroke="#7dd3fc" strokeWidth={0.25 * pinScale} opacity="0.6" />}
            {pin.isHub ? (
              <>
                <circle cx={pin.x} cy={pin.y} r={0.95 * pinScale} fill="#0c4a6e" stroke="#f8fafc" strokeWidth={0.2 * pinScale} />
                <circle cx={pin.x} cy={pin.y} r={0.6 * pinScale} fill="#7dd3fc" />
              </>
            ) : (
              <circle cx={pin.x} cy={pin.y} r={0.6 * pinScale} fill={pin.active ? '#f8fafc' : '#94a3b8'} stroke="#0f172a" strokeWidth={0.18 * pinScale} />
            )}
            <text
              x={pin.x + 1.5 * labelScale}
              y={pin.y + 0.9 * labelScale}
              fontSize={1.8 * labelScale}
              fontWeight="700"
              fill={pin.isHub ? '#e0f2fe' : '#f1f5f9'}
              letterSpacing="0.1"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {iata}
            </text>
          </g>
        ))}
      </svg>

      {/* Zoom controls */}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" className={btn} onClick={() => zoomCenter(1 / 1.5)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className={btn} onClick={() => zoomCenter(1.5)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className={btn} onClick={() => setCamera(null)} aria-label="Reset view">
          ⌂
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-1.5 left-2 rounded bg-slate-950/50 px-1.5 py-0.5 text-[10px] text-slate-400">
        scroll to zoom · drag to pan · double-click to zoom in
      </div>
    </div>
  );
}
