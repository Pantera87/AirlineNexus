# Fleet Marketplace — Phase 1 Implementation Plan

**Created:** August 4, 2026  
**Project:** Airline Management Game (AirlineNexus)  
**Status:** Ready for implementation  

---

## Vision

A modern liquid glass UI fleet marketplace page where players purchase new or used aircraft with realistic pricing and financing. Used listings appear randomly over time to simulate a dynamic secondary market.

---

## Confirmed Requirements

| Feature | Status |
|---------|--------|
| Buy New tab — all currently-in-production aircraft | ✅ Required |
| Used Fleet tab — random listings from 1960+ legacy planes | ✅ Required |
| Financing system (cash or loan with monthly payments) | ✅ Required |
| Modern liquid glass UI aesthetic | ✅ Required |
| Filter sidebar for both tabs | ✅ Required |
| Detail modal with full specs + purchase flow | ✅ Required |
| Phase 2 foundation (accessories array wired now) | ✅ Required |
| Compare feature | ❌ Explicitly excluded |

---

## Architecture Overview

### Tech Stack Alignment
- React + TypeScript + Vite + Tailwind CSS (existing stack preserved)
- Zustand for state management (aligned with existing pattern)
- Integrates with game time engine for used market refresh cycles

### File Structure Additions

```
src/
├── types/
│   └── game.ts                         // Extended interfaces
├── data/
│   ├── aircraft-types.ts               // 60+ aircraft database (new + legacy)
│   └── market-generator.ts             // Used listing generator logic
├── store/
│   └── fleetSlice.ts                   // Marketplace state + actions
├── components/
│   ├── FleetMarketplace.tsx            // Main page with tabs
│   ├── FilterSidebar.tsx               // Filtering controls
│   ├── AircraftGrid.tsx                // Grid layout wrapper
│   ├── AircraftCard.tsx                // Individual plane card (liquid glass)
│   ├── AircraftDetailModal.tsx         // Specs + purchase trigger
│   └── PurchaseDialog.tsx              // Cash vs financing slider
├── styles/
│   └── liquid-glass.css                 // Glassmorphism utilities
└── App.tsx                             // Route update: /fleet/marketplace
```

---

## Detailed Implementation Steps

### Step 1 — Extend Type Definitions (`src/types/game.ts`)

Add these new interfaces and enums:

**Enums:**
```typescript
export enum ConditionGrade {
  Excellent = "Excellent",     // Like-new, <5k hours since last major overhaul
  VeryGood = "Very Good",      // Minor wear, well-maintained
  Good = "Good",               // Average condition, some cosmetic wear
  Fair = "Fair",               // Needs refurbishment, higher maintenance costs
  Poor = "Poor"                // Major overhaul required immediately
}

export enum PurchaseType {
  Cash = "Cash",
  Loan = "Loan"
}

export enum AircraftCategory {
  Narrowbody = "Narrowbody",
  Widebody = "Widebody",
  Regional = "Regional",
  Turboprop = "Turboprop",
  Cargo = "Cargo",
  BusinessJet = "Business Jet"
}
```

