import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * POST /bootstrap-admin
 *
 * One-time endpoint to create the very first admin account.
 * - Requires a valid Supabase JWT (the caller must be signed in).
 * - Succeeds only when zero ADMIN accounts exist in the database.
 * - After one admin exists this endpoint permanently returns 403.
 *
 * Flow:
 *   1. Register a normal account via /register.
 *   2. Sign in and visit /setup in the frontend.
 *   3. Click "Claim admin" — the frontend calls this endpoint.
 *   4. Re-sign-in so the new role is reflected in the session.
 */
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const adminCount = await prisma.userProfile.count({ where: { role: 'ADMIN' } });

    if (adminCount > 0) {
      res.status(403).json({
        ok: false,
        error: {
          code: 'BOOTSTRAP_DISABLED',
          message: 'An admin account already exists. Ask your admin to promote you.',
        },
      });
      return;
    }

    const profile = await prisma.userProfile.update({
      where: { id: req.user!.profileId },
      data: { role: 'ADMIN' },
    });

    res.json({ ok: true, data: profile });
  } catch {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to bootstrap admin' },
    });
  }
});

export default router;
