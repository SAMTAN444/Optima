import { Router, Response, Request } from 'express';
import { AuthRequest, optionalAuth } from '../middleware/auth';
import { authenticate } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { CreateReviewSchema, SchoolsQuerySchema } from '@optima/shared';
import { prisma } from '../lib/prisma';
import { geocodePostal, getCommute, getCommutesBatch, estimateCommute } from '../services/commute';

const router = Router();

const IP_SECTION = 'MIXED LEVEL (S1-JC2)';

// GET /schools — secondary schools only, search with filters + pagination
router.get('/', optionalAuth, validateQuery(SchoolsQuerySchema), async (req: Request, res: Response) => {
  try {
    const q = (req as Request & {
      validatedQuery: {
        q?: string;
        page: number;
        pageSize: number;
        programme?: string | string[];
        cca?: string | string[];
        subject?: string | string[];
        ip?: 'ip' | 'olevel';
      };
    }).validatedQuery;

    const { page, pageSize } = q;
    const skip = (page - 1) * pageSize;

    const secondaryAcceptingFilter: Record<string, unknown> = {
      OR: [
        { section: { contains: 'SECONDARY', mode: 'insensitive' } },
        { section: { startsWith: 'MIXED LEVEL', mode: 'insensitive' } },
      ],
    };

    const andFilters: Record<string, unknown>[] = [secondaryAcceptingFilter];

    if (q.ip === 'ip') {
      andFilters.push({ isIp: true });
    } else if (q.ip === 'olevel') {
      andFilters.push({ isIp: false });
    }

    if (q.q) {
      andFilters.push({ name: { contains: q.q, mode: 'insensitive' } });
    }

    if (q.programme) {
      const programmes = Array.isArray(q.programme) ? q.programme : [q.programme];
      andFilters.push({ programmes: { some: { programmeName: { in: programmes } } } });
    }

    if (q.cca) {
      const ccas = Array.isArray(q.cca) ? q.cca : [q.cca];
      andFilters.push({ ccas: { some: { ccaGroup: { in: ccas } } } });
    }

    if (q.subject) {
      const subjects = Array.isArray(q.subject) ? q.subject : [q.subject];
      andFilters.push({ subjects: { some: { subjectName: { in: subjects } } } });
    }

    const where: Record<string, unknown> =
      andFilters.length === 1 ? andFilters[0] : { AND: andFilters };

    const [total, schools] = await Promise.all([
      prisma.school.count({ where }),
      prisma.school.findMany({
        where,
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          section: true,
          address: true,
          postalCode: true,
          url: true,
          telephone: true,
          lat: true,
          lng: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    res.json({
      ok: true,
      data: {
        schools,
        pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch schools' } });
  }
});

// GET /schools/meta — unique CCA/programme/subject values for filter dropdowns
router.get('/meta', async (_req: Request, res: Response) => {
  try {
    const [ccaRows, programmes, subjects, distinctiveRows] = await Promise.all([
      // ccaName = broad category (e.g. "PHYSICAL SPORTS"), ccaGroup = specific CCA (e.g. "BASKETBALL")
      prisma.schoolCCA.findMany({
        select: { ccaName: true, ccaGroup: true },
        where: { ccaGroup: { not: null } },
        orderBy: [{ ccaName: 'asc' }, { ccaGroup: 'asc' }],
      }),
      prisma.schoolProgramme.findMany({ select: { programmeName: true }, distinct: ['programmeName'], orderBy: { programmeName: 'asc' } }),
      prisma.schoolSubject.findMany({ select: { subjectName: true }, distinct: ['subjectName'], orderBy: { subjectName: 'asc' } }),
      prisma.schoolDistinctiveProgramme.findMany({ select: { domain: true, title: true }, orderBy: [{ domain: 'asc' }, { title: 'asc' }] }),
    ]);

    // Build grouped structure (deduplicated)
    const grouped: Record<string, Set<string>> = {};
    for (const { ccaName, ccaGroup } of ccaRows) {
      if (!ccaGroup) continue;
      if (!grouped[ccaName]) grouped[ccaName] = new Set();
      grouped[ccaName].add(ccaGroup);
    }
    const ccasGrouped = Object.entries(grouped)
      .map(([category, ccaSet]) => ({ category, ccas: [...ccaSet].sort() }))
      .sort((a, b) => a.category.localeCompare(b.category));

    // Flat deduplicated list for backwards compat
    const ccas = [...new Set(ccaRows.map((c) => c.ccaGroup!))].sort();

    // Distinctive programmes as "domain::title" strings (same format used in ranking engine)
    const distinctiveProgrammes = [
      ...new Set(distinctiveRows.map((d) => `${d.domain}::${d.title}`)),
    ].sort();

    res.json({
      ok: true,
      data: {
        ccas,
        ccasGrouped,
        programmes: programmes.map((p) => p.programmeName),
        subjects: subjects.map((s) => s.subjectName),
        distinctiveProgrammes,
      },
    });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch meta' } });
  }
});

// GET /schools/nearby — secondary schools reachable within maxMins, sorted by commute time.
// When OneMap is unavailable for a school, falls back to a Haversine-based estimate
// and marks the commute as estimated: true in the response.
router.get('/nearby', async (req: Request, res: Response) => {
  try {
    const {
      postal,
      lat: latStr,
      lng: lngStr,
      maxMins: maxMinsStr,
      page: pageStr,
      pageSize: pageSizeStr,
    } = req.query as Record<string, string>;

    const maxMins = Math.max(1, parseInt(maxMinsStr ?? '30', 10));
    const page = Math.max(1, parseInt(pageStr ?? '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(pageSizeStr ?? '20', 10)));

    let homeLat: number | null = latStr ? parseFloat(latStr) : null;
    let homeLng: number | null = lngStr ? parseFloat(lngStr) : null;
    let originKey = '';

    if ((homeLat == null || homeLng == null) && postal) {
      if (!/^\d{6}$/.test(postal)) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_POSTAL', message: 'Postal code must be exactly 6 digits' } });
        return;
      }
      const coords = await geocodePostal(postal);
      if (!coords) {
        res.status(400).json({ ok: false, error: { code: 'POSTAL_NOT_FOUND', message: `Postal code ${postal} could not be located. Please verify it is a valid Singapore postal code.` } });
        return;
      }
      homeLat = coords.lat;
      homeLng = coords.lng;
      originKey = `postal:${postal}`;
    } else if (homeLat != null && homeLng != null) {
      originKey = `coords:${homeLat.toFixed(5)},${homeLng.toFixed(5)}`;
    } else {
      res.status(400).json({ ok: false, error: { code: 'MISSING_LOCATION', message: 'Provide postal or lat+lng query parameters' } });
      return;
    }

    const dbSchools = await prisma.school.findMany({
      where: {
        OR: [
          { section: { contains: 'SECONDARY', mode: 'insensitive' } },
          { section: { startsWith: 'MIXED LEVEL', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        section: true,
        address: true,
        postalCode: true,
        url: true,
        telephone: true,
        lat: true,
        lng: true,
      },
      orderBy: { name: 'asc' },
    });

    // Compute commute via batch cache + throttled OneMap (max 10 concurrent)
    const origin = { lat: homeLat!, lng: homeLng! };
    const schoolsWithCoords = dbSchools.filter((s) => s.lat != null && s.lng != null);

    const commuteMap = await getCommutesBatch(
      originKey,
      origin,
      schoolsWithCoords.map((s) => ({ id: s.id, dest: { lat: s.lat!, lng: s.lng! } })),
      { concurrency: 10 }
    );

    const withCommute = dbSchools.map((school) => {
      if (school.lat == null || school.lng == null) {
        return { ...school, commute: null };
      }
      const cached = commuteMap.get(school.id);
      const commute = cached ?? estimateCommute(origin, { lat: school.lat!, lng: school.lng! });
      return { ...school, commute };
    });

    // Keep only schools within the time budget; sort ascending by travel time
    const nearby = withCommute
      .filter((s) => s.commute != null && s.commute.durationMins <= maxMins)
      .sort((a, b) => a.commute!.durationMins - b.commute!.durationMins);

    const total = nearby.length;
    const skip = (page - 1) * pageSize;
    const pageSchools = nearby.slice(skip, skip + pageSize);

    res.json({
      ok: true,
      data: {
        schools: pageSchools,
        pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch (err) {
    console.error('Nearby schools error:', err);
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch nearby schools' } });
  }
});

// POST /schools/:id/commute — compute commute from a postal code to this school
router.post('/:id/commute', async (req: Request, res: Response) => {
  try {
    const { postal } = req.body as { postal?: string };
    if (!postal || typeof postal !== 'string' || !/^\d{6}$/.test(postal)) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_POSTAL', message: 'A valid 6-digit postal code is required' } });
      return;
    }

    const school = await prisma.school.findUnique({
      where: { id: req.params.id },
      select: { lat: true, lng: true, postalCode: true },
    });

    if (!school) {
      res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'School not found' } });
      return;
    }

    if (!school.lat || !school.lng) {
      res.status(422).json({ ok: false, error: { code: 'NO_COORDINATES', message: 'School has no GPS coordinates on record' } });
      return;
    }

    const origin = await geocodePostal(postal);
    if (!origin) {
      res.status(400).json({ ok: false, error: { code: 'POSTAL_NOT_FOUND', message: `Postal code ${postal} could not be located. Please verify it is a valid Singapore postal code.` } });
      return;
    }

    const result = await getCommute(
      `postal:${postal}`,
      origin,
      req.params.id,
      { lat: school.lat, lng: school.lng }
    );

    // If OneMap routing failed (expired token, no route), fall back to distance estimate
    const commute = result ?? estimateCommute(origin, { lat: school.lat, lng: school.lng });
    res.json({ ok: true, data: commute });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Commute lookup failed' } });
  }
});

// GET /schools/:id — full school profile
router.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const school = await prisma.school.findUnique({
      where: { id: req.params.id },
      include: {
        ccas: true,
        programmes: true,
        subjects: true,
        distinctiveProgrammes: true,
        reviews: {
          where: { status: 'APPROVED' },
          select: { rating: true },
        },
      },
    });

    if (!school) {
      res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'School not found' } });
      return;
    }

    // Aggregate rating
    const approvedReviews = school.reviews;
    const avgRating =
      approvedReviews.length > 0
        ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length
        : null;

    // Check savedByMe
    let savedByMe = false;
    if (req.user) {
      const saved = await prisma.savedSchool.findUnique({
        where: { userId_schoolId: { userId: req.user.profileId, schoolId: school.id } },
      });
      savedByMe = !!saved;
    }

    const { reviews: _, ...schoolData } = school;

    res.json({
      ok: true,
      data: {
        ...schoolData,
        avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
        reviewCount: approvedReviews.length,
        savedByMe,
      },
    });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch school' } });
  }
});

// GET /schools/:id/reviews — approved reviews only
router.get('/:id/reviews', async (req: Request, res: Response) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { schoolId: req.params.id, status: 'APPROVED' },
      include: { user: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, data: reviews });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch reviews' } });
  }
});

// POST /schools/:id/reviews — create review (auth required)
router.post(
  '/:id/reviews',
  authenticate,
  validateBody(CreateReviewSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { rating, comment } = req.body;

      // Check school exists
      const school = await prisma.school.findUnique({ where: { id: req.params.id } });
      if (!school) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'School not found' } });
        return;
      }

      // Check if user is banned
      const userProfile = await prisma.userProfile.findUnique({ where: { id: req.user!.profileId }, select: { banned: true } });
      if (userProfile?.banned) {
        res.status(403).json({ ok: false, error: { code: 'BANNED', message: 'Your account has been suspended from posting reviews' } });
        return;
      }

      const review = await prisma.review.create({
        data: {
          schoolId: req.params.id,
          userId: req.user!.profileId,
          rating,
          comment,
          status: 'APPROVED',
        },
      });

      res.status(201).json({ ok: true, data: review });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        res.status(409).json({ ok: false, error: { code: 'DUPLICATE', message: 'You have already reviewed this school' } });
        return;
      }
      res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to create review' } });
    }
  }
);

// POST /schools/:id/save — save school
router.post('/:id/save', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.savedSchool.upsert({
      where: { userId_schoolId: { userId: req.user!.profileId, schoolId: req.params.id } },
      create: { userId: req.user!.profileId, schoolId: req.params.id },
      update: {},
    });
    res.json({ ok: true, data: { saved: true } });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to save school' } });
  }
});

// DELETE /schools/:id/save — unsave school
router.delete('/:id/save', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.savedSchool.deleteMany({
      where: { userId: req.user!.profileId, schoolId: req.params.id },
    });
    res.json({ ok: true, data: { saved: false } });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to unsave school' } });
  }
});

export default router;