**Interfaces:**
```typescript
export interface Accessory {
  id: string;
  name: string;                   // e.g., "Starlink Connectivity", "Short Field Performance Package"
  type: string;                   // "connectivity", "performance", "interior", "avionics", etc.
  price: number;                  // One-time cost in USD
  monthlyCost?: number;           // Optional recurring cost (e.g., Starlink subscription)
  description: string;
}

export interface AircraftListing {
  id: string;                     // Unique marketplace listing ID
  aircraftTypeId: string;         // Links to aircraft-types.ts entry
  isNew: boolean;                 // true = Buy New tab, false = Used Fleet tab
  
  // Price & Financing
  price: number;                  // Display price (MSRP for new, calculated for used)
  
  // Condition (used only)
  condition?: ConditionGrade;     // Not applicable for new aircraft
  manufactureYear?: number;       // Actual year this unit was built
  totalFlightHours?: number;      // Accumulated hours since first flight
  cycles?: number;                // Takeoff/landing cycles
  
  // Accessories (Phase 2 ready)
  includedAccessories: Accessory[];
  
  // Marketplace metadata
  sellerName?: string;            // For used: airline name or "Aircraft Broker"
  listingDate?: GameDate;         // When this appeared on the market
  expiresAt?: GameDate | null;    // null = permanent (new), date = used listing expiry
  
  // Purchase state
  purchased: boolean;             // Prevents double-buying active listings
}

// Extend existing AircraftType interface fields:
export interface AircraftType {
  id: string;                     // e.g., "boeing-787-9"
  manufacturer: string;           // "Boeing", "Airbus", etc.
  model: string;                  // "787-9 Dreamliner"
  category: AircraftCategory;
  
  // Production status
  inProduction: boolean;          // true = Buy New tab, false = Used only
  
  // First delivery year (for filtering + realism)
  firstDeliveryYear: number;      // e.g., 1970 for 747-100
  
  // MSRP (new aircraft base price in USD)
  msrpUsd: number;                // Real-world approximate list price
  
  // Specifications (existing fields preserved)
  rangeKm: number;
  seatsEconomy: number;
  seatsBusiness: number;
  seatsFirst?: number;
  
  // Performance & efficiency metrics
  cruiseSpeedKmh: number;
  fuelBurnPerHourKg: number;      // Approximate at cruise
  maxPayloadKg: number;
  
  // Operating costs (existing fields preserved)
  monthlyMaintenanceUsd: number;
  insuranceMultiplier: number;    // Base multiplier for calculating premium
  
  // Available accessories list (Phase 2 foundation)
  compatibleAccessories: string[];// Array of accessory type IDs that can be added
}

// Extend Aircraft interface if it exists:
export interface Aircraft {
  id: string;
  aircraftTypeId: string;
  
  // Operational data (existing fields preserved)
  registrationNumber: string;     // e.g., "N789AX"
  acquisitionDate: GameDate;      // When purchased
  purchasePriceUsd: number;       // Actual price paid
  
  // Condition tracking (used for both new and used acquisitions)
  manufactureYear: number;
  totalFlightHours: number;
  cycles: number;
  
  // Current accessories installed
  accessories: Accessory[];
}

// Financing interface:
export interface AircraftLoan {
  id: string;
  aircraftId: string;             // Links to purchased Aircraft record
  principalAmountUsd: number;     // Loan amount (after down payment)
  interestRatePercent: number;    // Annual percentage rate (APR)
  termMonths: number;             // Loan duration in months
  monthlyPaymentUsd: number;      // Fixed monthly payment
  
  remainingBalanceUsd: number;
  startDate: GameDate;
  maturityDate: GameDate;         // When loan is fully paid off
}

export interface PurchaseConfig {
  type: PurchaseType;
  totalPriceUsd: number;
  
  // If Loan selected:
  downPaymentPercent?: number;    // e.g., 20% = player pays 20% cash upfront
  loanTermMonths?: number;        // Options: 36, 48, 60, 72, 84, 96 months
  interestRatePercent?: number;   // Calculated based on player credit/rating + market rates
}
```

---

### Step 2 — Aircraft Database (`src/data/aircraft-types.ts`)

**Scope:** 60+ aircraft covering all categories from legacy to current.

**New Production Aircraft (Buy New tab):**
- Airbus: A220-100/-300, A319neo, A320neo, A321neo/XLR, A330-800/900neo, A350-900/-1000, A380-800
- Boeing: 737 MAX 7/8/9/10, 767-300ER(BCF), 777-8/-9, 787-8/-9/-10, 747-8F (cargo only)
- Embraer: E175-E2, E190-E2
- ATR: 42-600S, 72-600
- Dassault: Falcon 8X/10X series (business jets for future expansion)

**Legacy Aircraft (Used Fleet tab only):**
- Boeing: 727, 737 Classic (-300/-400/-500), 747-100 through -400, 757-200/-300, 767-200/-300ER, 777-200/-300 original
- Airbus: A300B4, A310, A318/A319/A320ceo family, A330-200/300 original, A340-200 through -600, early A350 variants
- McDonnell Douglas: MD-11F (cargo), DC-9/MDC-80 series, F-27/F-28 turboprops
- Others: Ilyushin Il-86/Il-96 variants, Tupolev Tu-204 family

