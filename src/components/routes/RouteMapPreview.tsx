// ============================================================
// RouteMapPreview — interactive 2D SVG world map of your routes
// Equirectangular projection (viewBox units): x = lon + 180, y = 90 - lat.
// Background is the real Earth photo /textures/day.jpg (equirectangular,
// 2:1, left edge = 180° meridian), so it lines up exactly with that
// projection. Interactive camera: wheel zoom at cursor, drag to pan,
// +/-/reset buttons, double-click zoom. Pin and plane sizes scale with
// the zoom level so they keep a consistent on-screen size.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from '@/types/game';
import { getAirportByIata } from '@/data/airports';

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

function clampCam(w: number, x: number, y: number): Rect {
  const h = w / 2;
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

type RouteLayer = { d: string; color: string; active: boolean; dur: number };
type Pin = { x: number; y: number; isHub: boolean; active: boolean };

export function RouteMapPreview({ routes, className = '' }: { routes: Route[]; className?: string }) {
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
      const dur = Math.min(60, Math.max(8, (route.flightTimeMin ?? 60) * 0.18));
      layers.push({ d: buildLoopPath(legs), color: ROUTE_COLORS[ri % ROUTE_COLORS.length], active: route.isActive, dur });
    }

    // Auto-fit camera around the network
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
    let padX = (maxX - minX) * 0.14 + 3;
    let padY = (maxY - minY) * 0.14 + 3;
    let vx = Math.max(0, minX - padX);
    let vy = Math.max(0, minY - padY);
    let vw = Math.min(WORLD_W, maxX + padX - vx);
    let vh = Math.min(WORLD_H, maxY + padY - vy);
    const minSpan = 34;
    if (vw < minSpan || vh < minSpan / 2) {
      const cx = vx + vw / 2, cy = vy + vh / 2;
      const ratio = Math.max(minSpan / vw, minSpan / 2 / vh, 1);
      vw *= ratio; vh *= ratio;
      vx = Math.max(0, Math.min(WORLD_W - vw, cx - vw / 2));
      vy = Math.max(0, Math.min(WORLD_H - vh, cy - vh / 2));
    }
    const cam = clampCam(vw, vx, vy);
    return { layers, pins, fit: cam };
  }, [routes]);

  const [camera, setCamera] = useState<Rect | null>(null); // null = auto-fit
  const cam = camera ?? fit;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const zoomAround = (cx: number, cy: number, factor: number) => {
    setCamera((cur) => {
      const c = cur ?? fit;
      const w = Math.min(MAX_SPAN, Math.max(MIN_SPAN, c.w * factor));
      const k = w / c.w;
      return clampCam(w, cx - (cx - c.x) * k, cy - (cy - c.y) * k);
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
    setCamera(clampCam(d.cam.w, d.cam.x - dx, d.cam.y - dy));
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
    <div className={`relative overflow-hidden rounded-xl border border-sky-900/60 bg-[#0a1220] ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`${cam.x.toFixed(2)} ${cam.y.toFixed(2)} ${cam.w.toFixed(2)} ${cam.h.toFixed(2)}`}
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

        {/* Planes flying the full loop (size scales with zoom) */}
        {activeLayers.map((l, i) => (
          <path
            key={`plane-${i}`}
            d={planeD}
            fill={l.color}
            stroke="#f8fafc"
            strokeWidth={0.2 * planeScale}
          >
            <animateMotion
              dur={`${l.dur.toFixed(1)}s`}
              begin={`${(-(i * 1.7)).toFixed(1)}s`}
              repeatCount="indefinite"
              path={l.d}
              rotate="auto"
            />
          </path>
        ))}

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
