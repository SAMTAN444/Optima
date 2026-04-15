import { describe, it, expect } from 'vitest';
import {
  computeRocWeights,
  commuteScore,
  setOverlapScore,
  passesMustHaves,
  rankSchools,
  detectBottleneck,
  SchoolForRanking,
  MustHaves,
  GoodToHaves,
} from '../ranking';
import { RecommendationRequestSchema } from '@optima/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeSchool(overrides: Partial<SchoolForRanking> = {}): SchoolForRanking {
  return {
    id: 'school-1',
    name: 'Test Secondary School',
    address: '1 Test Road',
    postalCode: '123456',
    lat: 1.3,
    lng: 103.8,
    ccas: ['Robotics', 'Badminton', 'Basketball'],
    programmes: ['Integrated Programme', 'Direct School Admission'],
    subjects: ['Higher Chinese', 'Literature'],
    distinctive: ['STEM::Robotics ALP', 'Arts::Dance ALP'],
    commute: { durationMins: 20, transfers: 1 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: ROC weights
// ---------------------------------------------------------------------------
describe('computeRocWeights', () => {
  it('returns empty array for k=0', () => {
    expect(computeRocWeights(0)).toEqual([]);
  });

  it('returns weight of 1 for k=1', () => {
    const w = computeRocWeights(1);
    expect(w).toHaveLength(1);
    expect(w[0]).toBeCloseTo(1, 10);
  });

  it('weights sum to 1 for k=3', () => {
    const w = computeRocWeights(3);
    expect(w).toHaveLength(3);
    const sum = w.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('weights are in descending order (rank 1 > rank 2 > ...)', () => {
    const w = computeRocWeights(4);
    for (let i = 0; i < w.length - 1; i++) {
      expect(w[i]).toBeGreaterThan(w[i + 1]);
    }
  });

  it('matches known values for k=2: w1 = 3/4, w2 = 1/4', () => {
    const w = computeRocWeights(2);
    // w1 = (1/2)*(1/1 + 1/2) = (1/2)*(3/2) = 3/4
    // w2 = (1/2)*(1/2) = 1/4
    expect(w[0]).toBeCloseTo(0.75, 10);
    expect(w[1]).toBeCloseTo(0.25, 10);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Commute scoring
// ---------------------------------------------------------------------------
describe('commuteScore', () => {
  it('returns 1 for minimum commute with no transfers', () => {
    // t=10, tMin=10, tMax=60 → sBase=1 → score=1
    expect(commuteScore(10, 0, 60)).toBeCloseTo(1, 5);
  });

  it('returns 0 for commute exceeding tMax', () => {
    expect(commuteScore(70, 0, 60)).toBe(0);
  });

  it('penalises transfers: each transfer subtracts 0.05', () => {
    const base = commuteScore(30, 0, 60);
    const withTransfer = commuteScore(30, 1, 60);
    expect(base - withTransfer).toBeCloseTo(0.05, 5);
  });

  it('score is clamped to [0, 1]', () => {
    expect(commuteScore(5, 0, 60)).toBeLessThanOrEqual(1);
    expect(commuteScore(5, 0, 60)).toBeGreaterThanOrEqual(0);
    expect(commuteScore(100, 10, 60)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Set overlap scoring
// ---------------------------------------------------------------------------
describe('setOverlapScore', () => {
  it('returns 0 when desired is empty', () => {
    expect(setOverlapScore([], ['Robotics', 'Badminton'])).toBe(0);
  });

  it('returns 1 when all desired items are present', () => {
    expect(setOverlapScore(['Robotics', 'Badminton'], ['Robotics', 'Badminton', 'Basketball'])).toBe(1);
  });

  it('returns partial score for partial match', () => {
    // 1 of 2 desired items found
    expect(setOverlapScore(['Robotics', 'Swimming'], ['Robotics', 'Badminton'])).toBe(0.5);
  });

  it('returns 0 when no desired items are in school', () => {
    expect(setOverlapScore(['Swimming'], ['Robotics', 'Badminton'])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Must-have filter (AND logic)
// ---------------------------------------------------------------------------
describe('passesMustHaves', () => {
  it('passes with no must-haves', () => {
    expect(passesMustHaves(makeSchool(), {})).toBe(true);
  });

  it('passes when school satisfies ALL required CCAs (AND)', () => {
    const school = makeSchool({ ccas: ['Robotics', 'Badminton', 'Basketball'] });
    expect(passesMustHaves(school, { requiredCCAs: ['Robotics', 'Badminton'] })).toBe(true);
  });

  it('fails when school is missing ONE required CCA (AND strictness)', () => {
    const school = makeSchool({ ccas: ['Robotics'] });
    expect(passesMustHaves(school, { requiredCCAs: ['Robotics', 'Badminton'] })).toBe(false);
  });

  it('fails commute must-have when commute exceeds limit', () => {
    const school = makeSchool({ commute: { durationMins: 50, transfers: 0 } });
    expect(passesMustHaves(school, { maxCommuteMins: 40 })).toBe(false);
  });

  it('passes commute must-have when commute is within limit', () => {
    const school = makeSchool({ commute: { durationMins: 30, transfers: 1 } });
    expect(passesMustHaves(school, { maxCommuteMins: 40 })).toBe(true);
  });

  it('fails when required programme is missing (AND)', () => {
    const school = makeSchool({ programmes: ['Integrated Programme'] });
    expect(
      passesMustHaves(school, { requiredProgrammes: ['Integrated Programme', 'STEM Programme'] })
    ).toBe(false);
  });

  it('passes school with null commute through (commute cannot be verified, not excluded)', () => {
    // Phase-7 spec: null-commute schools are passed through by passesMustHaves;
    // they receive a commute score of 0 at ranking time instead.
    const school = makeSchool({ commute: null });
    expect(passesMustHaves(school, { maxCommuteMins: 60 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Full ranking pipeline
// ---------------------------------------------------------------------------
describe('rankSchools', () => {
  const schools: SchoolForRanking[] = [
    makeSchool({
      id: 'A',
      name: 'School A',
      ccas: ['Robotics', 'Badminton'],
      commute: { durationMins: 15, transfers: 0 },
    }),
    makeSchool({
      id: 'B',
      name: 'School B',
      ccas: ['Basketball'],
      commute: { durationMins: 40, transfers: 2 },
    }),
    makeSchool({
      id: 'C',
      name: 'School C',
      ccas: ['Robotics', 'Badminton', 'Basketball'],
      commute: { durationMins: 20, transfers: 1 },
    }),
  ];

  const goodToHaves: GoodToHaves = {
    rankedCriteria: ['ccas', 'commute'],
    desiredCCAs: ['Robotics', 'Badminton'],
  };

  it('returns schools sorted descending by totalScore', () => {
    const ranked = rankSchools(schools, {}, goodToHaves);
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i].totalScore).toBeGreaterThanOrEqual(ranked[i + 1].totalScore);
    }
  });

  it('includes breakdown with correct number of criteria', () => {
    const ranked = rankSchools(schools, {}, goodToHaves);
    ranked.forEach((r) => {
      expect(r.breakdown).toHaveLength(2);
    });
  });

  it('weights in breakdown sum to 1', () => {
    const ranked = rankSchools(schools, {}, goodToHaves);
    ranked.forEach((r) => {
      const weightSum = r.breakdown.reduce((s, b) => s + b.weight, 0);
      expect(weightSum).toBeCloseTo(1, 10);
    });
  });

  it('School A ranks above School B (better CCA match + commute)', () => {
    const ranked = rankSchools(schools, {}, goodToHaves);
    const posA = ranked.findIndex((r) => r.school.id === 'A');
    const posB = ranked.findIndex((r) => r.school.id === 'B');
    expect(posA).toBeLessThan(posB);
  });

  it('explanation.topCriteria contains at most 2 entries', () => {
    const ranked = rankSchools(schools, {}, goodToHaves);
    ranked.forEach((r) => {
      expect(r.explanation.topCriteria.length).toBeLessThanOrEqual(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Test 6: Bottleneck detection (existing + new)
// ---------------------------------------------------------------------------
describe('detectBottleneck', () => {
  const schools: SchoolForRanking[] = [
    makeSchool({ id: '1', ccas: ['Robotics'] }),
    makeSchool({ id: '2', ccas: ['Badminton'] }),
    makeSchool({ id: '3', ccas: ['Robotics', 'Badminton'] }),
  ];

  it('returns noResults: true', () => {
    const result = detectBottleneck(schools, { requiredCCAs: ['Robotics', 'Swimming'] });
    expect(result.noResults).toBe(true);
  });

  it('returns at least one suggestion', () => {
    const result = detectBottleneck(schools, { requiredCCAs: ['Robotics', 'Swimming'] });
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('commute suggestion raises maxCommuteMins', () => {
    const result = detectBottleneck(schools, { maxCommuteMins: 20 });
    const commuteSuggestion = result.suggestions.find((s) => s.patch.maxCommuteMins != null);
    expect(commuteSuggestion).toBeDefined();
    expect(commuteSuggestion!.patch.maxCommuteMins!).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Must-have hard filtering — strict exclusion
// ---------------------------------------------------------------------------
describe('must-have hard filtering', () => {
  it('excludes a school that fails any single must-have', () => {
    const school = makeSchool({ ccas: ['Robotics'] });
    // School has Robotics but NOT Swimming → fails the AND constraint
    expect(passesMustHaves(school, { requiredCCAs: ['Robotics', 'Swimming'] })).toBe(false);
  });

  it('only schools passing ALL must-haves survive multi-constraint filtering', () => {
    const schools: SchoolForRanking[] = [
      makeSchool({ id: 'pass', ccas: ['Robotics', 'Badminton'], programmes: ['IB'] }),
      makeSchool({ id: 'fail-cca', ccas: ['Basketball'],         programmes: ['IB'] }),
      makeSchool({ id: 'fail-prog', ccas: ['Robotics', 'Badminton'], programmes: ['DSA'] }),
    ];
    const mh: MustHaves = { requiredCCAs: ['Robotics'], requiredProgrammes: ['IB'] };
    const passed = schools.filter((s) => passesMustHaves(s, mh));
    expect(passed).toHaveLength(1);
    expect(passed[0].id).toBe('pass');
  });

  it('excludes a school failing the commute must-have when commute is computed', () => {
    const slow = makeSchool({ commute: { durationMins: 50, transfers: 0 } });
    const fast = makeSchool({ commute: { durationMins: 25, transfers: 0 } });
    expect(passesMustHaves(slow, { maxCommuteMins: 30 })).toBe(false);
    expect(passesMustHaves(fast, { maxCommuteMins: 30 })).toBe(true);
  });

  it('handles 3 simultaneous must-haves correctly (AND logic)', () => {
    const mh: MustHaves = {
      requiredCCAs: ['Robotics'],
      requiredProgrammes: ['IB'],
      requiredSubjectsLanguages: ['Higher Chinese'],
    };
    const pass = makeSchool({
      ccas: ['Robotics'],
      programmes: ['IB'],
      subjects: ['Higher Chinese'],
      commute: { durationMins: 20, transfers: 0 },
    });
    const failSubject = makeSchool({
      ccas: ['Robotics'],
      programmes: ['IB'],
      subjects: ['Literature'],
      commute: { durationMins: 20, transfers: 0 },
    });
    expect(passesMustHaves(pass, mh)).toBe(true);
    expect(passesMustHaves(failSubject, mh)).toBe(false);
  });

  it('handles 4 simultaneous must-haves (maximum allowed)', () => {
    const mh: MustHaves = {
      maxCommuteMins: 40,
      requiredCCAs: ['Robotics'],
      requiredProgrammes: ['IB'],
      requiredSubjectsLanguages: ['Higher Chinese'],
    };
    const pass = makeSchool({
      ccas: ['Robotics'],
      programmes: ['IB'],
      subjects: ['Higher Chinese'],
      commute: { durationMins: 30, transfers: 0 },
    });
    const failCommute = makeSchool({
      ccas: ['Robotics'],
      programmes: ['IB'],
      subjects: ['Higher Chinese'],
      commute: { durationMins: 50, transfers: 0 },
    });
    expect(passesMustHaves(pass, mh)).toBe(true);
    expect(passesMustHaves(failCommute, mh)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 8: ROC weights computed only from good-to-have ranked criteria
// ---------------------------------------------------------------------------
describe('ROC weights — scoped to good-to-haves only', () => {
  it('k determined by rankedCriteria.length, not total criteria count', () => {
    const schools = [
      makeSchool({ id: 'A', ccas: ['Robotics'], commute: { durationMins: 15, transfers: 0 } }),
    ];
    // 2 ranked good-to-have criteria → 2 ROC weights summing to 1
    const gth2: GoodToHaves = { rankedCriteria: ['ccas', 'commute'], desiredCCAs: ['Robotics'] };
    const result2 = rankSchools(schools, {}, gth2);
    expect(result2[0].breakdown).toHaveLength(2);
    const sum2 = result2[0].breakdown.reduce((s, b) => s + b.weight, 0);
    expect(sum2).toBeCloseTo(1, 10);

    // 3 ranked good-to-have criteria → 3 ROC weights summing to 1
    const gth3: GoodToHaves = {
      rankedCriteria: ['ccas', 'commute', 'programmes'],
      desiredCCAs: ['Robotics'],
    };
    const result3 = rankSchools(schools, {}, gth3);
    expect(result3[0].breakdown).toHaveLength(3);
    const sum3 = result3[0].breakdown.reduce((s, b) => s + b.weight, 0);
    expect(sum3).toBeCloseTo(1, 10);
  });

  it('good-to-have weight at rank 1 > weight at rank 2 (ROC ordering)', () => {
    const schools = [makeSchool({ id: 'X' })];
    const gth: GoodToHaves = { rankedCriteria: ['ccas', 'commute'] };
    const [result] = rankSchools(schools, {}, gth);
    expect(result.breakdown[0].weight).toBeGreaterThan(result.breakdown[1].weight);
  });

  it('must-have constraints do not appear in the breakdown (no weight for must-haves)', () => {
    const schools = [
      makeSchool({ id: 'A', ccas: ['Robotics'], commute: { durationMins: 15, transfers: 0 } }),
    ];
    // maxCommuteMins is a must-have, NOT a ranked good-to-have here
    const mh: MustHaves = { maxCommuteMins: 30 };
    const gth: GoodToHaves = { rankedCriteria: ['ccas'], desiredCCAs: ['Robotics'] };
    const result = rankSchools(schools, mh, gth);
    // breakdown only contains the 1 good-to-have criterion (ccas)
    expect(result[0].breakdown).toHaveLength(1);
    expect(result[0].breakdown[0].criterion).toBe('ccas');
  });
});

// ---------------------------------------------------------------------------
// Test 9: Bottleneck detection — picks minimum count across ALL constraints
// ---------------------------------------------------------------------------
describe('detectBottleneck — minimum-count bottleneck selection', () => {
  // 10 schools: all have Badminton; only 2 have commute ≤ 20 mins
  const buildSchools = (): SchoolForRanking[] =>
    Array.from({ length: 10 }, (_, i) =>
      makeSchool({
        id: `s${i}`,
        ccas: ['Badminton'],
        commute: { durationMins: i < 2 ? 15 : 40, transfers: 0 },
      })
    );

  it('identifies commute as bottleneck when commuteCount < badminton count', () => {
    const schools = buildSchools();
    // commute ≤ 20 → 2 schools; Badminton → 10 schools → commute is bottleneck
    const result = detectBottleneck(schools, {
      maxCommuteMins: 20,
      requiredCCAs: ['Badminton'],
    });
    expect(result.noResults).toBe(true);
    expect(result.bottleneck.type).toBe('Commute');
  });

  it('commute bottleneck details includes the isolation count', () => {
    const schools = buildSchools();
    const result = detectBottleneck(schools, { maxCommuteMins: 20, requiredCCAs: ['Badminton'] });
    // 2 schools have commute ≤ 20 mins
    expect(result.bottleneck.details).toContain('2 school');
  });

  it('commute suggestion patches maxCommuteMins to a higher value', () => {
    const schools = buildSchools();
    const result = detectBottleneck(schools, { maxCommuteMins: 20, requiredCCAs: ['Badminton'] });
    const s = result.suggestions.find((s) => s.patch.maxCommuteMins != null);
    expect(s).toBeDefined();
    expect(s!.patch.maxCommuteMins!).toBeGreaterThan(20);
    expect(s!.newCount).toBeGreaterThanOrEqual(0);
  });

  it('identifies rare CCA as bottleneck when its count < commute count', () => {
    // 5 schools with fast commute; only 1 has the rare CCA
    const schools: SchoolForRanking[] = [
      makeSchool({ id: 'a', ccas: ['RARE_CCA'], commute: { durationMins: 10, transfers: 0 } }),
      ...Array.from({ length: 4 }, (_, i) =>
        makeSchool({ id: `x${i}`, ccas: ['Common'], commute: { durationMins: 15, transfers: 0 } })
      ),
    ];
    // commute ≤ 30 → 5 schools; RARE_CCA → 1 school → RARE_CCA is bottleneck
    const result = detectBottleneck(schools, {
      maxCommuteMins: 30,
      requiredCCAs: ['RARE_CCA'],
    });
    expect(result.bottleneck.type).toBe('CCAs');
  });

  it('scans good-to-have desired items and includes them in bottleneck analysis', () => {
    const schools = buildSchools();
    // Desired CCA that nobody has → 0 schools in good-to-have isolation count
    const goodToHaves: GoodToHaves = {
      rankedCriteria: ['ccas'],
      desiredCCAs: ['NONEXISTENT_CCA'],
    };
    const result = detectBottleneck(
      schools,
      { maxCommuteMins: 20, requiredCCAs: ['Badminton'] },
      goodToHaves
    );
    // Good-to-have with 0 match is the most restrictive in isolation
    expect(result.bottleneck.type).toBe('Desired CCAs');
    expect(result.bottleneck.details).toContain('0 school');
  });

  it('returns up to 3 suggestions when given 3–4 must-haves causing 0 results', () => {
    // School A meets ALL required items but just exceeds the tight commute limit.
    // Raising commute should surface it, so at least the commute suggestion yields > 0.
    const schools: SchoolForRanking[] = [
      makeSchool({ id: 'A', ccas: ['Robotics'], programmes: ['IB'], commute: { durationMins: 8, transfers: 0 } }),
      makeSchool({ id: 'B', ccas: ['Swimming'], programmes: ['IB'], commute: { durationMins: 8, transfers: 0 } }),
      makeSchool({ id: 'C', ccas: ['Basketball'], programmes: ['DSA'], commute: { durationMins: 8, transfers: 0 } }),
    ];
    const result = detectBottleneck(schools, {
      maxCommuteMins: 3,   // too tight — all schools have commute 8 > 3
      requiredCCAs: ['Robotics'],
      requiredProgrammes: ['IB'],
    });
    expect(result.noResults).toBe(true);
    // Commute suggestion (raise to 18 min) → school A passes all three → newCount ≥ 1
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
    result.suggestions.forEach((s) => {
      expect(s.patch).toBeDefined();
      expect(typeof s.newCount).toBe('number');
      expect(s.newCount).toBeGreaterThan(0); // only suggestions that actually help are shown
      expect(typeof s.label).toBe('string');
    });
  });
});

// ---------------------------------------------------------------------------
// Test 10: Relaxation suggestion correctness — full constraint set preserved
// ---------------------------------------------------------------------------
describe('detectBottleneck — suggestion counts use full constraint set', () => {
  // Schools: A and C have commute ≤ 20 AND Badminton; B has commute ≤ 20 but NO Badminton.
  const schools: SchoolForRanking[] = [
    makeSchool({ id: 'A', ccas: ['Badminton'], commute: { durationMins: 10, transfers: 0 } }),
    makeSchool({ id: 'B', ccas: [],            commute: { durationMins: 15, transfers: 0 } }),
    makeSchool({ id: 'C', ccas: ['Badminton'], commute: { durationMins: 40, transfers: 0 } }),
  ];

  it('commute suggestion newCount accounts for all must-haves, not just commute alone', () => {
    // 0 results: maxCommuteMins:5 eliminates everyone
    const result = detectBottleneck(schools, {
      maxCommuteMins: 5,
      requiredCCAs: ['Badminton'],
    });
    const s = result.suggestions.find((s) => s.patch.maxCommuteMins != null);
    expect(s).toBeDefined();
    // Raise commute to 20. School A (commute 10, has Badminton) → passes.
    // School B (commute 15, no Badminton) → fails requiredCCAs — must NOT be counted.
    // School C (commute 40, has Badminton) → fails commute.
    // Correct count = 1 (only A). Isolation-only count would be 2 (A and B).
    expect(s!.newCount).toBe(1);
  });

  it('set constraint suggestion preserves commute must-have in its count', () => {
    // Schools: A and B have commute ≤ 20; C does not. All have Badminton. None have NONEXISTENT.
    const schools2: SchoolForRanking[] = [
      makeSchool({ id: 'A', ccas: ['Badminton'], commute: { durationMins: 10, transfers: 0 } }),
      makeSchool({ id: 'B', ccas: ['Badminton'], commute: { durationMins: 15, transfers: 0 } }),
      makeSchool({ id: 'C', ccas: ['Badminton'], commute: { durationMins: 50, transfers: 0 } }),
    ];
    // 0 results: requiredCCAs includes NONEXISTENT which no school has
    const result = detectBottleneck(schools2, {
      maxCommuteMins: 20,
      requiredCCAs: ['Badminton', 'NONEXISTENT'],
    });
    const s = result.suggestions.find((s) => s.patch.requiredCCAs != null);
    expect(s).toBeDefined();
    // Removing NONEXISTENT from CCAs → requiredCCAs: ['Badminton'], maxCommuteMins: 20 preserved.
    // A (commute 10, Badminton) ✓, B (commute 15, Badminton) ✓, C (commute 50 > 20) ✗
    // Correct count = 2 (A and B). Ignoring commute (old bug) would give 3.
    expect(s!.newCount).toBe(2);
  });

  it('suggestions with zero post-relaxation improvement are not shown', () => {
    // commute:5 is impossible for all schools; removing RARE_CCA still leaves 0 results
    const result = detectBottleneck(schools, {
      maxCommuteMins: 5,
      requiredCCAs: ['Badminton', 'RARE_CCA'],
    });
    // The set constraint suggestion would give: requiredCCAs:['Badminton'], maxCommuteMins:5
    // → still 0 schools (commute ≤ 5 is impossible). Must not appear.
    result.suggestions.forEach((s) => {
      expect(s.newCount).toBeGreaterThan(0);
    });
  });

  it('suggestions are sorted by newCount descending (highest impact first)', () => {
    // Create a scenario where commute suggestion yields more results than set-constraint suggestion
    const manySchools: SchoolForRanking[] = [
      // 5 schools with Badminton and commute 10 — pass if commute raised and Badminton required
      ...Array.from({ length: 5 }, (_, i) =>
        makeSchool({ id: `b${i}`, ccas: ['Badminton'], commute: { durationMins: 10, transfers: 0 } })
      ),
      // 1 school with Swimming but slow commute
      makeSchool({ id: 'swim', ccas: ['Swimming'], commute: { durationMins: 30, transfers: 0 } }),
    ];
    // 0 results: commute:5 eliminates all
    const result = detectBottleneck(manySchools, {
      maxCommuteMins: 5,
      requiredCCAs: ['Badminton'],
    });
    if (result.suggestions.length >= 2) {
      expect(result.suggestions[0].newCount).toBeGreaterThanOrEqual(result.suggestions[1].newCount);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 11: Input validation (RecommendationRequestSchema)
// ---------------------------------------------------------------------------
describe('RecommendationRequestSchema validation', () => {
  // requiredCCAs is must-have; programmes is ranked — no overlap
  const validRequest = () => ({
    home: {},
    mustHaves: { requiredCCAs: ['Robotics'] },
    goodToHaves: { rankedCriteria: ['programmes'] },
  });

  it('accepts a valid request with 1 must-have and 1 non-overlapping ranked criterion', () => {
    const r = RecommendationRequestSchema.safeParse(validRequest());
    expect(r.success).toBe(true);
  });

  it('accepts when mustHaves is empty (0 must-haves is now valid — rank all schools)', () => {
    // Schema no longer requires ≥1 must-have. Quick filters and "rank all" use cases
    // send empty mustHaves and rely purely on good-to-have scoring.
    const r = RecommendationRequestSchema.safeParse({
      ...validRequest(),
      mustHaves: {},
    });
    expect(r.success).toBe(true);
  });

  it('accepts empty rankedCriteria (0 good-to-haves — must-haves only mode)', () => {
    // A1 fix: rankedCriteria is now optional (can be empty).
    // The engine falls back to commute-ASC / name-ASC ordering when k=0.
    const r = RecommendationRequestSchema.safeParse({
      ...validRequest(),
      goodToHaves: { rankedCriteria: [] },
    });
    expect(r.success).toBe(true);
  });

  it('rejects when more than 4 must-have categories are specified', () => {
    const r = RecommendationRequestSchema.safeParse({
      ...validRequest(),
      mustHaves: {
        maxCommuteMins: 30,
        requiredProgrammes: ['IB'],
        requiredSubjectsLanguages: ['Higher Chinese'],
        requiredCCAs: ['Robotics'],
        requiredDistinctive: ['STEM::ALP'],  // 5th category → over limit
      },
    });
    expect(r.success).toBe(false);
    const msg = JSON.stringify(r.error?.issues);
    expect(msg).toContain('4 must-have');
  });

  it('accepts exactly 4 must-have categories (boundary)', () => {
    // 4 must-haves: commute, programmes, subjects, ccas → only distinctive free to rank
    // maxCommuteMins requires home postal (A2 rule)
    const r = RecommendationRequestSchema.safeParse({
      home: { postal: '425304' },
      mustHaves: {
        maxCommuteMins: 30,
        requiredProgrammes: ['IB'],
        requiredSubjectsLanguages: ['Higher Chinese'],
        requiredCCAs: ['Robotics'],
        // requiredDistinctive omitted → exactly 4 filled
      },
      goodToHaves: { rankedCriteria: ['distinctive'] }, // no overlap with any active must-have
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid rankedCriteria value', () => {
    const r = RecommendationRequestSchema.safeParse({
      ...validRequest(),
      goodToHaves: { rankedCriteria: ['invalid_criterion'] },
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 11: Must-have vs good-to-have overlap validation (no double counting)
// ---------------------------------------------------------------------------
describe('RecommendationRequestSchema — must-have vs good-to-have separation', () => {
  it('rejects when ccas is both a must-have and a ranked criterion', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: {},
      mustHaves: { requiredCCAs: ['Robotics'] },
      goodToHaves: { rankedCriteria: ['ccas'] },
    });
    expect(r.success).toBe(false);
    const msg = JSON.stringify(r.error?.issues);
    expect(msg).toContain('must-have');
  });

  it('rejects when commute is both a must-have (maxCommuteMins set) and ranked', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: {},
      mustHaves: { maxCommuteMins: 45 },
      goodToHaves: { rankedCriteria: ['commute'] },
    });
    expect(r.success).toBe(false);
    const msg = JSON.stringify(r.error?.issues);
    expect(msg).toContain('must-have');
  });

  it('rejects when programmes is both a must-have and ranked', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: {},
      mustHaves: { requiredProgrammes: ['IB'] },
      goodToHaves: { rankedCriteria: ['programmes'] },
    });
    expect(r.success).toBe(false);
    const msg = JSON.stringify(r.error?.issues);
    expect(msg).toContain('must-have');
  });

  it('accepts when criterion is in must-have but a different criterion is ranked', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: {},
      mustHaves: { requiredCCAs: ['Robotics'] },
      goodToHaves: { rankedCriteria: ['programmes'] },
    });
    expect(r.success).toBe(true);
  });

  it('accepts when requiredCCAs is empty (not active as must-have) and ccas is ranked', () => {
    // requiredCCAs: [] is not an active must-have, so ccas can be ranked.
    // maxCommuteMins triggers the A2 rule → must supply home postal.
    const r = RecommendationRequestSchema.safeParse({
      home: { postal: '425304' },
      mustHaves: { requiredCCAs: [], maxCommuteMins: 45 },
      goodToHaves: { rankedCriteria: ['ccas'] },  // safe because requiredCCAs is empty
    });
    expect(r.success).toBe(true);
  });

  it('rejects when multiple criteria overlap simultaneously', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: {},
      mustHaves: { requiredCCAs: ['Robotics'], requiredProgrammes: ['IB'] },
      goodToHaves: { rankedCriteria: ['ccas', 'programmes'] },
    });
    expect(r.success).toBe(false);
    // Two overlap issues should be present
    expect(r.error?.issues.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Test 12: Richness fallback — empty desired items use count/maxCount scoring
// ---------------------------------------------------------------------------
describe('rankSchools — richness fallback when desired items are not specified', () => {
  it('scores 1.0 when only school has all CCAs (count/max = max/max)', () => {
    const richSchool = makeSchool({ ccas: ['Robotics', 'Badminton', 'Basketball', 'Swimming', 'Chess'] });
    const gth: GoodToHaves = { rankedCriteria: ['ccas'] }; // no desiredCCAs → richness fallback
    const [result] = rankSchools([richSchool], {}, gth);
    const ccasEntry = result.breakdown.find((b) => b.criterion === 'ccas');
    // Only 1 school → max = 5, school count = 5 → score = 1.0
    expect(ccasEntry?.score).toBeCloseTo(1.0, 5);
  });

  it('school with more CCAs ranks higher than school with fewer when no desired specified', () => {
    const small = makeSchool({ id: 'small', ccas: ['Robotics'] });
    const large = makeSchool({ id: 'large', ccas: ['Robotics', 'Badminton', 'Basketball', 'Swimming'] });
    const gth: GoodToHaves = { rankedCriteria: ['ccas'] }; // richness fallback
    const results = rankSchools([small, large], {}, gth);
    const largeRank = results.findIndex((r) => r.school.id === 'large');
    const smallRank = results.findIndex((r) => r.school.id === 'small');
    // large has 4 CCAs; small has 1 → large should rank higher
    expect(largeRank).toBeLessThan(smallRank);
  });

  it('richness score = schoolItemCount / maxAcrossAllCandidates', () => {
    const s1 = makeSchool({ id: 'a', programmes: ['IB', 'IP'] });
    const s2 = makeSchool({ id: 'b', programmes: ['IB', 'IP', 'DSA', 'STEM'] });
    const gth: GoodToHaves = { rankedCriteria: ['programmes'] };
    const results = rankSchools([s1, s2], {}, gth);
    const r1 = results.find((r) => r.school.id === 'a')!;
    const r2 = results.find((r) => r.school.id === 'b')!;
    const maxCount = 4; // s2 has 4 programmes (the max)
    expect(r1.breakdown[0].score).toBeCloseTo(2 / maxCount, 5);
    expect(r2.breakdown[0].score).toBeCloseTo(4 / maxCount, 5);
  });

  it('overlap score is still used when desiredCCAs are specified', () => {
    const school = makeSchool({ ccas: ['Robotics', 'Badminton', 'Basketball'] });
    const gth: GoodToHaves = { rankedCriteria: ['ccas'], desiredCCAs: ['Robotics', 'Swimming'] };
    const [result] = rankSchools([school], {}, gth);
    const ccasEntry = result.breakdown.find((b) => b.criterion === 'ccas');
    // 1 of 2 desired items found → overlap score = 0.5
    expect(ccasEntry?.score).toBeCloseTo(0.5, 5);
  });

  it('school with zero distinctive entries scores 0 for richness (division by max still clamps)', () => {
    const emptySchool = makeSchool({ id: 'e', distinctive: [] });
    const richSchool  = makeSchool({ id: 'r', distinctive: ['STEM::Robotics ALP', 'Arts::Dance ALP'] });
    const gth: GoodToHaves = { rankedCriteria: ['distinctive'] };
    const results = rankSchools([emptySchool, richSchool], {}, gth);
    const eResult = results.find((r) => r.school.id === 'e')!;
    const rResult = results.find((r) => r.school.id === 'r')!;
    expect(eResult.breakdown[0].score).toBe(0);          // 0/2 = 0
    expect(rResult.breakdown[0].score).toBeCloseTo(1.0, 5); // 2/2 = 1
  });
});

// ---------------------------------------------------------------------------
// Regression tests: the "always 0 schools" bugs (fixed 2026-03-09)
// ---------------------------------------------------------------------------

// Bug 1: Nearby mode sent maxCommuteMins as must-have AND 'commute' in rankedCriteria.
// The schema correctly rejected this as double-counting, returning 400.
// The frontend silently showed 0 results instead of an error.
// Fix: schema no longer requires ≥1 must-have; nearby uses mustHaves:{} + rankedCriteria:['commute'].
describe('RecommendationRequestSchema — regression: zero must-haves is now valid', () => {
  it('accepts request with zero must-haves and one ranked criterion (quick-filter pattern)', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: {},
      mustHaves: {},
      goodToHaves: { rankedCriteria: ['ccas'], desiredCCAs: ['BASKETBALL'] },
    });
    expect(r.success).toBe(true);
  });

  it('accepts request with zero must-haves and commute as ranked criterion (nearby pattern)', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: { postal: '119074' },
      mustHaves: {},
      goodToHaves: { rankedCriteria: ['commute'] },
    });
    expect(r.success).toBe(true);
  });

  it('still rejects commute in both maxCommuteMins (must-have) AND rankedCriteria (double-count)', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: { postal: '119074' },
      mustHaves: { maxCommuteMins: 30 },
      goodToHaves: { rankedCriteria: ['commute'] }, // double-counted — still invalid
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('must-have');
  });

  it('still rejects more than 4 must-have categories', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: {},
      mustHaves: {
        maxCommuteMins: 30,
        requiredProgrammes: ['IB'],
        requiredSubjectsLanguages: ['Higher Chinese'],
        requiredCCAs: ['Robotics'],
        requiredDistinctive: ['STEM::ALP'],
      },
      goodToHaves: { rankedCriteria: ['distinctive'] },
    });
    expect(r.success).toBe(false);
  });

  it('accepts empty rankedCriteria (A1 fix: must-haves-only mode is now valid)', () => {
    // rankedCriteria is no longer required — zero good-to-haves is valid.
    const r = RecommendationRequestSchema.safeParse({
      home: {},
      mustHaves: {},
      goodToHaves: { rankedCriteria: [] },
    });
    expect(r.success).toBe(true);
  });
});

// Bug 2: Full pipeline smoke test — with 0 must-haves and desired CCAs,
// schools with the desired CCA must appear in top results (not 0 schools).
describe('rankSchools — regression: quick-filter pipeline returns results', () => {
  const FIXTURE_SCHOOLS: SchoolForRanking[] = [
    makeSchool({ id: 'basketball-1', name: 'School A', ccas: ['BASKETBALL', 'CHOIR'] }),
    makeSchool({ id: 'basketball-2', name: 'School B', ccas: ['BASKETBALL'] }),
    makeSchool({ id: 'no-basketball', name: 'School C', ccas: ['CHOIR'] }),
    makeSchool({ id: 'empty-ccas',   name: 'School D', ccas: [] }),
    makeSchool({ id: 'multi',        name: 'School E', ccas: ['BASKETBALL', 'ROBOTICS', 'CHOIR'] }),
  ];

  it('returns 5 results (all schools) when mustHaves is empty', () => {
    const feasible = FIXTURE_SCHOOLS.filter((s) => passesMustHaves(s, {}));
    expect(feasible).toHaveLength(5);
  });

  it('ranks schools with BASKETBALL higher than those without', () => {
    const feasible = FIXTURE_SCHOOLS.filter((s) => passesMustHaves(s, {}));
    const ranked = rankSchools(feasible, {}, {
      rankedCriteria: ['ccas'],
      desiredCCAs: ['BASKETBALL'],
    });
    const basketballIds = new Set(['basketball-1', 'basketball-2', 'multi']);
    const topIds = ranked.slice(0, 3).map((r) => r.school.id);
    // All top 3 should be basketball schools
    topIds.forEach((id) => expect(basketballIds.has(id)).toBe(true));
  });

  it('returns noResults:true with bottleneck when impossible must-have is given', () => {
    const payload = detectBottleneck(FIXTURE_SCHOOLS, { requiredCCAs: ['IMPOSSIBLE_CCA'] });
    expect(payload.noResults).toBe(true);
    expect(payload.bottleneck.type).toBeTruthy();
    expect(payload.suggestions.length).toBeGreaterThan(0);
  });

  it('no-results path returns suggestions with newCount ≥ 0 (not -1 placeholder)', () => {
    const payload = detectBottleneck(FIXTURE_SCHOOLS, { requiredCCAs: ['IMPOSSIBLE_CCA'] });
    payload.suggestions.forEach((s) => {
      expect(s.newCount).toBeGreaterThanOrEqual(0);
      expect(s.newCount).not.toBe(-1);
      expect(s.patch).toBeDefined();
      expect(s.label).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// A1: rankSchools with k=0 (no good-to-haves) — fallback sort
// ---------------------------------------------------------------------------
describe('rankSchools — k=0 fallback sort (no good-to-haves)', () => {
  const schools: SchoolForRanking[] = [
    makeSchool({ id: 'far',   name: 'Zebra School',  commute: { durationMins: 50, transfers: 1 } }),
    makeSchool({ id: 'near',  name: 'Alpha School',  commute: { durationMins: 10, transfers: 0 } }),
    makeSchool({ id: 'mid',   name: 'Beta School',   commute: { durationMins: 25, transfers: 1 } }),
    makeSchool({ id: 'nocom', name: 'Gamma School',  commute: null }),
  ];

  it('returns all schools when k=0', () => {
    const result = rankSchools(schools, {}, { rankedCriteria: [] });
    expect(result).toHaveLength(4);
  });

  it('all schools have totalScore=0 and empty breakdown', () => {
    const result = rankSchools(schools, {}, { rankedCriteria: [] });
    result.forEach((r) => {
      expect(r.totalScore).toBe(0);
      expect(r.breakdown).toHaveLength(0);
    });
  });

  it('sorts by commute ASC (null last), then name ASC', () => {
    const result = rankSchools(schools, {}, { rankedCriteria: [] });
    expect(result[0].school.id).toBe('near');   // 10 min
    expect(result[1].school.id).toBe('mid');    // 25 min
    expect(result[2].school.id).toBe('far');    // 50 min
    expect(result[3].school.id).toBe('nocom'); // null → last
  });
});

// ---------------------------------------------------------------------------
// A2: commute criterion requires home location
// ---------------------------------------------------------------------------
describe('RecommendationRequestSchema — commute requires home location', () => {
  it('rejects commute in rankedCriteria when no home is provided', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: {},
      mustHaves: {},
      goodToHaves: { rankedCriteria: ['commute'] },
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('Home postal code is required');
  });

  it('rejects maxCommuteMins when no home is provided', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: {},
      mustHaves: { maxCommuteMins: 30 },
      goodToHaves: { rankedCriteria: ['ccas'], desiredCCAs: ['BASKETBALL'] },
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('Home postal code is required');
  });

  it('accepts commute with valid postal', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: { postal: '425304' },
      mustHaves: {},
      goodToHaves: { rankedCriteria: ['commute'] },
    });
    expect(r.success).toBe(true);
  });

  it('accepts commute with lat/lng coords', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: { lat: 1.3521, lng: 103.8198 },
      mustHaves: {},
      goodToHaves: { rankedCriteria: ['commute'] },
    });
    expect(r.success).toBe(true);
  });

  it('rejects postal that fails regex (not 6 digits)', () => {
    const r = RecommendationRequestSchema.safeParse({
      home: { postal: '1234' },
      mustHaves: {},
      goodToHaves: { rankedCriteria: ['programmes'] },
    });
    expect(r.success).toBe(false);
  });
});


// ---------------------------------------------------------------------------
// Test: Percentage / score clarity — Issue 5 regression tests
// ---------------------------------------------------------------------------
describe('Recommendation score semantics', () => {
  it('totalScore is a ROC-weighted sum in [0,1]', () => {
    const schools = [
      makeSchool({ subjects: ['Higher Chinese', 'Literature', 'Physics'] }),
    ];
    const ranked = rankSchools(schools, {}, {
      rankedCriteria: ['subjectsLanguages'],
      desiredSubjectsLanguages: ['Higher Chinese', 'Literature', 'Physics', 'Chemistry', 'Biology'],
    });
    // 3 of 5 desired subjects → score = 3/5 = 0.6; k=1 → weight=1; totalScore=0.6
    expect(ranked[0].totalScore).toBeCloseTo(0.6, 5);
    expect(ranked[0].breakdown[0].score).toBeCloseTo(0.6, 5);
  });

  it('per-criterion score is the set overlap fraction', () => {
    const school = makeSchool({ subjects: ['English', 'Math'] });
    const [result] = rankSchools([school], {}, {
      rankedCriteria: ['subjectsLanguages'],
      desiredSubjectsLanguages: ['English', 'Math', 'Science', 'History'],
    });
    // 2 of 4 desired → 0.5
    const subjBreakdown = result.breakdown.find((b) => b.criterion === 'subjectsLanguages');
    expect(subjBreakdown?.score).toBeCloseTo(0.5, 5);
  });

  it('totalScore ×100 matches "Overall fit %" shown to user', () => {
    const school = makeSchool({ commute: { durationMins: 10, transfers: 0 } });
    const [result] = rankSchools([school], {}, { rankedCriteria: ['commute'] });
    // 10 min commute = max score; totalScore should be close to 1
    expect(result.totalScore).toBeCloseTo(1, 1);
    // UI shows Math.round(totalScore * 100) = 100%
    expect(Math.round(result.totalScore * 100)).toBe(100);
  });

  it('subject overlap of 1/5 gives ~20% criterion score', () => {
    const school = makeSchool({ subjects: ['Higher Chinese'] });
    const [result] = rankSchools([school], {}, {
      rankedCriteria: ['subjectsLanguages'],
      desiredSubjectsLanguages: ['Higher Chinese', 'Physics', 'Chemistry', 'Biology', 'History'],
    });
    const b = result.breakdown.find((b) => b.criterion === 'subjectsLanguages')!;
    expect(b.score).toBeCloseTo(0.2, 5); // 1/5 = 20%
    // totalScore with k=1 weight=1 → same as criterion score
    expect(result.totalScore).toBeCloseTo(0.2, 5);
  });

  it('explanation.matched records exactly which items were found', () => {
    const school = makeSchool({ subjects: ['English', 'Math', 'Science'] });
    const [result] = rankSchools([school], {}, {
      rankedCriteria: ['subjectsLanguages'],
      desiredSubjectsLanguages: ['English', 'Math', 'Physics'],
    });
    // English and Math matched; Physics not in school
    expect(result.explanation.matched.subjectsLanguages).toEqual(
      expect.arrayContaining(['English', 'Math'])
    );
    expect(result.explanation.matched.subjectsLanguages).not.toContain('Physics');
    expect(result.explanation.matched.subjectsLanguages).toHaveLength(2);
  });

  it('richness fallback score uses count/maxCount when no desired items', () => {
    const s1 = makeSchool({ id: 's1', subjects: ['A', 'B', 'C', 'D'] });
    const s2 = makeSchool({ id: 's2', subjects: ['A'] });
    const ranked = rankSchools([s1, s2], {}, { rankedCriteria: ['subjectsLanguages'] });
    // s1 has 4 subjects, s2 has 1; max=4 → s1 score=1, s2 score=0.25
    expect(ranked[0].school.id).toBe('s1');
    expect(ranked[0].breakdown[0].score).toBeCloseTo(1, 5);
    expect(ranked[1].breakdown[0].score).toBeCloseTo(0.25, 5);
  });

  it('two-criterion ROC weights add up to 1 and are correctly split', () => {
    const school = makeSchool({ commute: { durationMins: 10, transfers: 0 }, ccas: ['Robotics'] });
    const [result] = rankSchools([school], {}, {
      rankedCriteria: ['commute', 'ccas'],
      desiredCCAs: ['Robotics'],
    });
    const totalWeight = result.breakdown.reduce((s, b) => s + b.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 10);
    // commute weight > ccas weight (rank 1 > rank 2)
    const commuteW = result.breakdown.find((b) => b.criterion === 'commute')!.weight;
    const ccasW = result.breakdown.find((b) => b.criterion === 'ccas')!.weight;
    expect(commuteW).toBeGreaterThan(ccasW);
  });
});

// ---------------------------------------------------------------------------
// Test: Commute estimated flag is preserved through rankSchools
// ---------------------------------------------------------------------------
describe('Commute estimated flag', () => {
  it('estimated flag is passed through to result.commute', () => {
    const school = makeSchool({
      commute: { durationMins: 25, transfers: 1, estimated: true },
    });
    const [result] = rankSchools([school], {}, { rankedCriteria: ['commute'] });
    expect((result.commute as { estimated?: boolean }).estimated).toBe(true);
  });

  it('real commute (no estimated flag) results in undefined estimated', () => {
    const school = makeSchool({ commute: { durationMins: 25, transfers: 0 } });
    const [result] = rankSchools([school], {}, { rankedCriteria: ['commute'] });
    expect((result.commute as { estimated?: boolean }).estimated).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test: Nearby vs recommendation mode — score meaningfulness
//
// The frontend shows percentages ONLY in recommendation mode (urlMode='recs').
// In nearby mode (rankedCriteria: ['commute'] with no other criteria), the
// backend returns a totalScore, but the UI does NOT display it.
// These tests document what the engine returns in each mode so the distinction
// is explicit and regression-tested.
// ---------------------------------------------------------------------------
describe('Nearby mode vs recommendation mode score structure', () => {
  const schools = [
    makeSchool({ id: 'a', commute: { durationMins: 10, transfers: 0 } }),
    makeSchool({ id: 'b', commute: { durationMins: 40, transfers: 1 } }),
  ];

  it('nearby mode uses only commute criterion — breakdown has exactly 1 entry', () => {
    // Nearby quick filter sends rankedCriteria: ['commute'] only
    const ranked = rankSchools(schools, {}, { rankedCriteria: ['commute'] });
    for (const r of ranked) {
      expect(r.breakdown).toHaveLength(1);
      expect(r.breakdown[0].criterion).toBe('commute');
    }
  });

  it('nearby mode totalScore is commute score only — not a composite preference score', () => {
    const ranked = rankSchools(schools, {}, { rankedCriteria: ['commute'] });
    // Closer school (10 min) gets totalScore close to 1; further school gets lower
    expect(ranked[0].school.id).toBe('a');
    expect(ranked[0].totalScore).toBeGreaterThan(ranked[1].totalScore);
    // The totalScore equals the commute score directly (weight=1 for k=1)
    expect(ranked[0].totalScore).toBeCloseTo(ranked[0].breakdown[0].score, 10);
  });

  it('recommendation mode with multiple criteria has richer breakdown', () => {
    // Full recommendation: commute + CCAs + subjects
    const school = makeSchool({
      commute: { durationMins: 20, transfers: 0 },
      ccas: ['Basketball', 'Robotics'],
      subjects: ['Higher Chinese', 'Physics'],
    });
    const [result] = rankSchools([school], {}, {
      rankedCriteria: ['commute', 'ccas', 'subjectsLanguages'],
      desiredCCAs: ['Basketball'],
      desiredSubjectsLanguages: ['Physics', 'Chemistry'],
    });
    // Multi-criteria: 3 entries in breakdown
    expect(result.breakdown).toHaveLength(3);
    expect(result.breakdown.map((b) => b.criterion)).toEqual(
      expect.arrayContaining(['commute', 'ccas', 'subjectsLanguages'])
    );
  });

  it('recommendation mode totalScore reflects all criteria weighted, not just commute', () => {
    // School A: great commute, no desired CCAs
    // School B: worse commute, has desired CCAs
    const schoolA = makeSchool({ id: 'a', commute: { durationMins: 10, transfers: 0 }, ccas: [] });
    const schoolB = makeSchool({ id: 'b', commute: { durationMins: 50, transfers: 2 }, ccas: ['Basketball'] });
    const ranked = rankSchools([schoolA, schoolB], {}, {
      rankedCriteria: ['ccas', 'commute'],  // ccas ranked #1 (higher weight)
      desiredCCAs: ['Basketball'],
    });
    // School B has the desired CCA (ccas ranked #1 = higher weight), should win
    expect(ranked[0].school.id).toBe('b');
    // School B's breakdown has both criteria
    expect(ranked[0].breakdown).toHaveLength(2);
  });

  it('nearby mode produces no explanation.topCriteria beyond commute', () => {
    const [result] = rankSchools(schools, {}, { rankedCriteria: ['commute'] });
    // topCriteria is derived from breakdown sorted by contribution
    expect(result.explanation.topCriteria).toHaveLength(1);
    expect(result.explanation.topCriteria[0]).toBe('commute');
  });
});