**Key Data Points per Aircraft:**
```typescript
export const AIRCRAFT_TYPES: Record<string, AircraftType> = {
  "boeing-737-max-8": {
    id: "boeing-737-max-8",
    manufacturer: "Boeing",
    model: "737 MAX 8",
    category: AircraftCategory.Narrowbody,
    inProduction: true,
    firstDeliveryYear: 2017,
    msrpUsd: 125500000,
    
    rangeKm: 6570,
    seatsEconomy: 189,
    seatsBusiness: 0,           // Default layout; game may allow customization later
    cruiseSpeedKmh: 839,
    fuelBurnPerHourKg: 2450,
    
    monthlyMaintenanceUsd: 125000,
    insuranceMultiplier: 1.0,   // Baseline
    
    compatibleAccessories: ["starlink-connectivity", "short-field-kit-737"]
  },
  
  "boeing-747-400": {
    id: "boeing-747-400",
    manufacturer: "Boeing",
    model: "747-400",
    category: AircraftCategory.Widebody,
    inProduction: false,         // Used only
    firstDeliveryYear: 1988,     // For used market filtering
    
    msrpUsd: 265000000,          // Original MSRP for depreciation calculation
    
    rangeKm: 13450,
    seatsEconomy: 416,
    cruiseSpeedKmh: 913,
    
    monthlyMaintenanceUsd: 275000,
    insuranceMultiplier: 1.8,    // Higher for older/heavier aircraft
    
    compatibleAccessories: ["cargo-conversion-kit-747"]
  },
  
  // ... remaining 60+ entries follow the same pattern
};

// Helper functions exported from this file:
export function getNewProductionAircraft(): AircraftType[];
export function getLegacyAircraft(): AircraftType[];
export function getAircraftByCategory(category: AircraftCategory): AircraftType[];
```

---

### Step 3 — Used Market Generator (`src/data/market-generator.ts`)

**Purpose:** Generate random used listings that appear/disappear over game time.

**Core Logic:**

1. **Depreciation Formula:**
   ```typescript
   function calculateUsedPrice(aircraftType: AircraftType, yearBuilt: number, condition: ConditionGrade, flightHours: number): number {
     const age = currentGameYear - yearBuilt;
     
     // Base depreciation curve (steeper early years, flattening later)
     let ageFactor = Math.max(0.15, 1 - (age * 0.035));  // ~3.5% per year minimum floor 15%
     
     // Flight hours penalty (above expected baseline)
     const expectedHoursForAge = age * 3000;              // Roughly 3k hrs/year typical airline use
     const hourPenaltyFactor = flightHours > expectedHoursForAge 
       ? Math.max(0.85, 1 - ((flightHours - expectedHoursForAge) / expectedHoursForAge) * 0.25)
       : 1;
     
     // Condition multiplier table
     const conditionMultipliers: Record<ConditionGrade, number> = {
       [ConditionGrade.Excellent]: 1.0,
       [ConditionGrade.VeryGood]: 0.92,
       [ConditionGrade.Good]: 0.82,
       [ConditionGrade.Fair]: 0.70,
       [ConditionGrade.Poor]: 0.55
     };
     
     const price = aircraftType.msrpUsd * ageFactor * hourPenaltyFactor * conditionMultipliers[condition];
     
     return Math.round(price / 1000) * 1000;              // Round to nearest $1,000
   }
   ```

2. **Listing Generation Rules:**
   - New used listings appear weekly (tied to game time engine).
   - Pool size: 3–8 new used listings per week depending on market phase.
   - Rarity system: Older/narrower-market planes (MD-11F, A340) appear less often than common types (737 Classic, A320ceo).
   - Each listing has a random lifespan: 2–8 weeks before it expires or is marked "SOLD".

3. **Condition & History Assignment:**
   - Year built randomly selected within the aircraft's production window.
   - Flight hours correlated to age but with variance (some planes were heavily used, others stored).
   - Condition grade influenced by maintenance history simulation.

**Exported Functions:**
```typescript
export function generateUsedListing(): AircraftListing;
export function refreshUsedMarket(currentDate: GameDate): void;     // Called weekly via time engine hook
export function getActiveListings(filter?: ListingFilter): AircraftListing[];
export function removeExpiredListings(currentDate: GameDate): void;
```

---

### Step 4 — Store Slice (`src/store/fleetSlice.ts`)

**Pattern:** Zustand slice (matches existing store architecture).

**State Shape:**
```typescript
interface FleetMarketplaceState {
  // Listings
  newAircraftListings: AircraftListing[];      // Generated from AIRCRAFT_TYPES where inProduction === true
  usedAircraftListings: AircraftListing[];     // Managed by market-generator.ts
  
  // Filters
  activeFilters: {
    category?: string[],
    manufacturer?: string[],
    priceRange?: [number, number],
    capacityMin?: number,
    rangeMin?: number,
    
    // Used-specific filters
    conditionGrade?: ConditionGrade[],
    yearBuiltFrom?: number,
    flightHoursMax?: number
  };
  
  // UI State
  selectedListingId: string | null;            // Opens detail modal
  activeTab: "new" | "used";                   // Current marketplace tab
  
  // Actions
  setFilters(filters: Partial<FleetMarketplaceState["activeFilters"]>): void;
  clearAllFilters(): void;
  
  selectListing(listingId: string): void;      // Opens detail modal
  closeDetailModal(): void;                    // Closes detail modal
  
  switchTab(tab: "new" | "used"): void;        // Switch between tabs
  
  purchaseAircraft(listingId: string, config: PurchaseConfig): Promise<PurchaseResult>;
  
  refreshUsedMarketplace(): void;              // Trigger new used listing generation (weekly or manual)
}
```

