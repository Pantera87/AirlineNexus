// ============================================================
// Airline business models — per-model economics & metadata
// ------------------------------------------------------------
// A business model shapes HOW an airline makes money:
//   - fareMultiplier        base fare vs. the distance heuristic (1.0 = recommended)
//   - onboardRevenuePerPax  in-flight ancillary revenue per passenger segment
//   - loadFactorModifier    tilt of the demand-based load-factor ceiling
//   - hourlyCostModifier    multiplier on crew/cabin operating costs
//
// The "recommended" price for a route is the distance heuristic scaled by the
// model's fareMultiplier. The load-factor elasticity in routeEngine.priceLoadFactor
// is built so that ratio 1.0 (recommended) is the revenue-maximizing price:
// cheaper prices raise load factor (slope 0.5), pricier ones decay it as
// ratio^-2 — so the recommended price is the structural profit sweet spot.
//
// Every number here is data, not gameplay code: tune a model by editing its
// record entry below.
// ============================================================

import type { BusinessModel } from '@/types/game';

export interface BusinessModelConfig {
  id: BusinessModel;
  label: string;
  description: string;
  /** One-line strategy blurb shown in the UI (what the model is actually good at). */
  strategy: string;
  /** True while the model is a "coming soon" placeholder (no dedicated mechanics yet). */
  comingSoon: boolean;
  /** Base fare as a multiple of the distance heuristic (1.0 = recommended fare). */
  fareMultiplier: number;
  /** In-flight ancillary revenue (USD) earned per passenger per flight segment. */
  onboardRevenuePerPax: number;
  /** Multiplier on the demand-based load-factor ceiling (model's price appeal). */
  loadFactorModifier: number;
  /** Multiplier on hourly crew/cabin operating costs. */
  hourlyCostModifier: number;
}

export const BUSINESS_MODEL_CONFIGS: Record<BusinessModel, BusinessModelConfig> = {
  'low-cost': {
    id: 'low-cost',
    label: 'Low-Cost Carrier',
    description: 'Affordable fares, high volume, no frills.',
    strategy: 'Volume strategy — cheaper tickets fill seats, ancillary in-flight sales carry the profit.',
    comingSoon: false,
    fareMultiplier: 0.65,
    onboardRevenuePerPax: 18,
    loadFactorModifier: 1.1,
    hourlyCostModifier: 0.8,
  },
  'full-service': {
    id: 'full-service',
    label: 'Full-Service Carrier',
    description: 'Premium service with included amenities.',
    strategy: 'Balanced model — market-rate fares, comfortable margins, modest in-flight sales.',
    comingSoon: false,
    fareMultiplier: 1.0,
    onboardRevenuePerPax: 6,
    loadFactorModifier: 1.0,
    hourlyCostModifier: 1.0,
  },
  luxury: {
    id: 'luxury',
    label: 'Luxury Airline',
    description: 'Top-tier luxury and exclusive service.',
    strategy: 'Sell the experience — premium fares and in-flight service for travelers who pay up.',
    comingSoon: false,
    fareMultiplier: 1.5,
    onboardRevenuePerPax: 25,
    loadFactorModifier: 0.9,
    hourlyCostModifier: 1.3,
  },
  cargo: {
    id: 'cargo',
    label: 'Cargo Airline',
    description: 'Focus on freight and logistics.',
    strategy: 'Coming soon — cargo operations are not yet in the game; runs like a full-service carrier for now.',
    comingSoon: true,
    fareMultiplier: 1.0,
    onboardRevenuePerPax: 6,
    loadFactorModifier: 1.0,
    hourlyCostModifier: 1.0,
  },
  hybrid: {
    id: 'hybrid',
    label: 'Hybrid Model',
    description: 'A mix of low-cost and full-service.',
    strategy: 'Best of both — slightly discounted fares with strong in-flight sales to close the gap.',
    comingSoon: false,
    fareMultiplier: 0.85,
    onboardRevenuePerPax: 14,
    loadFactorModifier: 1.05,
    hourlyCostModifier: 0.95,
  },
};

/**
 * Resolve the config for a business model. Unknown/absent models (e.g. old saves)
 * fall back to full-service, which is also the neutral economic baseline.
 */
export function getBusinessModelConfig(model?: BusinessModel | null): BusinessModelConfig {
  if (model && BUSINESS_MODEL_CONFIGS[model]) return BUSINESS_MODEL_CONFIGS[model];
  return BUSINESS_MODEL_CONFIGS['full-service'];
}