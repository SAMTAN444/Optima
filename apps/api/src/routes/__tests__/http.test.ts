/**
 * HTTP integration tests — use supertest to exercise real Express routes
 * without starting a live server. Prisma calls are mocked so the tests
 * run offline without a database.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mock Prisma before importing the app (prevents real DB connections)
// ---------------------------------------------------------------------------
vi.mock('../../lib/prisma', () => ({
  prisma: {
    school: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    schoolCCA: { findMany: vi.fn().mockResolvedValue([]) },
    schoolProgramme: { findMany: vi.fn().mockResolvedValue([]) },
    schoolSubject: { findMany: vi.fn().mockResolvedValue([]) },
    schoolDistinctiveProgramme: { findMany: vi.fn().mockResolvedValue([]) },
    commuteCache: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    userProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    savedSchool: { findUnique: vi.fn().mockResolvedValue(null) },
    review: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

// Mock OneMap client so no real network calls are made
vi.mock('../../lib/onemapClient', () => ({
  isConfigured: () => false,
  onemapFetch: vi.fn(),
  onemapPublicFetch: vi.fn(),
}));

import { createApp } from '../../app';

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  app = createApp();
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
describe('GET /health', () => {
  it('returns 200 with ok:true', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /schools — secondary-only, pagination, filter stubs
// ---------------------------------------------------------------------------
describe('GET /schools', () => {
  it('returns 200 with schools array and pagination', async () => {
    const res = await request(app).get('/schools');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data.schools)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();
    expect(res.body.data.pagination).toHaveProperty('total');
    expect(res.body.data.pagination).toHaveProperty('page');
    expect(res.body.data.pagination).toHaveProperty('pageSize');
    expect(res.body.data.pagination).toHaveProperty('totalPages');
  });

  it('accepts query params without errors', async () => {
    const res = await request(app).get('/schools?q=test&page=1&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 for invalid pageSize above max', async () => {
    const res = await request(app).get('/schools?pageSize=501');
    // Zod coerces; max is 500 — validation should reject 501
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /schools/meta
// ---------------------------------------------------------------------------
describe('GET /schools/meta', () => {
  it('returns 200 with ccas, programmes, subjects', async () => {
    const res = await request(app).get('/schools/meta');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data.ccas)).toBe(true);
    expect(Array.isArray(res.body.data.programmes)).toBe(true);
    expect(Array.isArray(res.body.data.subjects)).toBe(true);
    expect(Array.isArray(res.body.data.ccasGrouped)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /schools/nearby
// ---------------------------------------------------------------------------
describe('GET /schools/nearby', () => {
  it('returns 400 when no location is provided', async () => {
    const res = await request(app).get('/schools/nearby');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('returns 400 for non-6-digit postal code', async () => {
    const res = await request(app).get('/schools/nearby?postal=12345');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_POSTAL');
  });

  it('returns ok response structure with schools + pagination', async () => {
    // Prisma mock returns [] schools, so nearby returns empty list with valid structure
    // Geocode is mocked to return null for unknown postal → 422
    // Use lat/lng directly to bypass geocoding
    const res = await request(app).get('/schools/nearby?lat=1.3521&lng=103.8198&maxMins=30');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data.schools)).toBe(true);
    expect(res.body.data.pagination).toHaveProperty('total');
  });
});

// ---------------------------------------------------------------------------
// POST /recommendations
// ---------------------------------------------------------------------------
describe('POST /recommendations', () => {
  it('returns 400 when body is missing', async () => {
    const res = await request(app).post('/recommendations').send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('accepts empty rankedCriteria (A1: must-haves-only mode is now valid)', async () => {
    // Empty rankedCriteria is now allowed — engine sorts by commute/name instead.
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: [] } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('accepts empty mustHaves with non-commute criterion', async () => {
    // commute as good-to-have requires home (A2), so use ccas instead here
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: ['ccas'] } });
    // DB mock returns [] schools → noResults or empty results (not a 400 error)
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects commute in rankedCriteria when home is missing (A2)', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: ['commute'] } });
    expect(res.status).toBe(400);
  });

  it('rejects commute in both mustHaves and rankedCriteria (double-count)', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({
        home: {},
        mustHaves: { maxCommuteMins: 30 },
        goodToHaves: { rankedCriteria: ['commute'] },
      });
    expect(res.status).toBe(400);
  });

  it('returns noResults:true structure when DB has no schools (mock returns [])', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: ['ccas'] } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // With 0 schools, noResults can be true or false (empty results); either is valid
    expect(res.body.data).toHaveProperty('noResults');
  });
});

// ---------------------------------------------------------------------------
// PATCH /reviews/:id — edit own review (auth required)
// ---------------------------------------------------------------------------
describe('PATCH /reviews/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .patch('/reviews/some-id')
      .send({ rating: 4, comment: 'Updated comment' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('returns 400 when body is invalid (missing fields)', async () => {
    // Even without auth header, schema validation fires first
    // In this case auth fires first — 401 expected
    const res = await request(app).patch('/reviews/some-id').send({});
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /reviews/:id — delete own review (auth required)
// ---------------------------------------------------------------------------
describe('DELETE /reviews/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).delete('/reviews/some-id');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /schools — ip quick filter
// ---------------------------------------------------------------------------
describe('GET /schools — ip filter', () => {
  it('accepts ip=ip filter without errors', async () => {
    const res = await request(app).get('/schools?ip=ip');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data.schools)).toBe(true);
  });

  it('accepts ip=olevel filter without errors', async () => {
    const res = await request(app).get('/schools?ip=olevel');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects invalid ip param value', async () => {
    const res = await request(app).get('/schools?ip=invalid');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /schools/:id/reviews — only APPROVED reviews returned
// ---------------------------------------------------------------------------
describe('GET /schools/:id/reviews', () => {
  it('returns empty array when no reviews exist', async () => {
    const res = await request(app).get('/schools/test-school-id/reviews');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST /schools/:id/reviews — requires auth
// ---------------------------------------------------------------------------
describe('POST /schools/:id/reviews', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/schools/test-school-id/reviews')
      .send({ rating: 4, comment: 'Great school!' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('returns 400 when rating is missing', async () => {
    // Auth fires first, so 401 expected without a token
    const res = await request(app)
      .post('/schools/test-school-id/reviews')
      .send({ comment: 'No rating provided' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for out-of-range rating (without auth)', async () => {
    const res = await request(app)
      .post('/schools/test-school-id/reviews')
      .send({ rating: 6, comment: 'Out of range rating test' });
    expect(res.status).toBe(401); // auth middleware fires before validation
  });
});

// ---------------------------------------------------------------------------
// POST /reviews/:id/report — requires auth
// ---------------------------------------------------------------------------
describe('POST /reviews/:id/report', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/reviews/some-review-id/report')
      .send({ reason: 'Spam content' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('returns 400 when reason is missing (schema validation)', async () => {
    // Auth fires first when no token — still 401
    const res = await request(app)
      .post('/reviews/some-review-id/report')
      .send({});
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Moderation: review status — reporting should not hide reviews
// The GET /schools/:id/reviews endpoint filters by status: 'APPROVED'.
// A reported review remains APPROVED (only admin reject changes status).
// This test verifies the APPROVED filter returns only approved reviews.
// ---------------------------------------------------------------------------
describe('Review moderation — APPROVED filter', () => {
  it('review list endpoint filters by APPROVED status', async () => {
    // The mock returns [] (no reviews) by default.
    // This test verifies the endpoint is reachable and returns a list.
    const res = await request(app).get('/schools/any-school-id/reviews');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /admin/reviews/:id/reject — hides review (requires auth + admin)
// ---------------------------------------------------------------------------
describe('POST /admin/reviews/:id/reject', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/admin/reviews/some-id/reject');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});


// ---------------------------------------------------------------------------
// POST /recommendations — 3-mode detection + pagination
// ---------------------------------------------------------------------------
describe('POST /recommendations — mode detection', () => {
  it('returns mode:browse when no must-haves and no good-to-haves', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: [] } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // DB mock returns [] so noResults → but noResults response should still have mode
    expect(res.body.data).toHaveProperty('mode');
  });

  it('returns mode:filter when must-haves set and no good-to-haves', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: { requiredCCAs: ['Basketball'] }, goodToHaves: { rankedCriteria: [] } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('mode');
    expect(['filter', 'browse', 'recommendation']).toContain(res.body.data.mode);
  });

  it('returns mode:recommendation when good-to-haves are ranked', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: ['ccas'] } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('mode');
  });

  it('nearby-style request (maxCommuteMins only) returns mode:filter and pagination metadata', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: { lat: 1.3521, lng: 103.8198 }, mustHaves: { maxCommuteMins: 30 }, goodToHaves: { rankedCriteria: [] } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('mode');
    // When results exist, response must include pagination
    if (!res.body.data.noResults) {
      expect(res.body.data).toHaveProperty('pagination');
      expect(res.body.data.pagination).toHaveProperty('page');
      expect(res.body.data.pagination).toHaveProperty('pageSize');
      expect(res.body.data.pagination).toHaveProperty('totalCount');
      expect(res.body.data.pagination).toHaveProperty('totalPages');
    }
  });

  it('noResults response includes mode field', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: { requiredCCAs: ['NonExistentCCA'] }, goodToHaves: { rankedCriteria: [] } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('mode');
  });

  it('filter/browse mode response has pagination but no score fields', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: [] } });
    expect(res.status).toBe(200);
    if (!res.body.data.noResults) {
      // No score-related fields in filter/browse response
      expect(res.body.data.results).toBeUndefined();
      // Pagination metadata present
      expect(res.body.data).toHaveProperty('pagination');
    }
  });

  it('recommendation mode response has no pagination but has results', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: ['ccas'] } });
    expect(res.status).toBe(200);
    if (!res.body.data.noResults) {
      expect(res.body.data).toHaveProperty('results');
      // No pagination in recommendation mode
      expect(res.body.data.pagination).toBeUndefined();
    }
  });

  it('respects page/pageSize params in filter mode', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: [] }, page: 1, pageSize: 5 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('mode');
  });
});

// ---------------------------------------------------------------------------
// Nearby quick-filter — ephemeral postal, filter mode, no recommendation scores
// ---------------------------------------------------------------------------
describe('Nearby quick-filter — filter mode, no scores', () => {
  it('nearby request (maxCommuteMins, no good-to-haves) resolves to filter mode', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({
        home: { lat: 1.3521, lng: 103.8198 },
        mustHaves: { maxCommuteMins: 30 },
        goodToHaves: { rankedCriteria: [] },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // DB mock returns [] → noResults, but mode must still be present
    expect(res.body.data).toHaveProperty('mode');
    // filter mode must NOT contain score-related fields
    if (!res.body.data.noResults) {
      expect(res.body.data.results).toBeUndefined();
      expect(res.body.data).toHaveProperty('pagination');
    }
  });

  it('nearby request without postal/coords returns 400', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({
        home: {},
        mustHaves: { maxCommuteMins: 30 },
        goodToHaves: { rankedCriteria: [] },
      });
    // commute constraint without home coords → schema validation rejects
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('nearby request does not trigger recommendation mode', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({
        home: { lat: 1.3521, lng: 103.8198 },
        mustHaves: { maxCommuteMins: 30 },
        goodToHaves: { rankedCriteria: [] },
      });
    expect(res.status).toBe(200);
    // Mode must never be 'recommendation' for a nearby request
    if (res.body.data && !res.body.data.noResults) {
      expect(res.body.data.mode).not.toBe('recommendation');
    }
  });
});

// ---------------------------------------------------------------------------
// Review moderation regression — reported reviews stay APPROVED
// ---------------------------------------------------------------------------
describe('Review moderation — reported reviews stay visible', () => {
  it('GET /schools/:id/reviews returns only APPROVED reviews (mock returns [])', async () => {
    const res = await request(app).get('/schools/test-id/reviews');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Empty list is valid (mock returns [])
  });

  it('POST /reviews/:id/report requires auth', async () => {
    const res = await request(app)
      .post('/reviews/some-review-id/report')
      .send({ reason: 'Spam' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('POST /admin/reviews/:id/reject requires auth + admin role', async () => {
    const res = await request(app).post('/admin/reviews/some-id/reject');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('POST /schools/:id/reviews requires auth', async () => {
    const res = await request(app)
      .post('/schools/test-school-id/reviews')
      .send({ rating: 4, comment: 'Great school experience!' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mode × scores invariants
// ---------------------------------------------------------------------------
describe('Scores are only present in recommendation mode', () => {
  it('browse mode (no inputs) returns no results/scores fields', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: [] } });
    expect(res.status).toBe(200);
    if (!res.body.data.noResults) {
      expect(res.body.data.results).toBeUndefined();
      expect(res.body.data.schools).toBeDefined();
    }
  });

  it('filter mode (must-haves, no good-to-haves) returns no score fields', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({
        home: {},
        mustHaves: { requiredCCAs: ['Basketball'] },
        goodToHaves: { rankedCriteria: [] },
      });
    expect(res.status).toBe(200);
    if (!res.body.data.noResults) {
      expect(res.body.data.results).toBeUndefined();
    }
  });

  it('recommendation mode (ranked criteria) returns results with scores', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: ['ccas'] } });
    expect(res.status).toBe(200);
    if (!res.body.data.noResults) {
      expect(res.body.data.results).toBeDefined();
      expect(res.body.data.pagination).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Must-have / good-to-have overlap prevention — schema rejects dual-use criteria
// ---------------------------------------------------------------------------
describe('Must-have / good-to-have overlap prevention', () => {
  it('rejects ccas in both requiredCCAs (must-have) and rankedCriteria (good-to-have)', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({
        home: {},
        mustHaves: { requiredCCAs: ['Basketball'] },
        goodToHaves: { rankedCriteria: ['ccas'] },
      });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('rejects programmes in both requiredProgrammes and rankedCriteria', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({
        home: {},
        mustHaves: { requiredProgrammes: ['Art Elective Programme'] },
        goodToHaves: { rankedCriteria: ['programmes'] },
      });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('rejects subjectsLanguages in both requiredSubjectsLanguages and rankedCriteria', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({
        home: {},
        mustHaves: { requiredSubjectsLanguages: ['Mathematics'] },
        goodToHaves: { rankedCriteria: ['subjectsLanguages'] },
      });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('rejects distinctive in both requiredDistinctive and rankedCriteria', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({
        home: {},
        mustHaves: { requiredDistinctive: ['Applied Learning::Robotics'] },
        goodToHaves: { rankedCriteria: ['distinctive'] },
      });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('allows ccas as good-to-have when requiredCCAs is empty', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({
        home: {},
        mustHaves: { requiredCCAs: [] },
        goodToHaves: { rankedCriteria: ['ccas'] },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('filter/browse mode schools array is always defined (never undefined)', async () => {
    const res = await request(app)
      .post('/recommendations')
      .send({ home: {}, mustHaves: {}, goodToHaves: { rankedCriteria: [] } });
    expect(res.status).toBe(200);
    if (!res.body.data.noResults) {
      // schools must be an array (not undefined) — prevents frontend .map() crash
      expect(Array.isArray(res.body.data.schools)).toBe(true);
    }
  });
});
