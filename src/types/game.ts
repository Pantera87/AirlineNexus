// ============================================================
// Core Game Types for Airline Management Simulator
// ============================================================

// --- Aircraft Types ---

export type AircraftCategory = 'regional' | 'narrow-body' | 'wide-body' | 'cargo' | 'turboprop' | 'business-jet';

export interface AircraftType {
  id: string;
  name: string;
  manufacturer: string;
  category: AircraftCategory;
  
  // Range/speed (legacy fields kept for compatibility)
  range: number; // nautical miles
  cruiseSpeed: number; // knots
  
  // Marketplace fields (Plan-aligned)
  msrpUsd: number; // current MSRP/list price in USD
  firstDeliveryYear: number; // year first delivered to customers
  
  maxPassengers: number;
  fuelBurnPerHour: number; // kg/hour
  
  // Costs (both kept for compatibility)
  acquisitionCost: number; // USD (legacy, = msrpUsd typically)
  weeklyMaintenanceCost: number; // USD (legacy)
  monthlyMaintenanceUsd: number; // USD (plan-aligned)
  
  weeklyLeaseCost?: number; // USD (optional, for leasing)
  era: number; // year introduced (legacy alias of firstDeliveryYear)
  imageKey: string;
  
  inProduction: boolean; // true if currently manufactured (Buy New tab eligibility)
  productionEndYear?: number; // when production ended (for legacy aircraft)
  
  insuranceMultiplier: number; // base multiplier for insurance premium calculation
  compatibleAccessories: string[]; // accessory IDs that can be added
  
  specs: {
    length: number; // meters
    wingspan: number; // meters
    maxTakeoffWeight: number; // kg
    engines: number;
    fuelCapacity: number; // kg
  };
}

export interface Aircraft {
  id: string;
  typeId: string;
  registration: string;
  age: number; // years
  condition: number; // 0-100
  manufactureYear?: number; // actual year this unit was built (for used aircraft)
  status: AircraftStatus;
  currentLocation: string | null; // airport code
  assignedRoute: string | null; // route id
  totalFlightHours: number;
  lastMaintenance: Date;
  nextMaintenance: Date;
  liveries: Livery[];
  currentLiveryIndex: number;
}

export type AircraftStatus = 
  | 'available'
  | 'in-flight'
  | 'maintenance'
  | 'parked'
  | 'storage';

// --- Marketplace Types ---

export enum ConditionGrade {
  Excellent = 'Excellent',    // Like-new, <5k hours since last major overhaul
  VeryGood = 'Very Good',     // Minor wear, well-maintained
  Good = 'Good',              // Average condition, some cosmetic wear
  Fair = 'Fair',              // Needs refurbishment, higher maintenance costs
  Poor = 'Poor'               // Major overhaul required immediately
}

export enum PurchaseType {
  Cash = 'Cash',
  Loan = 'Loan'
}

export interface Accessory {
  id: string;
  name: string;                    // e.g., "Starlink Connectivity", "Short Field Performance Package"
  type: string;                    // "connectivity", "performance", "interior", "avionics", etc.
  price: number;                   // One-time cost in USD
  monthlyCost?: number;            // Optional recurring cost (e.g., Starlink subscription)
  description: string;
}

export interface AircraftListing {
  id: string;                      // Unique marketplace listing ID
  aircraftTypeId: string;          // Links to AIRCRAFT_DATABASE entry
  isNew: boolean;                  // true = Buy New tab, false = Used Fleet tab

  // Price & Financing
  price: number;                   // Display price (MSRP for new, calculated for used)

  // Condition (used only)
  condition?: ConditionGrade;      // Not applicable for new aircraft
  manufactureYear?: number;        // Actual year this unit was built
  totalFlightHours?: number;       // Accumulated hours since first flight

  // Accessories (Phase 2 ready)
  includedAccessories: Accessory[];

  // Marketplace metadata
  sellerName?: string;             // For used: airline name or "Aircraft Broker"
  listingDate?: Date;              // When this appeared on the market
  expiresAt?: Date | null;         // null = permanent (new), date = used listing expiry

  // Purchase state
  purchased: boolean;              // Prevents double-buying active listings
}

export type GameDate = Date;

export interface AircraftPurchase {
  type: PurchaseType;
  totalPriceUsd: number;
  
  // If Loan selected:
  downPaymentPercent?: number;     // e.g., 20% = player pays 20% cash upfront
  loanTermMonths?: number;         // Options: 36, 48, 60, 72, 96 months
  interestRatePercent?: number;    // Calculated based on airline credit/rating + market rates
}

export interface AircraftLoan extends Loan {
  aircraftId: string;              // Links to purchased Aircraft record
}

// --- Livery Types ---

export interface Livery {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  tailDesign: string;
}

// --- Airport Types ---

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  continent: string;
  latitude: number;
  longitude: number;
  timezone: string;
  size: AirportSize;
  runways: number;
  terminals: number;
  landingFee: number; // per landing
  slotRestrictions: boolean;
  popularity: number; // 0-100
}

