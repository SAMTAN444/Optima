import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { UpdateProfileSchema } from '@optima/shared';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /me — return current user profile
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { id: req.user!.profileId },
    });
    if (profile?.banned) {
      res.status(403).json({ ok: false, error: { code: 'BANNED', message: 'Your account has been suspended' } });
      return;
    }
    res.json({ ok: true, data: profile });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch profile' } });
  }
});

// PATCH /me — update home location / display name
router.patch(
  '/',
  authenticate,
  validateBody(UpdateProfileSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { homePostal, homeAddress, homeLat, homeLng, displayName } = req.body;
      const updated = await prisma.userProfile.update({
        where: { id: req.user!.profileId },
        data: {
          ...(homePostal !== undefined && { homePostal }),
          ...(homeAddress !== undefined && { homeAddress }),
          ...(homeLat !== undefined && { homeLat }),
          ...(homeLng !== undefined && { homeLng }),
          ...(displayName !== undefined && { displayName }),
        },
      });
      res.json({ ok: true, data: updated });
    } catch {
      res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to update profile' } });
    }
  }
);

// GET /me/saved-schools — list schools saved by the current user
router.get('/saved-schools', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const saved = await prisma.savedSchool.findMany({
      where: { userId: req.user!.profileId },
      include: {
        school: {
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
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, data: saved.map((s) => s.school) });
  } catch {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch saved schools' } });
  }
});

export default router;
