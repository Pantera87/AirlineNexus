import { describe, it, expect } from 'vitest';
import type { Airport, BusinessModel } from '@/types/game';
import { AIRPORT_DATABASE } from '@/data/airports';
import { AIRCRAFT_DATABASE } from '@/data/aircraft';
import { BUSINESS_MODEL_CONFIGS, getBusinessModelConfig } from './businessModels';
import {
  checkLoopRange,
  calculateRouteDistanceNm,
  DEFAULT_FUEL_PRICE_PER_KG,
  estimateTicketPrice,
  priceLoadFactor,
  previewLoopEconomics,
  previewRouteEconomics,
} from './routeEngine';

// --- Deterministic fixtures derived from the game data ------------------------
const HUB = AIRPORT_DATABASE[0];

function pickFixturePair(): { typeId: string; dest: Airport } {
  for (const t of AIRCRAFT_DATABASE) {
    if (!t.range || t.range <= 0) continue;
    const dest = AIRPORT_DATABASE.find(
      (a) => a.iata !== HUB.iata && checkLoopRange(t, [HUB, a]).feasible
    );
    if (dest) return { typeId: t.id, dest };
  }
  throw new Error('No feasible aircraft/airport fixture pair found');
}

const FIX = pickFixturePair();
const TYPE = AIRCRAFT_DATABASE.find((t) => t.id === FIX.typeId)!;
const DIST = calculateRouteDistanceNm(HUB, FIX.dest);

describe('businessModels — config table', () => {
  it('has a config for every model with sensible economics', () => {
    for (const id of ['low-cost', 'full-service', 'luxury', 'cargo', 'hybrid'] as const) {
      const cfg = BUSINESS_MODEL_CONFIGS[id];
      expect(cfg.id).toBe(id);
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.fareMultiplier).toBeGreaterThan(0);
      expect(cfg.onboardRevenuePerPax).toBeGreaterThanOrEqual(0);
      expect(cfg.loadFactorModifier).toBeGreaterThan(0);
      expect(cfg.hourlyCostModifier).toBeGreaterThan(0);
    }
    expect(BUSINESS_MODEL_CONFIGS.cargo.comingSoon).toBe(true);
    // full-service is the neutral economic baseline
    expect(BUSINESS_MODEL_CONFIGS['full-service'].fareMultiplier).toBe(1);
    expect(BUSINESS_MODEL_CONFIGS['full-service'].loadFactorModifier).toBe(1);
    expect(BUSINESS_MODEL_CONFIGS['full-service'].hourlyCostModifier).toBe(1);
  });

  it('falls back to full-service for unknown/absent models (old saves)', () => {
    expect(getBusinessModelConfig(undefined)).toBe(BUSINESS_MODEL_CONFIGS['full-service']);
    expect(getBusinessModelConfig(null)).toBe(BUSINESS_MODEL_CONFIGS['full-service']);
    expect(getBusinessModelConfig('no-such-model' as never)).toBe(BUSINESS_MODEL_CONFIGS['full-service']);
    expect(getBusinessModelConfig('luxury')).toBe(BUSINESS_MODEL_CONFIGS.luxury);
  });
});

describe('estimateTicketPrice — business model scaling', () => {
  it('matches the plain distance heuristic without a model (full-service baseline)', () => {
    // 1000 nm < 1500 → short-haul rate 0.22/nm + $40 surcharge
    expect(estimateTicketPrice(1000)).toBe(260);
    expect(estimateTicketPrice(1000, 'full-service')).toBe(260);
    expect(estimateTicketPrice(1000, undefined)).toBe(260);
    // 5000 nm ≥ 1500 → 0.16/nm, and > 4000 → +$90 intercontinental premium
    expect(estimateTicketPrice(5000)).toBe(930);
  });

  it('scales by the model fare multiplier', () => {
    expect(estimateTicketPrice(1000, 'low-cost')).toBe(Math.round(260 * 0.65));
    expect(estimateTicketPrice(1000, 'luxury')).toBe(Math.round(260 * 1.5));
    expect(estimateTicketPrice(1000, 'hybrid')).toBe(Math.round(260 * 0.85));
    // low-cost always recommends a cheaper fare than luxury
    expect(estimateTicketPrice(3000, 'low-cost')).toBeLessThan(estimateTicketPrice(3000, 'luxury'));
  });
});