export type AirportSize = 'small' | 'medium' | 'large' | 'hub';

// --- Route Types ---

export interface Route {
  id: string;
  origin: string; // airport IATA
  destination: string; // airport IATA
  isActive: boolean;
  frequency: number; // flights per week
  aircraftId: string;
  schedule: FlightSchedule[];
  avgLoadFactor: number; // 0-1
  revenue: number; // weekly
  cost: number; // weekly
  profitability: number; // profit margin
}

export interface FlightSchedule {
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  departureTime: string; // HH:MM
  arrivalTime: string; // HH:MM
  flightNumber: string;
}

// --- Airline Types ---

export interface Airline {
  id: string;
  name: string;
  iataCode: string;
  icaoCode: string;
  headquarters: string; // airport IATA
  founded: Date;
  businessModel: BusinessModel;
  reputation: number; // 0-100
  rating: number; // 1-5 stars
  alliance: string | null;
  fleet: Aircraft[];
  routes: Route[];
  staff: StaffMember[];
  finances: Finances;
  loyaltyProgram: LoyaltyProgram;
  achievements: Achievement[];
}

export type BusinessModel = 'low-cost' | 'full-service' | 'luxury' | 'cargo' | 'hybrid';

// --- Finance Types ---

export interface Finances {
  cash: number;
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  assets: number;
  liabilities: number;
  netWorth: number;
  monthlyReports: MonthlyReport[];
  loans: Loan[];
  investments: Investment[];
}

export interface MonthlyReport {
  month: Date;
  revenue: number;
  expenses: number;
  profit: number;
  passengerCount: number;
  loadFactor: number;
  onTimePerformance: number;
}

export interface Loan {
  id: string;
  amount: number;
  interestRate: number; // annual percentage
  monthlyPayment: number;
  remainingBalance: number;
  startDate: Date;
  endDate: Date;
}

export interface Investment {
  id: string;
  type: 'stock' | 'bond' | 'real-estate' | 'infrastructure';
  name: string;
  value: number;
  initialValue: number;
  dateAcquired: Date;
}

// --- Staff Types ---

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  experience: number; // years
  salary: number; // monthly
  performance: number; // 0-100
  assignedAircraft: string | null;
  assignedRoute: string | null;
  startDate: Date;
}

export type StaffRole = 
  | 'captain'
  | 'first-officer'
  | 'cabin-crew'
  | 'mechanic'
  | 'ground-staff'
  | 'dispatcher'
  | 'manager';

// --- Loyalty Program Types ---

export interface LoyaltyProgram {
  name: string;
  isActive: boolean;
  members: number;
  tiers: LoyaltyTier[];
  partnerAirlines: string[];
}

export interface LoyaltyTier {
  name: string;
  minMiles: number;
  benefits: string[];
  multiplier: number;
}

// --- Achievement Types ---

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedDate: Date | null;
}

// --- Event Types ---

export interface GameEvent {
  id: string;
  type: EventType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  date: Date;
  isResolved: boolean;
  impact: EventImpact;
}

export type EventType = 
  | 'weather'
  | 'strike'
  | 'mechanical'
  | 'regulatory'
  | 'market'
  | 'natural-disaster'
  | 'pandemic'
  | 'fuel-crisis'
  | 'competition'
  | 'opportunity';

export interface EventImpact {
  financial: number; // monetary impact
  reputation: number; // reputation impact
  duration: number; // days
}

// --- Game State Types ---

export interface GameState {
  airline: Airline | null;
  currentDate: Date;
  gameSpeed: GameSpeed;
  isPaused: boolean;
  difficulty: Difficulty;
  world: WorldState;
  notifications: Notification[];
  settings: GameSettings;
}

export type GameSpeed = 'paused' | 'normal' | 'fast' | 'fastest';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'realistic';

export interface WorldState {
  fuelPrice: number; // per kg
  economicIndex: number; // 0-100
  travelDemand: number; // 0-100
  competitorAirlines: CompetitorAirline[];
  activeEvents: GameEvent[];
  regulations: Regulation[];
}

export interface CompetitorAirline {
  id: string;
  name: string;
  iataCode: string;
  marketShare: number;
  reputation: number;
  fleetSize: number;
  routes: number;
}

export interface Regulation {
  id: string;
  name: string;
  description: string;
  effectiveDate: Date;
  impact: string;
}

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
}

export interface GameSettings {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  musicEnabled: boolean;
  showTooltips: boolean;
  currencyFormat: 'USD' | 'EUR' | 'GBP';
  dateFormat: 'US' | 'EU';
}

// --- UI/Navigation Types ---

export type Screen = 
  | 'welcome'
  | 'airline-setup'
  | 'dashboard'
  | 'fleet'
  | 'routes'
  | 'finances'
  | 'staff'
  | 'operations'
  | 'alliances'
  | 'events'
  | 'world'
  | 'settings';

export interface MenuItem {
  id: Screen;
  label: string;
  icon: string;
  badge?: number;
}
