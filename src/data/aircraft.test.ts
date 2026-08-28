import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE, gameIdForMarketplaceType } from './aircraft';
import { AIRCRAFT_TYPES } from './aircraft-types';

describe('aircraft database coverage', () => {
  it('resolves every marketplace type to an existing database entry', () => {
    for (const t of Object.values(AIRCRAFT_TYPES)) {
      const gameId = gameIdForMarketplaceType(t.id);
      expect(gameId, `no game id for ${t.id}`).not.toBeNull();
      const entry = AIRCRAFT_DATABASE.find((a) => a.id === gameId);
      expect(entry, `missing database entry for ${gameId}`).toBeDefined();
    }
  });

  it('keeps the purchased aircraft identity (a used A318 stays an A318)', () => {
    const gameId = gameIdForMarketplaceType('airbus-a318');
    expect(gameId).toBe('airbus-a318');
    const entry = AIRCRAFT_DATABASE.find((a) => a.id === gameId);
    expect(entry?.name.toLowerCase()).toContain('a318');
    expect(gameId).not.toBe('a320neo');
  });

  it('keeps legacy ids for same-airframe aliases', () => {
    expect(gameIdForMarketplaceType('airbus-a320neo')).toBe('a320neo');
    expect(gameIdForMarketplaceType('airbus-a380-800')).toBe('a380');
    expect(gameIdForMarketplaceType('boeing-787-9')).toBe('b787-9');
  });

  it('returns null for unknown types', () => {
    expect(gameIdForMarketplaceType('does-not-exist')).toBeNull();
  });

  it('has no duplicate database ids', () => {
    const ids = AIRCRAFT_DATABASE.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});