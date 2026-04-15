/**
 * Commute service — wraps OneMap routing API with DB caching.
 *
 * Requires ONEMAP_TOKEN (or legacy ONEMAP_EMAIL/ONEMAP_PASSWORD) to be set.
 * When OneMap is not configured or a request fails, falls back to a
 * Haversine-based travel-time estimate (estimateCommute).
 *
 * Cache TTL: 30 days.  Transit routes between fixed points in Singapore are
 * stable over months, so a 30-day TTL is appropriate and prevents mass
 * re-fetch when the cache rolls over.
 */
import { prisma } from '../lib/prisma';
import { onemapFetch, onemapPublicFetch, isConfigured } from '../lib/onemapClient';
import type { CommuteLeg } from '@optima/shared';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface Coords {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Concurrency limiter — use instead of Promise.all for large batches
// so we never fire more than `limit` OneMap requests simultaneously.
// ---------------------------------------------------------------------------
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Haversine distance fallback
// ---------------------------------------------------------------------------
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimate commute time from straight-line distance.
 * Assumes ~15 km/h effective transit speed for Singapore public transport
 * (MRT + bus, including waiting and transfer time).
 * Always sets estimated: true so callers can distinguish from real data.
 */
export function estimateCommute(
  origin: Coords,
  destination: Coords
): { durationMins: number; transfers: number; estimated: true; legs: CommuteLeg[] } {
  const distKm = haversineKm(origin.lat, origin.lng, destination.lat, destination.lng);
  // 4 mins/km + 5 min fixed overhead (walking to stop, waiting)
  const durationMins = Math.max(5, Math.round(distKm * 4 + 5));
  // Assume 1 transfer for trips > 3 km (likely bus + MRT needed)
  const transfers = distKm > 3 ? 1 : 0;
  return { durationMins, transfers, estimated: true, legs: [] };
}

interface CommuteResult {
  durationMins: number;
  transfers: number;
  legs: CommuteLeg[];
}

// ---------------------------------------------------------------------------
// Extract legs from a raw OneMap itinerary (works on both live + cached json)
// ---------------------------------------------------------------------------
function extractLegs(rawJson: unknown): CommuteLeg[] {
  try {
    const data = rawJson as {
      plan?: { itineraries?: Array<{ legs?: unknown[] }> };
    };
    const legData = data?.plan?.itineraries?.[0]?.legs ?? [];
    return (legData as Record<string, unknown>[])
      .map((leg) => ({
        mode: (leg.mode as string) ?? 'TRANSIT',
        route: (leg.routeShortName as string) ?? undefined,
        durationMins: Math.round(((leg.duration as number) ?? 0) / 60),
        from: ((leg.from as Record<string, unknown>)?.name as string) ?? '',
        to: ((leg.to as Record<string, unknown>)?.name as string) ?? '',
      }))
      .filter((l) => l.durationMins > 0);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Routing API call
// ---------------------------------------------------------------------------
async function fetchCommuteFromOneMap(
  origin: Coords,
  destination: Coords
): Promise<CommuteResult | null> {
  // OneMap requires MM-DD-YYYY format
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const yyyy = now.getFullYear();
  const today = `${mm}-${dd}-${yyyy}`;

  const path =
    `/api/public/routingsvc/route` +
    `?start=${origin.lat},${origin.lng}` +
    `&end=${destination.lat},${destination.lng}` +
    `&routeType=pt` +
    `&date=${today}` +
    `&time=08:00:00` +
    `&mode=TRANSIT` +
    `&numItineraries=1`;

  try {
    const resp = await onemapFetch(path);
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[OneMap] routing HTTP ${resp.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data = (await resp.json()) as {
      plan?: {
        itineraries?: Array<{
          duration?: number;
          transfers?: number;
          legs?: unknown[];
        }>;
      };
    };

    const itinerary = data?.plan?.itineraries?.[0];
    if (!itinerary) {
      console.warn(`[OneMap] no itinerary in response (plan keys: ${Object.keys(data?.plan ?? {}).join(',')})`);
      return null;
    }

    return {
      durationMins: Math.round((itinerary.duration ?? 0) / 60),
      transfers: itinerary.transfers ?? 0,
      legs: extractLegs(data),
    };
  } catch (err) {
    console.error('[OneMap] routing exception:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build the rawJson payload to store in cache (re-constructable by extractLegs)
// ---------------------------------------------------------------------------
function buildRawJson(legs: CommuteLeg[]): object {
  return {
    plan: {
      itineraries: [{
        legs: legs.map((l) => ({
          mode: l.mode,
          routeShortName: l.route,
          duration: l.durationMins * 60,
          from: { name: l.from },
          to: { name: l.to },
        })),
      }],
    },
  };
}

// ---------------------------------------------------------------------------
// Geocode (public endpoint — no auth needed)
// ---------------------------------------------------------------------------
export async function geocodePostal(postal: string): Promise<Coords | null> {
  if (!postal) return null;
  try {
    const path = `/api/common/elastic/search?searchVal=${encodeURIComponent(postal)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const resp = await onemapPublicFetch(path);
    if (!resp.ok) return null;

    const data = (await resp.json()) as {
      found?: number;
      results?: Array<{ LATITUDE?: string; LONGITUDE?: string }>;
    };

    if (!data.found || !data.results?.length) return null;

    const first = data.results[0];
    const lat = parseFloat(first.LATITUDE ?? '');
    const lng = parseFloat(first.LONGITUDE ?? '');
    if (isNaN(lat) || isNaN(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API: getCommute — DB-cached (30-day TTL), with legs
// ---------------------------------------------------------------------------
export async function getCommute(
  originKey: string,
  origin: Coords,
  schoolId: string,
  destination: Coords,
  userId?: string
): Promise<CommuteResult | null> {
  // Check DB cache (valid for CACHE_TTL_MS)
  const cached = await prisma.commuteCache.findUnique({
    where: { originKey_schoolId_mode: { originKey, schoolId, mode: 'pt' } },
    select: { durationMins: true, transfers: true, rawJson: true, updatedAt: true },
  });

  if (cached) {
    const age = Date.now() - cached.updatedAt.getTime();
    if (age < CACHE_TTL_MS) {
      return {
        durationMins: cached.durationMins,
        transfers: cached.transfers,
        legs: extractLegs(cached.rawJson),
      };
    }
  }

  // Graceful degradation — if no token, skip OneMap entirely
  if (!isConfigured()) {
    console.warn('[OneMap] token not configured — skipping routing');
    return null;
  }

  const result = await fetchCommuteFromOneMap(origin, destination);
  if (!result) return null;

  // Upsert cache (do NOT cache failures — only real results land here)
  await prisma.commuteCache.upsert({
    where: { originKey_schoolId_mode: { originKey, schoolId, mode: 'pt' } },
    create: {
      originKey,
      schoolId,
      userId: userId ?? null,
      mode: 'pt',
      durationMins: result.durationMins,
      transfers: result.transfers,
      rawJson: buildRawJson(result.legs),
    },
    update: {
      durationMins: result.durationMins,
      transfers: result.transfers,
      rawJson: buildRawJson(result.legs),
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Batch API: getCommutesBatch
//
// For a single origin, fetch commute to all schoolId→Coords pairs.
// Strategy:
//   1. Single DB query for all cached entries for this originKey.
//   2. For schools with a valid (non-stale) cache hit, return immediately.
//   3. For schools with stale or missing cache, call OneMap with max `concurrency`
//      simultaneous requests (default 10) to avoid rate-limiting.
// ---------------------------------------------------------------------------
export async function getCommutesBatch(
  originKey: string,
  origin: Coords,
  schools: Array<{ id: string; dest: Coords }>,
  options?: { userId?: string; concurrency?: number }
): Promise<Map<string, CommuteResult>> {
  if (schools.length === 0) return new Map();

  const { userId, concurrency = 10 } = options ?? {};

  // 1. Bulk-fetch all cached entries for this origin in one query
  const cachedRows = await prisma.commuteCache.findMany({
    where: {
      originKey,
      mode: 'pt',
      schoolId: { in: schools.map((s) => s.id) },
    },
    select: { schoolId: true, durationMins: true, transfers: true, rawJson: true, updatedAt: true },
  });

  const cacheMap = new Map(
    cachedRows.map((r) => [r.schoolId, r])
  );

  const now = Date.now();
  const results = new Map<string, CommuteResult>();
  const needsFetch: Array<{ id: string; dest: Coords }> = [];

  for (const school of schools) {
    const row = cacheMap.get(school.id);
    if (row && now - row.updatedAt.getTime() < CACHE_TTL_MS) {
      results.set(school.id, {
        durationMins: row.durationMins,
        transfers: row.transfers,
        legs: extractLegs(row.rawJson),
      });
    } else {
      needsFetch.push(school);
    }
  }

  // 2. Fetch missing/stale entries from OneMap with concurrency throttle
  if (needsFetch.length > 0 && isConfigured()) {
    const fetched = await mapConcurrent(needsFetch, concurrency, async (school) => {
      const result = await fetchCommuteFromOneMap(origin, school.dest);
      return { id: school.id, result };
    });

    // 3. Write successful results to cache and results map
    const toUpsert = fetched.filter((f) => f.result !== null);
    if (toUpsert.length > 0) {
      await Promise.all(
        toUpsert.map(({ id, result }) =>
          prisma.commuteCache.upsert({
            where: { originKey_schoolId_mode: { originKey, schoolId: id, mode: 'pt' } },
            create: {
              originKey,
              schoolId: id,
              userId: userId ?? null,
              mode: 'pt',
              durationMins: result!.durationMins,
              transfers: result!.transfers,
              rawJson: buildRawJson(result!.legs),
            },
            update: {
              durationMins: result!.durationMins,
              transfers: result!.transfers,
              rawJson: buildRawJson(result!.legs),
            },
          })
        )
      );
      for (const { id, result } of toUpsert) {
        results.set(id, result!);
      }
    }
  }

  return results;
}
