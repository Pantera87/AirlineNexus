// ============================================================
// Unit tests for staffEngine profile generation + backfill
// ------------------------------------------------------------
// Covers the decorative HR profile fields (age, bio, languages):
// generation on new hires and the lazy backfill for old saves
// (pure + idempotent).
// ============================================================

import { describe, it, expect } from 'vitest';
import type { StaffMember, StaffRole } from '@/types/game';
import {
  generateHiringCandidate,
  generateAge,
  generateBio,
  generateLanguages,
  generateStaffProfile,
  backfillMissingStaffProfiles,
} from './staffEngine';

const ALL_ROLES: StaffRole[] = ['captain', 'first-officer', 'purser', 'cabin-crew', 'engineer'];

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'staff-test',
    name: 'Test Person',
    gender: 'male',
    photo: null,
    role: 'captain',
    experience: 15,
    salary: 10000,
    performance: 70,
    assignedAircraft: null,
    assignedRoute: null,
    startDate: new Date(Date.UTC(2024, 0, 1)),
    morale: 70,
    flightHours: 6000,
    typeRating: null,
    reducedWageUntil: null,
    ...overrides,
  };
}

describe('profile generation', () => {
  it('every generated candidate carries age, bio and languages', () => {
    for (const role of ALL_ROLES) {
      for (let i = 0; i < 20; i++) {
        const c = generateHiringCandidate(role);
        expect(c.age).toBeGreaterThanOrEqual(20);
        expect(c.age).toBeLessThanOrEqual(67);
        expect(typeof c.bio).toBe('string');
        expect(c.bio!.length).toBeGreaterThan(10);
        expect(c.languages?.[0]).toBe('English');
        expect(c.languages?.length ?? 0).toBeGreaterThanOrEqual(2);
        expect(c.languages?.length ?? 0).toBeLessThanOrEqual(4);
      }
    }
  });

  it('languages are English plus 1–3 distinct pool languages', () => {
    for (let i = 0; i < 50; i++) {
      const langs = generateLanguages();
      expect(langs[0]).toBe('English');
      const others = langs.slice(1);
      expect(others.length).toBeGreaterThanOrEqual(1);
      expect(others.length).toBeLessThanOrEqual(3);
      expect(new Set(others).size).toBe(others.length); // no duplicates
      expect(others).not.toContain('English');
    }
  });

  it('age stays in [20, 67] and rises with career length', () => {
    for (let i = 0; i < 50; i++) {
      const young = generateAge('first-officer', 2);
      const veteran = generateAge('captain', 40);
      expect(young).toBeGreaterThanOrEqual(26);
      expect(young).toBeLessThanOrEqual(33);
      expect(veteran).toBeGreaterThanOrEqual(64);
      expect(veteran).toBeLessThanOrEqual(67);
    }
  });

  it('bio templates substitute all placeholders and mention the career numbers', () => {
    for (const role of ALL_ROLES) {
      const bio = generateBio(role, 7, 3500);
      expect(bio).not.toMatch(/\{exp\}|\{hours\}/);
      expect(bio.length).toBeGreaterThan(10);
      // Non-pilot templates are experience-driven and must show the years.
      if (role !== 'captain' && role !== 'first-officer') {
        expect(bio).toContain('7');
      }
    }
  });

  it('generateStaffProfile bundles all three fields', () => {
    const p = generateStaffProfile('purser', 5, 0);
    expect(p.age).toBeGreaterThan(0);
    expect(p.bio.length).toBeGreaterThan(10);
    expect(p.languages[0]).toBe('English');
  });
});

describe('backfillMissingStaffProfiles', () => {
  it('fills missing fields on legacy members and reports the change', () => {
    const legacy = [
      makeStaff({ id: 'a', role: 'cabin-crew', flightHours: 0, experience: 3 }),
      makeStaff({ id: 'b', role: 'engineer', flightHours: 0, experience: 10 }),
    ];
    const { staff, changed } = backfillMissingStaffProfiles(legacy);
    expect(changed).toBe(true);
    for (const m of staff) {
      expect(m.age).toBeGreaterThanOrEqual(20);
      expect(m.bio!.length).toBeGreaterThan(10);
      expect(m.languages![0]).toBe('English');
    }
    // Original objects untouched (pure).
    expect(legacy[0].age).toBeUndefined();
    expect(legacy[0].bio).toBeUndefined();
  });

  it('keeps partially populated fields instead of regenerating them', () => {
    const partial = [makeStaff({ age: 42, languages: ['English', 'German'] })];
    const { staff, changed } = backfillMissingStaffProfiles(partial);
    expect(changed).toBe(true); // bio missing
    expect(staff[0].age).toBe(42);
    expect(staff[0].languages).toEqual(['English', 'German']);
    expect(staff[0].bio!.length).toBeGreaterThan(10);
  });

  it('is idempotent — a second pass changes nothing', () => {
    const legacy = [makeStaff(), makeStaff({ id: 'b', role: 'engineer' })];
    const first = backfillMissingStaffProfiles(legacy);
    expect(first.changed).toBe(true);
    const second = backfillMissingStaffProfiles(first.staff);
    expect(second.changed).toBe(false);
    // Fully-populated members pass through by reference.
    expect(second.staff[0]).toBe(first.staff[0]);
    expect(second.staff[1]).toBe(first.staff[1]);
  });

  it('returns unchanged input when there is nothing to backfill', () => {
    const done = [
      makeStaff({ age: 35, bio: 'A seasoned captain.', languages: ['English', 'French'] }),
    ];
    const { staff, changed } = backfillMissingStaffProfiles(done);
    expect(changed).toBe(false);
    expect(staff).toEqual(done);
  });
});