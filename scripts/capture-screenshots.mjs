/**
 * Capture README screenshots from the built app.
 *
 * Usage:  node scripts/capture-screenshots.mjs
 *
 * Serves dist/ on a temp port, drives the UI with Puppeteer,
 * saves PNGs to docs/screenshots/.
 */
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'docs', 'screenshots');
const PORT = 4343; // separate from the app port

mkdirSync(OUT, { recursive: true });

/* ── Static file server ──────────────────────────────────────────── */
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

const server = createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;
  const filePath = join(DIST, url);
  const ext = extname(filePath);
  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise((resolve) => {
  server.listen(PORT);
  resolve();
});

/* ── Helpers ─────────────────────────────────────────────────────── */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait until the rendered page is visually stable: repeatedly snapshot the
 * viewport and compare SHA-256 hashes. The app transitions screens with
 * framer-motion AnimatePresence (opacity fades) and the TopBar/status dots
 * use a Tailwind `animate-pulse` keyframe, so a fixed sleep can land
 * mid-animation.
 *
 * IMPORTANT: only `.animate-pulse` (and friends) may be neutralized. Do NOT
 * set a global `transition: none !important` — framer-motion v12 drives its
 * simple opacity/transform animations through real CSS transitions, and a
 * global override freezes AnimatePresence exit fades mid-fade, leaving the
 * outgoing screen's DOM permanently stuck in the viewport (the "ghosting"
 * seen in earlier captures).
 */
async function waitForStable(page, { pollMs = 350, maxMs = 12000 } = {}) {
  const hashOf = (buf) => createHash('sha256').update(buf).digest('hex');
  // Freeze only the decorative pulse/bounce loops so frames are deterministic
  // while framer-motion is left free to finish its exit fades.
  await page.addStyleTag({
    content:
      '.animate-pulse, .animate-bounce, .animate-float { animation: none !important; }',
  });
  let prev = null;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const buf = await page.screenshot({ type: 'png' });
    const hash = hashOf(buf);
    if (prev && hash === prev) {
      // two consecutive identical frames → stable
      return;
    }
    prev = hash;
    await wait(pollMs);
  }
  throw new Error('Page never settled within ' + maxMs + 'ms');
}

/**
 * Safety net: once stable, the screen-transition container (when present,
 * i.e. for screens rendered inside <Layout/>) must hold exactly one child —
 * more than one means an AnimatePresence exit element never unmounted.
 */
async function assertSingleScreen(page) {
  const count = await page.evaluate(() => {
    const container = document.querySelector('main > div.overflow-auto');
    return container ? container.childElementCount : 0;
  });
  if (count > 1) {
    throw new Error(`Expected 1 screen element in content area, found ${count}`);
  }
}


/* ── Build a valid airline state for localStorage injection ─────── */
const AIRLINE = {
  id: 'airline-screenshot',
  name: 'SkyHigh Airlines',
  iataCode: 'SH',
  icaoCode: 'SKH',
  headquarters: 'JFK',
  founded: '2024-01-01T00:00:00.000Z',
  businessModel: 'full-service',
  reputation: 50,
  rating: 3,
  alliance: null,
  fleet: [],
  routes: [],
  staff: [],
  finances: {
    cash: 50000000,
    totalRevenue: 0,
    totalExpenses: 0,
    profit: 0,
    assets: 50000000,
    liabilities: 0,
    netWorth: 50000000,
    monthlyReports: [],
    loans: [],
    investments: [],
  },
  loyaltyProgram: {
    name: 'SkyHigh Airlines Miles',
    isActive: false,
    members: 0,
    tiers: [],
    partnerAirlines: [],
  },
  achievements: [],
};

const WORLD = {
  fuelPrice: 0.95,
  fuelPriceHistory: [],
  economicIndex: 75,
  travelDemand: 80,
  competitorAirlines: [
    { id: 'comp-1', name: 'Global Airways', iataCode: 'GA', marketShare: 15, reputation: 78, fleetSize: 120, routes: 250 },
    { id: 'comp-2', name: 'Pacific Airlines', iataCode: 'PA', marketShare: 12, reputation: 72, fleetSize: 95, routes: 180 },
    { id: 'comp-3', name: 'EuroWings', iataCode: 'EW', marketShare: 10, reputation: 80, fleetSize: 110, routes: 220 },
  ],
  activeEvents: [],
  regulations: [],
};

const SETTINGS = {
  notificationsEnabled: true,
  soundEnabled: true,
  musicEnabled: true,
  showTooltips: true,
  currencyFormat: 'USD',
  dateFormat: 'US',
  units: 'imperial',
};

/** Set the Zustand localStorage to a given screen, then reload the page. */
function persistState(screen, airline = null) {
  const data = {
    currentDate: '2024-01-01T00:00:00.000Z',
    currentScreen: screen,
    settings: SETTINGS,
    world: WORLD,
  };
  if (airline) data.airline = airline;
  // zustand v5 persist format: top-level `state` key (NOT `data`) and the
  // app's configured persist version (no `version` option → 0).
  return JSON.stringify({ state: data, version: 0 });
}

/* ── Main ────────────────────────────────────────────────────────── */
async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-gpu', '--disable-web-security'],
  });

  /**
   * Per-screen capture on a FRESH, fully isolated page (own incognito
   * context → pristine localStorage + IndexedDB, so nothing from a
   * previous screen can leak in).
   *
   * For non-welcome screens the Zustand persist blob is injected with
   * `evaluateOnNewDocument`, i.e. BEFORE any page script runs, so the
   * target screen is the very first thing the app ever renders. No
   * reload, no first-render→hydrate swap — this eliminates the
   * compositor/stale-frame "ghosting" that a goto+reload cycle could
   * leave behind.
   */
  async function capture(screen, file, airline = null) {
    console.log(`Capturing: ${screen} → ${file}`);
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    // Surface page-side errors so we can spot hydration issues early.
    page.on('pageerror', (err) => console.log('  [pageerror]', err.message));
    if (screen !== 'welcome') {
      await page.evaluateOnNewDocument(
        (json) => localStorage.setItem('airline-sim-storage', json),
        persistState(screen, airline),
      );
    }
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
    await wait(2500); // hydration + first paint
    await waitForStable(page);
    await assertSingleScreen(page);
    await page.screenshot({ path: join(OUT, file) });
    await page.close();
    await context.close();
  }

  await capture('welcome', 'welcome.png');
  await capture('airline-setup', 'airline-setup.png');
  await capture('dashboard', 'dashboard.png', AIRLINE);
  await capture('fleet', 'fleet.png', AIRLINE);
  await capture('routes', 'routes.png', AIRLINE);

  await browser.close();
  server.close();
  console.log('Done. Screenshots saved to docs/screenshots/');
}

await main();
