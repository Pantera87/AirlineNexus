# Plan: Turn Airline Nexus from a text dashboard into a visual game

Created: 2026-08-26 (approved in act mode)

## Overview of what exists today

- **3D world** (`src/components/world/WorldView.tsx` + `geo.ts`) — day/night shader Earth, sun, stars, airport pins, cyan route arcs. Aircraft are drawn as tiny static boxes pinned to their current airport; nothing is clickable.
- **Screens** — Dashboard/Fleet/Routes/Finances/Fuel are glass panels full of text lists; only `FuelScreen` uses recharts (fuel price history). No cash/revenue history exists yet (`finances.monthlyReports` and `world.fuelPriceHistory` do, so charts are feasible from day 1 or via a new lightweight history log).
- **Aircraft artwork** — `AircraftImage.tsx` already resolves `/images/aircraft/<key>.jpg`, but only one photo exists (`b737-max8.jpg`).
- **Game feel** — framer-motion present, but almost unused; no sounds (settings has `soundEnabled`), no toasts, HUD CSS classes (`.hud-grid`, `.scanline-overlay`, `.glow-text`) exist in `globals.css` but are never applied.

No new npm packages needed — everything uses React Three Fiber/drei, recharts, framer-motion, lucide-react, and the Web Audio API.

---

## Phase 1 — Make the 3D world a living centerpiece

**File: `src/components/world/WorldView.tsx`** (new subcomponents in same file or split into `world/*.tsx`)

1. **Animated flying aircraft.** Replace the static box in `SimpleAircraft`:
   - For each route's assigned aircraft, compute the leg list (origin → stops → destination → back to hub, reusing the existing `RouteArc` slerp logic) with per-leg travel times from `route.flightTimeMin` / distance.
   - In a `useFrame`, advance each aircraft's progress by `delta × gameSpeedMultiplier` (mirror the Sun/Earth accumulator pattern already used for smooth motion), position it along its leg's great-circle path with arc lift, and orient it with `lookAt(nextPoint)` so planes visibly fly.
   - Color-code by status (existing colors) but use a small **plane-shaped mesh** (fuselage + wings boxes) instead of one box; keep the red pulse for maintenance.
2. **Clickable airports & routes with HTML overlays** (drei `Html`):
   - Hover an airport pin → tooltip with IATA, name, popularity bar.
   - Click a route arc → floating panel showing load factor, frequency, weekly revenue/cost (data all exists on `Route`).
3. **Atmosphere & clouds:** add a fresnel-style atmosphere rim (a second slightly larger sphere with `backside` material + additive blending) and an optional cloud layer using the existing `specularClouds.jpg` texture as a slowly-rotating semi-transparent shell.
4. **Legend/HUD overlay** in screen space (absolutely positioned div over the Canvas): status colors, "drag to rotate" hint — gives it a game-HUD feel.

## Phase 2 — Visual management screens

1. **Dashboard (`DashboardScreen.tsx`)**
   - Add a live visual header: a compact animated cockpit background (reuse `.hud-grid` + `.scanline-overlay`).
   - Replace plain stat cards with **gauge rings** (SVG `stroke-dasharray` circles): reputation, fleet utilization (in-flight %), route profitability.
   - Add two recharts mini-charts: cash over time and revenue vs expenses — requires a new **history log**: extend `gameStore.ts` `accrueFinances`/week-boundary settlement to push a `{ date, cash, revenue, expenses }` point into `finances.history` (capped ~26 weeks), mirroring how `world.fuelPriceHistory` is maintained.

2. **Fleet (`FleetScreen.tsx`, `AircraftCard.tsx`)**
   - Real artwork: generate a **procedural SVG side-profile aircraft** component (`components/AircraftArtwork.tsx`) — category-based silhouettes (turboprop / regional / narrowbody / widebody), tinted with the airline's livery colors from `Aircraft.liveries`. Fall back to it when no JPG exists; keep photo path working for types that have one.
   - Per-aircraft cards: condition bar, maintenance countdown ring, status chip with icon, registration plate styling.

3. **Routes (`RoutesScreen.tsx`)** — the biggest text offender (47KB)
   - Replace wall-of-text route rows with **route map cards**: origin→destination shown on a small 2D equirectangular strip using the existing `latLonToScreenXY` + `greatCirclePath` from `geo.ts` (drawn as an SVG polyline over a dark map div), plus load-factor heat bar, weekly P/L chip, and frequency pips.
   - Group routes visually by profitability (color-coded left borders / background tints).

4. **Finances (`FinancesScreen.tsx`)**
   - Add recharts: monthly revenue/expense/profit bars from `finances.monthlyReports`, cash trend line from the new history log, loan balance visualization as stacked bars.

5. **Fuel screen** already has a chart — polish styling (gradient area fill, glow) for consistency.

## Phase 3 — Game feel ("juice")

1. **Toasts:** new `components/Toast.tsx` + zustand slice (standalone store) — slide-in cards with per-type icons and framer-motion; fire on purchases, loans, route creation, weekly settlements, notifications (respecting `settings.notificationsEnabled`).
2. **Sounds:** new `utils/sound.ts` using the Web Audio API (synthesized clicks/whooshes/cash chimes — no asset files needed); wired to a single `playSound(name)` that checks `settings.soundEnabled`. Trigger on screen changes, purchases, notifications.
3. **Animated numbers:** small `useAnimatedNumber` hook (tween via rAF) for cash, net worth, revenue displays so money visibly counts up/down.
4. **Micro-interactions:** card hover glows (extend `.card-hover`), button press states, success burst on purchase (framer-motion plane flying off the screen), active-tab underline animation in `Sidebar.tsx`.
5. **HUD styling pass:** apply `.hud-grid` / `.scanline-overlay` / `.glow-text` to TopBar and Dashboard header for a cockpit-console look; add subtle animated gradient background to empty states.

## Build order (with validation after each step)

1. Phase 1 items 1–2 (flying planes + tooltips) → validate via `npm run dev`, check WorldView with an active route
2. Phase 1 items 3–4 → performance check (target 60fps, arcs cached via existing `useMemo`)
3. History log in store + Dashboard charts/gauges
4. Fleet artwork + condition bars
5. RoutesScreen card redesign
6. Finances charts
7. Toasts, sounds, animated numbers, HUD pass

## Risks / notes

- **Performance:** per-aircraft `useFrame` updates are cheap (dozens of planes), arc points stay memoized; clouds/atmosphere are single extra meshes. Fine on WebGL.
- **Data migration:** the new `finances.history` is additive and optional — old saves keep working (charts simply start empty).
- RoutesScreen is large; restructure it in-place while preserving all existing behavior (create/edit/delete route flows, frequency limits from `routeEngine`).

## Implementation status

- [x] Plan approved & saved
- [ ] Phase 1.1 — animated flying aircraft
- [ ] Phase 1.2 — clickable airports & routes
- [ ] Phase 1.3 — atmosphere & clouds
- [ ] Phase 1.4 — HUD legend overlay
- [ ] Phase 2.1 — Dashboard gauges + charts (+ history log)
- [ ] Phase 2.2 — Fleet artwork + condition bars
- [ ] Phase 2.3 — Routes screen map cards
- [ ] Phase 2.4 — Finances charts
- [ ] Phase 2.5 — Fuel chart polish
- [ ] Phase 3.1 — Toasts
- [ ] Phase 3.2 — Sounds
- [ ] Phase 3.3 — Animated numbers
- [ ] Phase 3.4 — Micro-interactions
- [ ] Phase 3.5 — HUD styling pass