**Key Action Logic — `purchaseAircraft`:**
1. Validate player has sufficient cash for down payment + first month's operating costs.
2. Deduct funds based on purchase config.
3. If loan selected: create AircraftLoan record and add to finance tracker.
4. Create new Aircraft instance linked to the fleet.
5. Remove listing from marketplace (or mark as purchased).
6. Return success/failure with message for UI feedback.

---

### Step 5 — Liquid Glass UI Foundation (`src/styles/liquid-glass.css`)

**Design Language:**
- Frosted glass panels: `backdrop-filter: blur(24px) saturate(180%)` + semi-transparent backgrounds
- Soft gradient underlays with subtle color shifts (deep navy → midnight purple tones matching airline aesthetic)
- Floating cards with depth shadows and gentle hover lift animations
- Rounded corners (xl–2xl radius), thin translucent borders

**Utility Classes:**
```css
/* Base glass panel */
.glass-panel {
  background: rgba(15, 23, 42, 0.6);           /* Slate-900 with transparency */
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(148, 163, 255, 0.12); /* Soft indigo-tinted edge */
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

/* Floating aircraft card */
.aircraft-card-glass {
  background: linear-gradient(
    160deg, 
    rgba(30, 41, 80, 0.7) 0%,   /* Deep blue tint top-left */
    rgba(15, 23, 42, 0.85) 100% /* Darker bottom-right */
  );
  backdrop-filter: blur(20px);
  border-radius: 1rem;
  border: 1px solid rgba(99, 102, 241, 0.15);
  box-shadow: 
    0 10px 40px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.aircraft-card-glass:hover {
  transform: translateY(-4px) scale(1.01);
  border-color: rgba(99, 102, 241, 0.35);
  box-shadow: 
    0 20px 60px rgba(79, 70, 229, 0.2),      /* Indigo glow */
    0 8px 32px rgba(0, 0, 0, 0.4);
}

/* Tab pills with glass effect */
.glass-tab {
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(148, 163, 255, 0.1);
  padding: 0.75rem 1.75rem;
  border-radius: 9999px;
  transition: all 0.2s ease;
}

.glass-tab.active {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(79, 70, 229, 0.5));
  border-color: rgba(99, 102, 241, 0.6);
  box-shadow: 
    0 0 20px rgba(99, 102, 241, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* Condition badge colors */
.condition-excellent { background: linear-gradient(135deg, #22c55e, #16a34a); }
.condition-very-good { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
.condition-good      { background: linear-gradient(135deg, #f97316, #ea580c); }
.condition-fair      { background: linear-gradient(135deg, #eab308, #ca8a04); }
.condition-poor      { background: linear-gradient(135deg, #ef4444, #dc2626); }

/* Modal backdrop */
.glass-modal-backdrop {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
}

/* Financing slider styling */
.financing-slider::-webkit-slider-thumb {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
}
```

**Integration:** Import into `src/main.tsx` or main layout file. Tailwind can be configured with custom blur utilities in `tailwind.config.js` if preferred.

---

### Step 6 — UI Components

#### FleetMarketplace.tsx (Main Page)
- Header: "Fleet Marketplace" + subtitle
- Tab bar: [Buy New] | [Used Fleet] 
- Layout: Sidebar filters (collapsible on mobile) + grid area
- Background: animated gradient or subtle parallax aircraft silhouette pattern
- Used market info banner: "New listings available weekly — check back often!"

#### FilterSidebar.tsx
- **Shared Filters:**
  - Category checkboxes (Narrowbody, Widebody, Regional, Turboprop)
  - Manufacturer multi-select dropdown
  - Price range dual slider ($0–$450M+)
  - Min seats input
  - Min range input

- **Used-Only Filters** (appear when "Used" tab active):
  - Condition grade checkboxes (Excellent → Poor with color badges)
  - Year built range slider (1960–current)
  - Max flight hours input
  - Sort by: Price ↓, Year Built ↓, Condition ↑, Flight Hours ↑

