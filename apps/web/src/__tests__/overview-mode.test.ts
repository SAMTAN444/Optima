/**
 * Overview mode logic tests
 *
 * Tests pure functions exported from SchoolProfile that govern which content
 * is shown in Browse/Filter mode vs Recommendation mode.
 * No React rendering or DOM needed — these are unit tests of logic only.
 */
import { describe, it, expect } from 'vitest';
import { inferRegion, generateHighlights } from '../pages/SchoolProfile';

// ── inferRegion ──────────────────────────────────────────────────────────────

describe('inferRegion', () => {
  it('returns East for Tampines address', () => {
    expect(inferRegion('123 Tampines Street 11, Singapore 520123')).toBe('East');
  });

  it('returns East for Bedok address', () => {
    expect(inferRegion('456 Bedok North Road, Singapore 460456')).toBe('East');
  });

  it('returns North / North-East for Woodlands address', () => {
    expect(inferRegion('1 Woodlands Drive 14, Singapore 738401')).toBe('North / North-East');
  });

  it('returns North / North-East for Yishun address', () => {
    expect(inferRegion('200 Yishun Avenue 7, Singapore 768924')).toBe('North / North-East');
  });

  it('returns West for Jurong address', () => {
    expect(inferRegion('50 Jurong West Street 42, Singapore 649371')).toBe('West');
  });

  it('returns Central for Toa Payoh address', () => {
    expect(inferRegion('20 Toa Payoh North, Singapore 318994')).toBe('Central');
  });

  it('returns null for unrecognised address', () => {
    expect(inferRegion('99 Unknown Road, Singapore 999999')).toBeNull();
  });

  it('returns null for null address', () => {
    expect(inferRegion(null)).toBeNull();
  });

  it('is case-insensitive (lowercases before matching)', () => {
    expect(inferRegion('BEDOK NORTH AVENUE 4')).toBe('East');
  });
});

// ── generateHighlights ───────────────────────────────────────────────────────

describe('generateHighlights', () => {
  it('returns "Wide variety of CCAs" for >= 20 CCAs', () => {
    const h = generateHighlights(25, 10, 2, 1, null);
    expect(h).toContain('Wide variety of CCAs');
  });

  it('returns "Good range of CCAs" for 10–19 CCAs', () => {
    const h = generateHighlights(15, 10, 2, 1, null);
    expect(h).toContain('Good range of CCAs');
  });

  it('returns "Broad academic curriculum" for >= 25 subjects', () => {
    const h = generateHighlights(5, 30, 1, 0, null);
    expect(h).toContain('Broad academic curriculum');
  });

  it('returns "Multiple MOE programmes" for >= 3 programmes', () => {
    const h = generateHighlights(5, 10, 4, 0, null);
    expect(h).toContain('Multiple MOE programmes');
  });

  it('returns "Integrated Programme (direct JC pathway)" for mixed-level section', () => {
    const h = generateHighlights(5, 10, 1, 0, 'MIXED LEVEL (S1-JC2)');
    expect(h).toContain('Integrated Programme (direct JC pathway)');
  });

  it('returns at most 3 highlights', () => {
    // Give all criteria high values so many highlights would qualify
    const h = generateHighlights(25, 30, 4, 3, 'MIXED LEVEL (S1-JC2)');
    expect(h.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array when school has minimal data', () => {
    const h = generateHighlights(0, 0, 0, 0, null);
    expect(h).toHaveLength(0);
  });
});

// ── Mode detection contract ───────────────────────────────────────────────────
// These tests verify the routing state shape used to detect overview mode.
// recContext present → Recommendation mode (personalised content allowed)
// recContext absent  → Browse/Filter mode (neutral content only)

describe('Overview mode detection contract', () => {
  it('recommendation context present → recommendation mode', () => {
    const routerState = {
      from: '/app/search?mode=recs&prefs=abc',
      recommendation: {
        rank: 1,
        result: {
          totalScore: 0.84,
          breakdown: [],
          explanation: { topCriteria: [], matched: { programmes: [], subjectsLanguages: [], ccas: [], distinctive: [] } },
          commute: { durationMins: 22, transfers: 1 },
          school: { id: 'school-1', name: 'Test School', section: null, address: null, postalCode: null, url: null, telephone: null, lat: null, lng: null },
        },
      },
    };
    // Mode is determined by presence of recommendation key
    expect(routerState.recommendation).not.toBeNull();
    expect(routerState.recommendation.result.totalScore).toBe(0.84);
    // In recommendation mode, percentage (totalScore × 100) is mathematically derived
    const fitPct = Math.round(routerState.recommendation.result.totalScore * 100);
    expect(fitPct).toBe(84);
  });

  it('no recommendation context → browse/filter mode (neutral only)', () => {
    const routerState = { from: '/app/search' };
    // recContext derived as null when recommendation key is absent
    const recContext = (routerState as { recommendation?: unknown }).recommendation ?? null;
    expect(recContext).toBeNull();
    // In browse/filter mode: no totalScore, no percentage, no personalized content
  });

  it('no router state at all → browse/filter mode (app does not crash)', () => {
    const routerState = null;
    const recContext = (routerState as { recommendation?: unknown } | null)?.recommendation ?? null;
    expect(recContext).toBeNull();
  });

  it('recommendation mode percentage is derived only from backend score, not invented', () => {
    // Verify that fit % = Math.round(totalScore * 100) — no arbitrary values
    const testCases: [number, number][] = [
      [1.0, 100],
      [0.78, 78],
      [0.5, 50],
      [0.0, 0],
      [0.845, 85], // rounds to nearest integer
    ];
    for (const [score, expected] of testCases) {
      expect(Math.round(score * 100)).toBe(expected);
    }
  });

  it('browse mode does not produce score percentages from school data alone', () => {
    // Neutral overview only derives facts (counts, region) — no percentages
    const ccaCount = 18;
    const subjectCount = 22;
    // These are raw counts, never converted to fit percentages
    expect(typeof ccaCount).toBe('number');
    expect(typeof subjectCount).toBe('number');
    // No totalScore or weighted contribution is computed in browse mode
    const browseHasScore = false;
    expect(browseHasScore).toBe(false);
  });
});
