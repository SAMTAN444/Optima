import { Router, Request, Response, RequestHandler } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireRole';
import { prisma } from '../lib/prisma';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate as unknown as RequestHandler);
router.use(requireAdmin as unknown as RequestHandler);

const REVIEW_INCLUDE = {
  user: { select: { id: true, displayName: true, supabaseUserId: true, banned: true } },
  school: { select: { name: true } },
  reports: {
    include: { reporter: { select: { displayName: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

// GET /admin/reviews — all reviews (any status)
router.get('/reviews', async (_req: Request, res: Response) => {
  try {
    const reviews = await prisma.review.findMany({
      include: REVIEW_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      ok: true,
      data: reviews.map((r) => ({ ...r, reportCount: r.reports.length })),
    });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch reviews' } });
  }
});

// GET /admin/reports — reviews that have at least one report
router.get('/reports', async (_req: Request, res: Response) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { reports: { some: {} } },
      include: REVIEW_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      ok: true,
      data: reviews.map((r) => ({ ...r, reportCount: r.reports.length })),
    });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch reports' } });
  }
});

// POST /admin/reviews/:id/approve
router.post('/reviews/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' },
    });
    res.json({ ok: true, data: review });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to approve review' } });
  }
});

// POST /admin/reviews/:id/reject — hide review from school page (status = REJECTED)
router.post('/reviews/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED' },
    });
    res.json({ ok: true, data: review });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to reject review' } });
  }
});

// POST /admin/reviews/:id/ignore-reports — dismiss all reports, keep review visible (APPROVED)
router.post('/reviews/:id/ignore-reports', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.reviewReport.deleteMany({ where: { reviewId: req.params.id } });
    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' },
    });
    res.json({ ok: true, data: review });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to dismiss reports' } });
  }
});

// DELETE /admin/reviews/:id
router.delete('/reviews/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.reviewReport.deleteMany({ where: { reviewId: req.params.id } });
    await prisma.review.delete({ where: { id: req.params.id } });
    res.json({ ok: true, data: { deleted: true } });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete review' } });
  }
});

// GET /admin/users — all user profiles
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.userProfile.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayName: true,
        supabaseUserId: true,
        role: true,
        banned: true,
        createdAt: true,
        _count: { select: { reviews: true } },
      },
    });
    res.json({ ok: true, data: users });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch users' } });
  }
});

// POST /admin/users/:id/ban — bans user AND deletes all their reviews/reports
router.post('/users/:id/ban', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Delete reports on this user's reviews (foreign key constraint)
    await prisma.reviewReport.deleteMany({ where: { review: { userId: id } } });
    // Delete this user's reviews
    await prisma.review.deleteMany({ where: { userId: id } });
    // Delete reports filed by this user
    await prisma.reviewReport.deleteMany({ where: { reporterUserId: id } });
    // Now ban the user
    const user = await prisma.userProfile.update({
      where: { id },
      data: { banned: true },
      select: { id: true, banned: true },
    });
    res.json({ ok: true, data: user });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to ban user' } });
  }
});

// POST /admin/users/:id/unban
router.post('/users/:id/unban', async (req: Request, res: Response) => {
  try {
    const user = await prisma.userProfile.update({
      where: { id: req.params.id },
      data: { banned: false },
      select: { id: true, banned: true },
    });
    res.json({ ok: true, data: user });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to unban user' } });
  }
});

// POST /admin/users/:id/promote — elevate user to ADMIN role
router.post('/users/:id/promote', async (req: Request, res: Response) => {
  try {
    const user = await prisma.userProfile.update({
      where: { id: req.params.id },
      data: { role: 'ADMIN' },
      select: { id: true, role: true, displayName: true },
    });
    res.json({ ok: true, data: user });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to promote user' } });
  }
});

// POST /admin/users/:id/demote — return user to STUDENT_PARENT role
router.post('/users/:id/demote', async (req: Request, res: Response) => {
  try {
    const user = await prisma.userProfile.update({
      where: { id: req.params.id },
      data: { role: 'STUDENT_PARENT' },
      select: { id: true, role: true, displayName: true },
    });
    res.json({ ok: true, data: user });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to demote user' } });
  }
});

export default router;