- Clear all filters button

#### AircraftCard.tsx
- Glass panel card layout
- Top section: aircraft image placeholder + manufacturer badge
- Middle: Model name (bold), short subtitle (e.g., "Narrowbody • 189 seats")
- Key specs row: Range | Seats | MSRP or Used Price
- Condition badge (used only) with gradient color coding
- Subtle hover animation + click → opens detail modal

#### AircraftDetailModal.tsx
- Full glass panel modal with backdrop blur
- Left column: Large aircraft image area, condition grade display (if used), key stats cards
- Right column: 
  - Full specifications table
  - Price prominently displayed
  - If used: history section (year built, flight hours, cycles)
  - "Purchase" button → opens PurchaseDialog
  
- Close on backdrop click or Escape key

#### PurchaseDialog.tsx
- **Cash option:** Simple confirmation — shows total price, checks balance.
- **Loan option with interactive slider:**
  - Down payment slider: 10%–80%, default 20%
  - Loan term dropdown: 36 / 48 / 60 / 72 / 96 months
  - Live-updating summary panel:
    ```
    Aircraft Price:      $125,500,000
    Down Payment (20%):  -$25,100,000
    Loan Amount:         $100,400,000
    Interest Rate:       5.75% APR*
    Monthly Payment:     $1,632,891
    Total Interest Paid: $48,400,000
    
    *Rate based on airline credit rating and current market conditions
    ```
- Final confirmation button with clear cost summary

---

### Step 7 — Route Integration (`src/App.tsx`)

Add route entry:
```typescript
{
  path: "/fleet/marketplace",
  element: <FleetMarketplace />
}
```

Update existing fleet page navigation to include a prominent "Visit Marketplace" button that routes here. This keeps the player's owned fleet view separate from purchasing options.

---

### Step 8 — Used Market Timer Integration

Hook into your existing game time engine (appears to be in `src/hooks/` or similar):

- On weekly game-time tick → call `refreshUsedMarketplace()` action
- This generates new listings, marks expired ones as "SOLD", and removes them after a cooldown period
- Optionally display a toast notification: "3 new aircraft available on the used market!"

---

## Phase 2 Roadmap (Accessory System — Foundation Wired Now)

**Trigger:** After fleet marketplace core is complete.

**Planned Features:**
1. Accessory catalog (`src/data/accessories.ts`) with entries like:
   - Starlink Connectivity ($350K install + $4K/month subscription)
   - Short Field Performance Packages (varies by airframe, $2M–$8M range)
   - Premium interior configurations
   - Avionics upgrades (new navigation systems, HUDs, etc.)

2. Accessory purchase flow integrated into aircraft detail view:
   - Available for both newly purchased and existing fleet planes
   - Filter by compatibility per airframe type

3. Gameplay effects of accessories:
   - Starlink → passenger satisfaction bonuses on long-haul routes
   - Short Field kits → unlock additional airports with shorter runways
   - Interior upgrades → increased ticket pricing power

4. Data model already supports this via `Aircraft.accessories` array and `Accessory` interface defined in Step 1.

---

## Risks & Considerations

| Risk | Mitigation |
|------|------------|
| Aircraft database is large (60+ entries) with real-world pricing to research | Use approximate MSRP values from public sources; create helper script for data entry validation |
| Liquid glass UI may have performance impact on low-end devices | Limit backdrop-filter usage to non-scrolling elements; test with DevTools throttling |
| Financing calculations need to feel realistic without being boringly complex | Pre-calculated APR table based on airline credit rating + loan term; avoid real-time bank rate simulation |
| Used market randomness could generate unrealistic deals or prices | Clamp price floors/ceilings per aircraft type; add sanity checks in generator logic |

---

## Estimated Implementation Effort

- Type definitions & interfaces: ~2 hours
- Aircraft database creation (60+ entries): ~4–5 hours (research-heavy)
- Market generator logic: ~3 hours
- Store slice + purchase flow integration: ~3 hours
- Liquid glass CSS utilities: ~1 hour
- UI components (page, filters, cards, modals): ~5–6 hours
- Route wiring + timer integration: ~1.5 hours

**Total Phase 1 estimate:** ~20–25 focused development hours

---

## Next Steps

When ready to implement:
1. Toggle to **ACT MODE** in the IDE interface
2. Implementation will proceed step-by-step following this plan
3. Each file creation/edit will be confirmed before moving forward

Plan saved and ready for cross-session reference.