describe('priceLoadFactor — price elasticity', () => {
  it('leaves the load factor unchanged at the recommended price (ratio 1)', () => {
    expect(priceLoadFactor(0.6, 1)).toBeCloseTo(0.6);
  });

  it('raises the load factor for discounts with a slope of 0.5', () => {
    // at 50% of recommended: LF × (1 + 0.5 × 0.5) = × 1.25
    expect(priceLoadFactor(0.6, 0.5)).toBeCloseTo(0.75);
    expect(priceLoadFactor(0.6, 0.75)).toBeCloseTo(0.6 * 1.125);
  });

  it('decays the load factor quadratically above the recommended price', () => {
    expect(priceLoadFactor(0.6, 2)).toBeCloseTo(0.6 / 4);
    expect(priceLoadFactor(0.6, 3)).toBeCloseTo(0.6 / 9);
  });

  it('caps at ~97% and floors at 5%', () => {
    expect(priceLoadFactor(0.97, 0.5)).toBeCloseTo(0.97); // 0.97 × 1.25 would exceed the cap
    expect(priceLoadFactor(0.3, 3)).toBeCloseTo(0.05); // 0.3 / 9 = 0.033 → floored
  });

  it('guards against zero/negative ratios', () => {
    expect(priceLoadFactor(0.6, 0)).toBeCloseTo(priceLoadFactor(0.6, 0.05));
    expect(priceLoadFactor(0.6, -1)).toBeCloseTo(priceLoadFactor(0.6, 0.05));
  });

  it('makes the recommended price the revenue sweet spot (LF × price is maximized at ratio 1)', () => {
    const base = 0.6;
    const revenueAt = (r: number) => priceLoadFactor(base, r) * r;
    expect(revenueAt(1)).toBeGreaterThan(revenueAt(0.5));
    expect(revenueAt(1)).toBeGreaterThan(revenueAt(0.75));
    expect(revenueAt(1)).toBeGreaterThan(revenueAt(1.5));
    expect(revenueAt(1)).toBeGreaterThan(revenueAt(2));
  });
});

