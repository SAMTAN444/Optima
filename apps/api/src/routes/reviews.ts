import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { ReportReviewSchema, UpdateReviewSchema } from '@optima/shared';
import { prisma } from '../lib/prisma';

const router = Router();

// POST /reviews/:id/report — report a review
router.post(
  '/:id/report',
  authenticate,
  validateBody(ReportReviewSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      // Check if reporter is banned
      const reporter = await prisma.userProfile.findUnique({ where: { id: req.user!.profileId }, select: { banned: true } });
      if (reporter?.banned) {
        res.status(403).json({ ok: false, error: { code: 'BANNED', message: 'Your account has been suspended' } });
        return;
      }

      const review = await prisma.review.findUnique({ where: { id: req.params.id } });
      if (!review) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Review not found' } });
        return;
      }

      // Prevent self-reporting
      if (review.userId === req.user!.profileId) {
        res.status(403).json({ ok: false, error: { code: 'SELF_REPORT', message: 'You cannot report your own review' } });
        return;
      }

      // Prevent duplicate reports
      const existing = await prisma.reviewReport.findFirst({
        where: { reviewId: req.params.id, reporterUserId: req.user!.profileId },
      });
      if (existing) {
        res.status(409).json({ ok: false, error: { code: 'DUPLICATE', message: 'You have already reported this review' } });
        return;
      }

      await prisma.reviewReport.create({
        data: {
          reviewId: req.params.id,
          reporterUserId: req.user!.profileId,
          reason: req.body.reason,
        },
      });

      res.json({ ok: true, data: { reported: true } });
    } catch {
      res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to report review' } });
    }
  }
);

// PATCH /reviews/:id — edit own review (author only)
router.patch(
  '/:id',
  authenticate,
  validateBody(UpdateReviewSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const review = await prisma.review.findUnique({ where: { id: req.params.id } });
      if (!review) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Review not found' } });
        return;
      }

      if (review.userId !== req.user!.profileId) {
        res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'You can only edit your own reviews' } });
        return;
      }

      const updated = await prisma.review.update({
        where: { id: req.params.id },
        data: {
          rating: req.body.rating,
          comment: req.body.comment,
        },
        include: { user: { select: { displayName: true } } },
      });

      res.json({ ok: true, data: updated });
    } catch {
      res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to update review' } });
    }
  }
);

// DELETE /reviews/:id — hard delete own review (author only)
router.delete(
  '/:id',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const review = await prisma.review.findUnique({ where: { id: req.params.id } });
      if (!review) {
        res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Review not found' } });
        return;
      }

      if (review.userId !== req.user!.profileId) {
        res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'You can only delete your own reviews' } });
        return;
      }

      // Hard delete — cascade removes related ReviewReport rows
      await prisma.review.delete({ where: { id: req.params.id } });

      res.json({ ok: true, data: { deleted: true } });
    } catch {
      res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete review' } });
    }
  }
);

export default router;
