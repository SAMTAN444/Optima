import { Router, Response } from 'express';
import { AuthRequest, optionalAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { RecommendationRequestSchema } from '@optima/shared';
import { prisma } from '../lib/prisma';
import { getCommutesBatch, geocodePostal, estimateCommute } from '../services/commute';
import {
  SchoolForRanking,
  MustHaves,
  GoodToHaves,
  passesMustHaves,
  passesNonCommuteMustHaves,
  rankSchools,
  detectBottleneck,
} from '../engine/ranking';

const router = Router();

function hasAnyMustHave(mustHaves: MustHaves): boolean {
  return !!(
    mustHaves.maxCommuteMins ||
    (mustHaves.requiredProgrammes?.length) ||
    (mustHaves.requiredSubjectsLanguages?.length) ||
    (mustHaves.requiredCCAs?.length) ||
    (mustHaves.requiredDistinctive?.length)
  );
}

type ResultMode = 'browse' | 'filter' | 'recommendation';

function detectMode(mustHaves: MustHaves, goodToHaves: GoodToHaves): ResultMode {
  if (goodToHaves.rankedCriteria.length > 0) return 'recommendation';
  if (hasAnyMustHave(mustHaves)) return 'filter';
  return 'browse';
}

// Build a SchoolForRanking from DB record
function toSchoolForRanking(school: {
  id: string;
  name: string;
  section: string | null;
  address: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  ccas: { ccaName: string; ccaGroup: string | null }[];
  programmes: { programmeName: string }[];
  subjects: { subjectName: string }[];
  distinctiveProgrammes: { domain: string; title: string }[];
}): SchoolForRanking {
  return {
    id: school.id,
    name: school.name,
    address: school.address,
    postalCode: school.postalCode,
    lat: school.lat,
    lng: school.lng,
    // ccaGroup holds the specific CCA name (e.g. "Basketball"), ccaName holds the broad category
    ccas: school.ccas.map((c) => c.ccaGroup || c.ccaName),
    programmes: school.programmes.map((p) => p.programmeName),
    subjects: school.subjects.map((s) => s.subjectName),
    distinctive: school.distinctiveProgrammes.map((d) => `${d.domain}::${d.title}`),
    commute: null,
  };
}

router.post('/', optionalAuth, validateBody(RecommendationRequestSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { home, mustHaves, goodToHaves, page = 1, pageSize = 15 } = req.body as {
      home: { postal?: string; address?: string; lat?: number; lng?: number };
      mustHaves: MustHaves;
      goodToHaves: GoodToHaves;
      page?: number;
      pageSize?: number;
    };

    // 1. Resolve home coordinates
    let homeLat = home.lat;
    let homeLng = home.lng;
    let originKey = '';

    if (homeLat == null || homeLng == null) {
      if (home.postal) {
        const coords = await geocodePostal(home.postal);
        if (coords) {
          homeLat = coords.lat;
          homeLng = coords.lng;
          originKey = `postal:${home.postal}`;
        } else {
          // Postal passed schema regex but OneMap cannot resolve it
          res.status(400).json({
            ok: false,
            error: {
              code: 'POSTAL_NOT_FOUND',
              message: `Postal code ${home.postal} could not be located. Please verify it is a valid Singapore postal code.`,
            },
          });
          return;
        }
      }
    } else {
      originKey = `coords:${homeLat.toFixed(5)},${homeLng.toFixed(5)}`;
    }

    // Also try user's saved home location if available
    if ((homeLat == null || homeLng == null) && req.user) {
      const profile = await prisma.userProfile.findUnique({ where: { id: req.user.profileId } });
      if (profile?.homeLat && profile?.homeLng) {
        homeLat = profile.homeLat;
        homeLng = profile.homeLng;
        originKey = `profile:${req.user.profileId}`;
      }
    }

    const hasOrigin = homeLat != null && homeLng != null;

    // 2. Load all secondary schools (pure secondary + IP/mixed-level schools)
    // section is returned automatically alongside include relations
    const dbSchools = await prisma.school.findMany({
      where: {
        OR: [
          { section: { contains: 'SECONDARY', mode: 'insensitive' } },
          { section: { startsWith: 'MIXED LEVEL', mode: 'insensitive' } },
        ],
      },
      include: {
        ccas: { select: { ccaName: true, ccaGroup: true } },
        programmes: { select: { programmeName: true } },
        subjects: { select: { subjectName: true } },
        distinctiveProgrammes: { select: { domain: true, title: true } },
      },
    });

    const allSchools = dbSchools.map(toSchoolForRanking);

    // 3. Filter by non-commute must-haves first (cheap)
    const nonCommuteFiltered = allSchools.filter((s) =>
      passesNonCommuteMustHaves(s, mustHaves)
    );

    // 4. Compute commute for pre-filtered schools.
    // Uses batch cache lookup (one DB query) + throttled OneMap calls (max 10 concurrent).
    // Falls back to Haversine estimate per school when OneMap cannot be reached.
    const origin = hasOrigin ? { lat: homeLat!, lng: homeLng! } : null;

    const schoolsNeedingCommute = origin
      ? nonCommuteFiltered.filter((s) => s.lat != null && s.lng != null)
      : [];

    // Batch fetch from cache / OneMap (10 concurrent max)
    const commuteMap = origin && schoolsNeedingCommute.length > 0
      ? await getCommutesBatch(
          originKey,
          origin,
          schoolsNeedingCommute.map((s) => ({ id: s.id, dest: { lat: s.lat!, lng: s.lng! } })),
          { userId: req.user?.profileId, concurrency: 10 }
        )
      : new Map<string, { durationMins: number; transfers: number; legs: never[] }>();

    const schoolsWithCommute: SchoolForRanking[] = nonCommuteFiltered.map((school) => {
      if (!origin || school.lat == null || school.lng == null) {
        return school; // no coordinates — commute stays null
      }
      const cached = commuteMap.get(school.id);
      const commute = cached ?? estimateCommute(origin, { lat: school.lat, lng: school.lng });
      return { ...school, commute };
    });

    // 5. Apply commute must-have filter
    const feasible = schoolsWithCommute.filter((s) => passesMustHaves(s, mustHaves));

    // 6. Handle no results
    if (feasible.length === 0) {
      const mode = detectMode(mustHaves, goodToHaves);
      const bottleneck = detectBottleneck(schoolsWithCommute, mustHaves, goodToHaves);
      res.json({ ok: true, data: { ...bottleneck, mode } });
      return;
    }

    // 7. Detect mode — filter/browse skip the ranking engine entirely
    const mode = detectMode(mustHaves, goodToHaves);

    if (mode !== 'recommendation') {
      // Filter / browse: sort by commute asc (null last), then name, then paginate
      const sorted = feasible.slice().sort((a, b) => {
        if (a.commute == null && b.commute == null) return a.name.localeCompare(b.name);
        if (a.commute == null) return 1;
        if (b.commute == null) return -1;
        return a.commute.durationMins - b.commute.durationMins || a.name.localeCompare(b.name);
      });

      const totalCount = sorted.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const safePage = Math.min(Math.max(1, page), totalPages);
      const start = (safePage - 1) * pageSize;
      const paginated = sorted.slice(start, start + pageSize);

      res.json({
        ok: true,
        data: {
          noResults: false,
          mode,
          candidateCount: feasible.length,
          pagination: { page: safePage, pageSize, totalCount, totalPages },
          schools: paginated.map((s) => ({
            school: {
              id: s.id,
              name: s.name,
              section: null,
              address: s.address,
              postalCode: s.postalCode,
              url: null,
              telephone: null,
              lat: s.lat,
              lng: s.lng,
            },
            commute: s.commute ?? null,
          })),
        },
      });
      return;
    }

    // 8. Score and rank (recommendation mode only)
    const ranked = rankSchools(feasible, mustHaves, goodToHaves);
    const top5 = ranked.slice(0, 5);

    res.json({
      ok: true,
      data: {
        noResults: false,
        mode: 'recommendation',
        candidateCount: feasible.length,
        results: top5,
      },
    });
  } catch (err) {
    console.error('Recommendations error:', err);
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to compute recommendations' } });
  }
});

export default router;