describe('previewRouteEconomics - model + fare multiplier', () => {
  const direct = (options: { model?: BusinessModel; fareMultiplier?: number } = {}) =>
    previewRouteEconomics(HUB, FIX.dest, TYPE, 7, DEFAULT_FUEL_PRICE_PER_KG, {
      weeksActive: 4,
      model: options.model,
      fareMultiplier: options.fareMultiplier,
    });

  it('prices tickets at the model-scaled recommended fare when the ratio is 1', () => {
    expect(direct({ model: 'full-service' }).ticketPrice).toBe(estimateTicketPrice(DIST, 'full-service'));
    expect(direct({ model: 'low-cost' }).ticketPrice).toBe(estimateTicketPrice(DIST, 'low-cost'));
    expect(direct({ model: 'luxury' }).ticketPrice).toBe(estimateTicketPrice(DIST, 'luxury'));
  });

  it('scales the ticket price with the player fare multiplier', () => {
    const rec = estimateTicketPrice(DIST, 'full-service');
    expect(direct({ fareMultiplier: 0.5 }).ticketPrice).toBe(Math.max(1, Math.round(rec * 0.5)));
    expect(direct({ fareMultiplier: 2 }).ticketPrice).toBe(Math.max(1, Math.round(rec * 2)));
  });

  it('applies load-factor elasticity: discount > recommended > premium', () => {
    const low = direct({ fareMultiplier: 0.5 }).estLoadFactor;
    const rec = direct().estLoadFactor;
    const high = direct({ fareMultiplier: 2 }).estLoadFactor;
    expect(low).toBeGreaterThan(rec);
    expect(rec).toBeGreaterThan(high);
  });

  it('maximizes weekly ticket revenue at the recommended price', () => {
    const at = (ratio: number) => {
      const p = direct({ fareMultiplier: ratio });
      return p.weeklyPassengers * p.ticketPrice;
    };
    expect(at(1)).toBeGreaterThan(at(0.5));
    expect(at(1)).toBeGreaterThan(at(2));
  });

  it('adds in-flight onboard revenue per the model and includes it in weeklyRevenue', () => {
    const full = direct({ model: 'full-service' });
    expect(full.weeklyOnboardRevenue).toBe(Math.round(full.weeklyPassengers * 6));
    expect(full.weeklyRevenue).toBe(full.weeklyPassengers * full.ticketPrice + full.weeklyOnboardRevenue);

    const lc = direct({ model: 'low-cost' });
    expect(lc.weeklyOnboardRevenue).toBe(Math.round(lc.weeklyPassengers * 18));
    // Low-cost: $18/pax ancillary vs $6, and the 1.1x load-factor modifier fills more seats.
    expect(lc.estLoadFactor).toBeGreaterThan(full.estLoadFactor);
  });

  it('applies the hourly cost modifier to operating costs (luxury crews cost more)', () => {
    const full = direct({ model: 'full-service' });
    const lux = direct({ model: 'luxury' });
    // Fuel + fees are identical; only the crew/cabin hourly cost differs (1.3x vs 1.0x).
    const crewDelta = Math.max(400, TYPE.maxPassengers * 3) * 0.3;
    const blockTimeHr = DIST / Math.max(TYPE.cruiseSpeed - 40, 120);
    expect(Math.abs(lux.weeklyCosts - full.weeklyCosts - crewDelta * blockTimeHr * 14)).toBeLessThanOrEqual(1);
  });
});

describe('previewLoopEconomics - model + fare multiplier', () => {
  const loop = (options: { model?: BusinessModel; fareMultiplier?: number } = {}) =>
    previewLoopEconomics([HUB, FIX.dest], TYPE, 7, DEFAULT_FUEL_PRICE_PER_KG, {
      weeksActive: 4,
      model: options.model,
      fareMultiplier: options.fareMultiplier,
    });

  it('matches the point-to-point preview for a direct (two-node) loop', () => {
    const l = loop();
    const d = previewRouteEconomics(HUB, FIX.dest, TYPE, 7, DEFAULT_FUEL_PRICE_PER_KG, {
      weeksActive: 4,
    });
    expect(l.estLoadFactor).toBeCloseTo(d.estLoadFactor);
    expect(l.weeklyPassengers).toBe(d.weeklyPassengers);
    // Blended loop fare tracks the direct price within rounding (one seat of pax noise).
    const fareTol = Math.ceil((d.ticketPrice * 0.5) / Math.max(1, d.weeklyPassengers)) + 1;
    expect(Math.abs(l.ticketPrice - d.ticketPrice)).toBeLessThanOrEqual(fareTol);
    expect(Math.abs(l.weeklyRevenue - d.weeklyRevenue)).toBeLessThanOrEqual(d.ticketPrice + 1);
    expect(l.weeklyCosts).toBe(d.weeklyCosts);
    expect(l.weeklyFuelCost).toBe(d.weeklyFuelCost);
  });

  it('applies model scaling, elasticity and onboard revenue per leg', () => {
    const low = loop({ fareMultiplier: 0.5 }).estLoadFactor;
    const rec = loop().estLoadFactor;
    const high = loop({ fareMultiplier: 2 }).estLoadFactor;
    expect(low).toBeGreaterThan(rec);
    expect(rec).toBeGreaterThan(high);

    const lux = loop({ model: 'luxury' });
    expect(lux.ticketPrice).toBeGreaterThan(loop().ticketPrice);
    expect(lux.weeklyOnboardRevenue).toBe(Math.round(lux.weeklyPassengers * 25));
    expect(lux.weeklyRevenue).toBeGreaterThan(0);
  });
});
